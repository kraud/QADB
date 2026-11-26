import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient, type Client, type InStatement } from '@libsql/client/http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isLocalUrl } from '../../scripts/db/guard.mjs'
import { migrate } from '../../scripts/db/migrate.mjs'
import * as scenarios from '../../scripts/db/migrations/0001-scenarios.mjs'
import { startDbServer } from '../support/db-server'
import {
  KRAUD_ATTEMPTS,
  KRAUD_QUESTIONS,
  insertAttempt,
  insertQuestion,
  seedLegacy,
} from '../support/legacy-fixture'

const ALL = ['0000-baseline', '0001-scenarios']
const CLI = fileURLToPath(new URL('../../scripts/db/migrate.mjs', import.meta.url))

let server: Awaited<ReturnType<typeof startDbServer>>
let client: Client

beforeEach(async () => {
  server = await startDbServer()
  client = createClient({ url: server.url })
})

afterEach(async () => {
  client.close()
  await server.stop()
})

/** Plain objects, so rows compare structurally. */
async function rows(sql: string): Promise<Record<string, unknown>[]> {
  const result = await client.execute(sql)
  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, i) => [column, row[i]])))
}

async function count(table: string) {
  return Number((await rows(`select count(*) as n from ${table}`))[0]!.n)
}

/** The whole schema and every row. */
async function snapshot() {
  const schema = await rows('select type, name, tbl_name, sql from sqlite_schema order by type, name')
  const data: Record<string, unknown[]> = {}
  for (const entry of schema) {
    if (entry.type === 'table') data[String(entry.name)] = await rows(`select * from "${entry.name}" order by 1, 2`)
  }
  return { schema, data }
}

/** A client that lets `statement` through just before `migrate` writes, as if the app were still in use. */
function writingBeforeMigrate(statement: string) {
  const racing = {
    /** The database right after that statement. */
    afterWrite: undefined as Awaited<ReturnType<typeof snapshot>> | undefined,
    client: {
      execute: client.execute.bind(client),
      batch: client.batch.bind(client),
      migrate: async (statements: InStatement[]) => {
        await client.execute(statement)
        racing.afterWrite = await snapshot()
        return client.migrate(statements)
      },
    } as unknown as Client,
  }
  return racing
}

const OPTION_ROWS = `
  select s.user_id, a.name as attribute, o.label, count(qo.question_id) as n
  from options o
  join attributes a on a.id = o.attribute_id
  join scenarios s on s.id = a.scenario_id
  left join question_options qo on qo.option_id = o.id
  group by o.id order by s.user_id, a.position, o.position`

describe('migrating the legacy data', () => {
  beforeEach(async () => {
    await seedLegacy(client)
  })

  it('creates one scenario with the attributes, options, colors and defaults above', async () => {
    const before = Date.now()
    expect(await migrate(client)).toEqual(['0001-scenarios'])

    const created = await rows('select * from scenarios')
    expect(created).toEqual([
      expect.objectContaining({ user_id: 'u-kraud', name: 'Front-end interview questions' }),
    ])
    expect(Number(created[0]!.created_at)).toBeGreaterThanOrEqual(before)
    expect(created[0]!.updated_at).toBe(created[0]!.created_at)

    const attributes = await rows(
      'select name, selection_mode, ordered, required, position from attributes order by position',
    )
    expect(attributes.map((row) => Object.values(row))).toEqual([
      ['Difficulty', 'single', 1, 1, 0],
      ['Importance', 'single', 1, 1, 1],
      ['Category', 'multiple', 0, 1, 2],
    ])

    const options = await rows(`
      select a.name, o.label, o.color, o.position, o.is_default
      from options o join attributes a on a.id = o.attribute_id order by a.position, o.position`)
    expect(options.map((row) => Object.values(row))).toEqual([
      ['Difficulty', 'Easy', 'blue-1', 0, 0],
      ['Difficulty', 'Medium', 'blue-2', 1, 1],
      ['Difficulty', 'Hard', 'blue-3', 2, 0],
      ['Importance', 'Low', 'gray-1', 0, 0],
      ['Importance', 'Mid', 'gray-2', 1, 1],
      ['Importance', 'High', 'gray-3', 2, 0],
      ['Category', 'HTML', 'orange', 0, 0],
      ['Category', 'CSS', 'cyan', 1, 0],
      ['Category', 'JS', 'yellow', 2, 1],
      ['Category', 'API', 'violet', 3, 0],
      ['Category', 'React', 'green', 4, 0],
      ['Category', 'Domain', 'pink', 5, 0],
    ])
  })

  it('keeps question ids, text, link, mastered and timestamps, with answer_summary as answer', async () => {
    await migrate(client)

    const [{ id: scenarioId }] = (await rows('select id from scenarios')) as [{ id: string }]
    expect(await rows('select * from questions order by id')).toEqual(
      KRAUD_QUESTIONS.map((q) => ({
        id: q.id,
        scenario_id: scenarioId,
        question: q.question,
        answer: q.answer_summary,
        link: q.link,
        mastered: q.mastered,
        created_at: q.created_at,
        updated_at: q.updated_at,
      })),
    )
  })

  it('writes exactly the options each question had', async () => {
    await migrate(client)

    const pairs = await rows(`
      select qo.question_id as q, a.name || ':' || o.label as value
      from question_options qo
      join options o on o.id = qo.option_id
      join attributes a on a.id = o.attribute_id
      order by qo.question_id, a.position, o.position`)
    const byQuestion: Record<string, string[]> = {}
    for (const { q, value } of pairs) (byQuestion[String(q)] ??= []).push(String(value))

    expect(byQuestion).toEqual({
      q1: ['Difficulty:Easy', 'Importance:Low', 'Category:HTML'],
      q2: ['Difficulty:Medium', 'Importance:Mid', 'Category:CSS', 'Category:JS'],
      q3: ['Difficulty:Hard', 'Importance:High', 'Category:API'],
      q4: ['Difficulty:Medium', 'Importance:Mid', 'Category:React', 'Category:Domain'],
    })
  })

  it('keeps every attempt of remaining users unchanged', async () => {
    await migrate(client)

    expect(await rows('select * from attempts order by id')).toEqual(KRAUD_ATTEMPTS)
  })

  it('removes the named test accounts and their rows; keeps accounts without questions, with no scenario', async () => {
    const kept = await rows(`select * from users where id in ('u-kraud', 'u-empty') order by id`)
    await migrate(client)

    expect(await rows('select * from users order by id')).toEqual(kept)
    expect(await count('questions')).toBe(4)
    expect(await count('attempts')).toBe(5)
    expect(await rows('select user_id from scenarios')).toEqual([{ user_id: 'u-kraud' }])
  })

  it('creates a separate scenario for each user with questions', async () => {
    await insertQuestion(client, { ...KRAUD_QUESTIONS[0]!, id: 'q-other', user_id: 'u-empty' })
    await migrate(client)

    expect(await count('scenarios')).toBe(2)
    const counts = (await rows(OPTION_ROWS)).filter((row) => row.user_id === 'u-empty' && row.n !== 0)
    expect(counts.map((row) => `${row.label}:${row.n}`)).toEqual(['Easy:1', 'Low:1', 'HTML:1'])
    expect(
      await rows(`
        select count(*) as n from question_options qo
        join questions q on q.id = qo.question_id
        join options o on o.id = qo.option_id
        join attributes a on a.id = o.attribute_id
        where a.scenario_id <> q.scenario_id`),
    ).toEqual([{ n: 0 }])
  })

  it('creates the new tables with an index on every foreign key column', async () => {
    await migrate(client)

    const tables = await rows(`select name from sqlite_schema where type = 'table' order by name`)
    expect(tables.map((row) => row.name).filter((name) => !String(name).startsWith('sqlite_'))).toEqual([
      '_migrations',
      'attempts',
      'attributes',
      'options',
      'question_options',
      'questions',
      'scenarios',
      'users',
    ])

    for (const table of ['scenarios', 'attributes', 'options', 'questions', 'question_options', 'attempts']) {
      const foreignKeys = await rows(`select "from" as col from pragma_foreign_key_list('${table}')`)
      expect(foreignKeys.length, table).toBeGreaterThan(0)
      for (const { col } of foreignKeys) {
        const indexed = await rows(`
          select 1 from pragma_index_list('${table}') l, pragma_index_info(l.name) i
          where i.seqno = 0 and i.name = '${col}'`)
        expect(indexed.length, `${table}.${col}`).toBeGreaterThan(0)
      }
    }
  })

  it('leaves no foreign key violations and cascades still delete afterwards', async () => {
    await migrate(client)

    expect(await rows('select * from pragma_foreign_key_check')).toEqual([])
    expect(await rows('pragma foreign_keys')).toEqual([{ foreign_keys: 1 }])

    // A question takes its attempts and option rows with it.
    await client.execute(`delete from questions where id = 'q1'`)
    expect(await count(`attempts where question_id = 'q1'`)).toBe(0)
    expect(await count(`question_options where question_id = 'q1'`)).toBe(0)
    expect(await count('attempts')).toBe(3)

    // An option takes only its option rows.
    await client.execute(`delete from options where label = 'API'`)
    expect(await count('question_options')).toBe(10)
    expect(await count('questions')).toBe(3)

    // A user takes everything.
    await client.execute(`delete from users where id = 'u-kraud'`)
    for (const table of ['scenarios', 'attributes', 'options', 'questions', 'question_options', 'attempts']) {
      expect(await count(table), table).toBe(0)
    }
  })

  it('records both migrations', async () => {
    await migrate(client)

    expect((await rows('select id from _migrations order by id')).map((row) => row.id)).toEqual(ALL)
  })

  it.each([
    ['difficulty "extreme"', 'difficulty', 'extreme'],
    ['importance "urgent"', 'importance', 'urgent'],
    ['difficulty "Easy"', 'difficulty', 'Easy'],
    ['category "Vue"', 'category', '["JS","Vue"]'],
    ['category "not json"', 'category', 'not json'],
    ['category "[]"', 'category', '[]'],
    ['category "\\"JS\\""', 'category', '"JS"'],
    ['category "[1]"', 'category', '[1]'],
  ])('aborts and changes nothing for %s', async (_name, column, value) => {
    await client.execute({ sql: `update questions set ${column} = ? where id = 'q3'`, args: [value] })
    const before = await snapshot()

    await expect(migrate(client)).rejects.toThrow(/\bq3\b/)

    expect(await snapshot()).toEqual(before)
  })

  it('aborts and changes nothing when a kept user attempted a removed question', async () => {
    await insertAttempt(client, { ...KRAUD_ATTEMPTS[0]!, id: 'a-cross', question_id: 'q9' })
    const before = await snapshot()

    await expect(migrate(client)).rejects.toThrow(/a-cross/)

    expect(await snapshot()).toEqual(before)
  })

  it('aborts and changes nothing when a question has no owner', async () => {
    await client.migrate([`update questions set user_id = 'nobody' where id = 'q2'`])
    const before = await snapshot()

    await expect(migrate(client)).rejects.toThrow(/\bq2\b/)

    expect(await snapshot()).toEqual(before)
  })

  it('aborts and changes nothing when the questions table has an unknown column', async () => {
    await client.execute('alter table questions add column notes text')
    const before = await snapshot()

    await expect(migrate(client)).rejects.toThrow(/notes/)

    expect(await snapshot()).toEqual(before)
  })

  it('rolls back on a foreign key violation that was already there', async () => {
    await client.migrate([
      `insert into attempts (id, question_id, user_id, correct) values ('a-orphan', 'gone', 'u-kraud', 1)`,
    ])
    const before = await snapshot()

    await expect(migrate(client)).rejects.toThrow(/foreign key/i)

    expect(await snapshot()).toEqual(before)
  })

  it.each(['1 = 0', 'null'])('rolls back when a verification guard fails (%s)', async (condition) => {
    const before = await snapshot()

    await expect(scenarios.up(client, { extraGuards: [condition] })).rejects.toThrow(/extra guard 1/)

    expect(await snapshot()).toEqual(before)
    expect(await rows('pragma foreign_keys')).toEqual([{ foreign_keys: 1 }])
  })

  it.each([
    ['a category changes', `update questions set category = '["CSS"]' where id = 'q1'`],
    [
      'a question is added',
      `insert into questions (id, user_id, question, answer_summary, difficulty, importance, category)
       values ('q-late', 'u-kraud', 'Late', 'Late', 'easy', 'low', '["JS"]')`,
    ],
    [
      'an attempt is recorded',
      `insert into attempts (id, question_id, user_id, correct) values ('a-late', 'q1', 'u-kraud', 1)`,
    ],
  ])('rolls back when %s between reading and writing', async (_name, statement) => {
    const racing = writingBeforeMigrate(statement)

    await expect(scenarios.up(racing.client)).rejects.toThrow(/rolled back/)

    expect(racing.afterWrite).toBeDefined()
    expect(await snapshot()).toEqual(racing.afterWrite)
  })

  it('copies text edited between reading and writing as it is at writing time', async () => {
    const racing = writingBeforeMigrate(`update questions set answer_summary = 'Edited' where id = 'q1'`)

    await scenarios.up(racing.client)

    expect(await rows(`select answer from questions where id = 'q1'`)).toEqual([{ answer: 'Edited' }])
  })

  it('does nothing on a second run', async () => {
    await migrate(client)
    const before = await snapshot()
    const log: string[] = []

    expect(await migrate(client, { log: (line) => log.push(line) })).toEqual([])

    expect(await snapshot()).toEqual(before)
    expect(log.join('\n')).toMatch(/nothing to do/i)
  })
})

describe('an empty database', () => {
  it('applies cleanly to an empty database', async () => {
    expect(await migrate(client)).toEqual(ALL)

    expect((await rows('select id from _migrations order by id')).map((row) => row.id)).toEqual(ALL)
    for (const table of ['users', 'scenarios', 'attributes', 'options', 'questions', 'question_options', 'attempts']) {
      expect(await count(table), table).toBe(0)
    }
    expect(await migrate(client)).toEqual([])
  })
})

describe('the command line', () => {
  function run(url: string | undefined, ...args: string[]) {
    // Only what the script needs: nothing from the developer's shell can point it elsewhere.
    const env: Record<string, string> = { PATH: process.env.PATH ?? '' }
    if (url !== undefined) env.NUXT_TURSO_URL = url
    return spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8', timeout: 20_000 })
  }

  it('migrates the local database named by NUXT_TURSO_URL', async () => {
    await seedLegacy(client)

    const result = run(server.url)

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('0001-scenarios')
    expect(await count('scenarios')).toBe(1)
  })

  it('exits with an error when a value does not map', async () => {
    await seedLegacy(client)
    await client.execute(`update questions set difficulty = 'extreme' where id = 'q3'`)

    const result = run(server.url)

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/\bq3\b/)
  })

  it('refuses a remote database without --allow-remote', () => {
    // `.invalid` never resolves, so nothing can be reached even if the refusal broke.
    const result = run('libsql://qadb.example.invalid')

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/--allow-remote/)
  })

  it('refuses to run without a database address', () => {
    const result = run(undefined)

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/NUXT_TURSO_URL/)
  })

  it('refuses unknown arguments', async () => {
    const result = run(server.url, '--force')

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/--force/)
    expect(await count('sqlite_schema')).toBe(0)
  })
})

describe('isLocalUrl', () => {
  it.each([
    'http://127.0.0.1:8080',
    'http://localhost:8080',
    'http://[::1]:8080',
    'libsql://127.0.0.1:8080',
    'ws://localhost',
  ])('accepts %s', (url) => {
    expect(isLocalUrl(url)).toBe(true)
  })

  it('isLocalUrl rejects libsql:// remote hosts', () => {
    expect(isLocalUrl('libsql://qadb-someone.turso.io')).toBe(false)
  })

  it.each([
    'https://qadb.example.invalid',
    'http://127.0.0.1.example.invalid',
    'http://localhost.example.invalid',
    'http://127.0.0.1@example.invalid',
    'http://example.invalid@127.0.0.1',
    'libsql://example.invalid\\@127.0.0.1',
    'http://example.invalid/?host=localhost',
    'http://0.0.0.0:8080',
    'file:dev.db',
    '127.0.0.1:8080',
    '',
  ])('rejects %j', (url) => {
    expect(isLocalUrl(url)).toBe(false)
  })
})
