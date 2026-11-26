// Replaces the local database with a backup, so the migration can be rehearsed repeatedly.
//
//   pnpm db:reset-local [backup.db]     (default: the newest in ~/Documents/Backups/QADB/)
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { createId } from '@paralleldrive/cuid2'
import { hashPassword } from '../../server/utils/password.ts'
import { loadTestUser } from '../../tests/support/test-user.ts'

const ROOT = fileURLToPath(new URL('../../.localdb', import.meta.url))
const BACKUPS = join(homedir(), 'Documents', 'Backups', 'QADB')
const PORT = 8080

/** The most recently modified `.db` file of the directory. */
export function newestBackup(dir = BACKUPS) {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.db'))
    .map((name) => join(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (!files.length) throw new Error(`No .db backup in ${dir}`)
  return files[0]
}

function answers(host, port) {
  return new Promise((done) => {
    const socket = connect({ host, port })
    const finish = (result) => {
      socket.destroy()
      done(result)
    }
    socket.setTimeout(1000, () => finish(true))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

function bindable(port) {
  return new Promise((done) => {
    const server = createServer()
    server.once('error', () => done(false))
    server.listen(port, '127.0.0.1', () => server.close(() => done(true)))
  })
}

async function assertPortFree(port) {
  if ((await answers('127.0.0.1', port)) || (await answers('::1', port)) || !(await bindable(port))) {
    throw new Error(`Port ${port} is in use. Stop the local database (pnpm db:local) first.`)
  }
}

/** The backup predates the local test account, so it is added again when missing. */
async function ensureTestUser(db) {
  const { username, password } = loadTestUser()
  if (db.prepare('select 1 from users where username = ?').get(username)) return false

  const passwordHash = await hashPassword(password)
  db.prepare('insert into users (id, username, password_hash) values (?, ?, ?)').run(createId(), username, passwordHash)
  return true
}

/** Whether the file lies in the directory, links followed and spelled as on disk. */
function isInside(file, dir) {
  if (!existsSync(dir)) return false
  const path = relative(realpathSync.native(dir), realpathSync.native(file))
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}

/**
 * Recreates `<root>/dbs/default/data` from a backup and discards all other server state. The backup
 * is only read. The copy is prepared and checked first, so a failure keeps the current database.
 *
 * @param {{ source: string, root?: string, port?: number, log?: (line: string) => void }} opts
 */
export async function resetLocal({ source, root = ROOT, port = PORT, log = () => {} }) {
  await assertPortFree(port)
  const from = resolve(source)
  if (!statSync(from).isFile()) throw new Error(`${from} is not a file`)
  // It would be deleted along with the database it replaces.
  if (isInside(from, root)) {
    throw new Error(`${from} is inside the local database directory, which gets cleared. Copy it elsewhere first.`)
  }

  // The database holds password hashes: only the owner may read it.
  mkdirSync(root, { recursive: true, mode: 0o700 })
  chmodSync(root, 0o700)
  const staging = mkdtempSync(join(root, '.restore-'))
  try {
    // `.backup` takes a consistent copy. It runs inside `staging`, so the name needs no quoting.
    execFileSync('sqlite3', ['-bail', '-readonly', from, '.backup data'], { cwd: staging, stdio: 'pipe' })
    const copy = join(staging, 'data')
    chmodSync(copy, 0o600)

    const db = new DatabaseSync(copy)
    try {
      const check = db.prepare('pragma integrity_check').get()
      if (check.integrity_check !== 'ok') throw new Error(`${from} fails the integrity check`)
      if (await ensureTestUser(db)) log('Added the test account from .env.testuser')
    } finally {
      db.close()
    }

    await assertPortFree(port)
    // Anything left over (WAL files, replication log, metadata) would override the restored file.
    for (const name of readdirSync(root)) {
      if (join(root, name) !== staging) rmSync(join(root, name), { recursive: true, force: true })
    }
    const target = join(root, 'dbs', 'default')
    mkdirSync(target, { recursive: true, mode: 0o700 })
    renameSync(copy, join(target, 'data'))
    log(`Restored ${from} to ${join(target, 'data')}`)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  try {
    if (args.length > 1 || args[0]?.startsWith('-')) throw new Error('Usage: pnpm db:reset-local [backup.db]')
    await resetLocal({ source: args[0] ?? newestBackup(), log: console.log })
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
  }
}
