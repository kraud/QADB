import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createClient } from '@libsql/client/http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { verifyPassword } from '../../server/utils/password'
import { newestBackup, resetLocal } from '../../scripts/db/reset-local.mjs'
import { LEGACY_SCHEMA } from '../support/legacy-fixture'
import { loadTestUser } from '../support/test-user'

let dir: string
let backup: string
let root: string
let data: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'qadb-reset-'))
  backup = join(dir, 'backup.db')
  root = join(dir, '.localdb')
  data = join(root, 'dbs', 'default', 'data')
  const db = new DatabaseSync(backup)
  db.exec(LEGACY_SCHEMA)
  db.exec(`insert into users (id, username, password_hash) values ('u1', 'someone', 'x')`)
  db.close()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

/** A port with nothing listening on it. */
function freePort() {
  return new Promise<number>((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}

function readUsers() {
  const db = new DatabaseSync(data, { readOnly: true })
  try {
    return db.prepare('select username, password_hash from users order by username').all() as {
      username: string
      password_hash: string
    }[]
  } finally {
    db.close()
  }
}

describe('resetLocal', () => {
  it('restores the backup, privately and without touching it, replacing all server state', async () => {
    mkdirSync(join(root, 'dbs', 'default'), { recursive: true })
    for (const name of ['dbs/default/data', 'dbs/default/data-wal', 'dbs/default/wallog', 'metastore']) {
      writeFileSync(join(root, name), 'stale')
    }
    const before = digest(backup)

    await resetLocal({ source: backup, root, port: await freePort() })

    expect(digest(backup)).toBe(before)
    for (const name of ['dbs/default/data-wal', 'dbs/default/wallog', 'metastore']) {
      expect(existsSync(join(root, name)), name).toBe(false)
    }
    expect(statSync(data).mode & 0o777).toBe(0o600)
    expect(statSync(root).mode & 0o777).toBe(0o700)
    expect(readUsers().map((user) => user.username)).toContain('someone')
  })

  it('adds the .env.testuser account with a hash the app accepts', async () => {
    const { username, password } = loadTestUser()

    await resetLocal({ source: backup, root, port: await freePort() })

    const user = readUsers().find((row) => row.username === username)!
    expect(user.password_hash.startsWith('argon2$')).toBe(true)
    expect(await verifyPassword(user.password_hash, password)).toBe(true)
  })

  it('leaves an existing test account alone', async () => {
    const { username } = loadTestUser()
    const db = new DatabaseSync(backup)
    db.prepare(`insert into users (id, username, password_hash) values ('u2', ?, 'kept')`).run(username)
    db.close()

    await resetLocal({ source: backup, root, port: await freePort() })

    expect(readUsers().filter((row) => row.username === username)).toEqual([{ username, password_hash: 'kept' }])
  })

  it('produces a database that sqld serves', async () => {
    await resetLocal({ source: backup, root, port: await freePort() })

    const port = await freePort()
    const child = spawn('sqld', ['--no-welcome', '-d', root, '--http-listen-addr', `127.0.0.1:${port}`], {
      stdio: 'ignore',
    })
    const closed = new Promise((resolve) => child.once('close', resolve))
    const client = createClient({ url: `http://127.0.0.1:${port}` })
    try {
      await expect.poll(() => fetch(`http://127.0.0.1:${port}/health`).then((r) => r.ok, () => false)).toBe(true)
      const result = await client.execute(`select count(*) from users where id = 'u1'`)
      expect(Number(result.rows[0]![0])).toBe(1)
    } finally {
      client.close()
      child.kill('SIGKILL')
      await closed
    }
  })

  it('stops, changing nothing, when the port is in use', async () => {
    mkdirSync(join(root, 'dbs', 'default'), { recursive: true })
    writeFileSync(data, 'current')
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }

    try {
      await expect(resetLocal({ source: backup, root, port })).rejects.toThrow(/in use/)
    } finally {
      server.close()
    }

    expect(readFileSync(data, 'utf8')).toBe('current')
  })

  it.each([
    ['a missing file', () => join(dir, 'missing.db')],
    [
      'a file that is not a database',
      () => {
        writeFileSync(join(dir, 'text.db'), 'not a database')
        return join(dir, 'text.db')
      },
    ],
  ])('keeps the current database when the source is %s', async (_name, source) => {
    mkdirSync(join(root, 'dbs', 'default'), { recursive: true })
    writeFileSync(data, 'current')

    await expect(resetLocal({ source: source(), root, port: await freePort() })).rejects.toThrow()

    expect(readFileSync(data, 'utf8')).toBe('current')
  })

  /** A current database, and a restorable copy of the backup beside it, inside the root. */
  function databaseInRoot() {
    mkdirSync(join(root, 'dbs', 'default'), { recursive: true })
    writeFileSync(data, 'current')
    const inside = join(root, 'inside.db')
    copyFileSync(backup, inside)
    return inside
  }

  it.each([
    ['a file in it', (inside: string) => inside],
    [
      'a link to a file in it',
      (inside: string) => {
        const link = join(dir, 'link.db')
        symlinkSync(inside, link)
        return link
      },
    ],
    [
      'a file reached through a link to it',
      () => {
        symlinkSync(root, join(dir, 'linked'))
        return join(dir, 'linked', 'inside.db')
      },
    ],
  ])('refuses, changing nothing, a source in the directory it clears: %s', async (_name, source) => {
    const inside = databaseInRoot()

    await expect(resetLocal({ source: source(inside), root, port: await freePort() })).rejects.toThrow(
      /inside the local database directory/,
    )

    expect(digest(inside)).toBe(digest(backup))
    expect(readFileSync(data, 'utf8')).toBe('current')
  })

  it('refuses such a source also when the directory is named through a link', async () => {
    const inside = databaseInRoot()
    const linked = join(dir, 'linked')
    symlinkSync(root, linked)

    await expect(resetLocal({ source: inside, root: linked, port: await freePort() })).rejects.toThrow(
      /inside the local database directory/,
    )

    expect(existsSync(inside)).toBe(true)
  })

  // Only where the file system ignores case does the other spelling name the same file.
  it.skipIf(!existsSync(import.meta.filename.toUpperCase()))('is not fooled by another spelling', async () => {
    databaseInRoot()
    const source = join(dir, '.LOCALDB', 'inside.db')

    await expect(resetLocal({ source, root, port: await freePort() })).rejects.toThrow(
      /inside the local database directory/,
    )
  })

  it('accepts a source beside the directory whose name begins like it', async () => {
    mkdirSync(`${root}-copies`)
    const beside = join(`${root}-copies`, 'backup.db')
    copyFileSync(backup, beside)

    await resetLocal({ source: beside, root, port: await freePort() })

    expect(readUsers().map((user) => user.username)).toContain('someone')
  })

  it('picks the newest .db file as the default backup', () => {
    const older = join(dir, 'older.db')
    writeFileSync(older, '')
    utimesSync(older, new Date(0), new Date(0))
    writeFileSync(join(dir, 'newer.sql'), '')

    expect(newestBackup(dir)).toBe(backup)
  })
})
