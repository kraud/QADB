// Replaces the fixed difficulty, importance and category columns with user-defined scenarios.
//
// Everything is read and validated here, then every write runs in one `client.migrate()` call: a
// single transaction with foreign keys off. So dropping the old `questions` table keeps
// `attempts`, nothing cascades, and a failed check rolls the whole migration back.
import { createId } from '@paralleldrive/cuid2'

export const id = '0001-scenarios'

const SCENARIO_NAME = 'Front-end interview questions'

const REMOVED_USERNAMES = [
  'qadb-verify-0817',
  'uitest',
  'fuzzsearch_test_2026',
  'verif_ta_814',
  'smoketest_260815',
]

/** `values` maps what the old column stores to the new option label. */
const ATTRIBUTES = [
  {
    name: 'Difficulty',
    column: 'difficulty',
    mode: 'single',
    ordered: 1,
    required: 1,
    options: [
      { value: 'easy', label: 'Easy', color: 'blue-1' },
      { value: 'medium', label: 'Medium', color: 'blue-2', isDefault: true },
      { value: 'hard', label: 'Hard', color: 'blue-3' },
    ],
  },
  {
    name: 'Importance',
    column: 'importance',
    mode: 'single',
    ordered: 1,
    required: 1,
    options: [
      { value: 'low', label: 'Low', color: 'gray-1' },
      { value: 'mid', label: 'Mid', color: 'gray-2', isDefault: true },
      { value: 'high', label: 'High', color: 'gray-3' },
    ],
  },
  {
    name: 'Category',
    column: 'category',
    mode: 'multiple',
    ordered: 0,
    required: 1,
    options: [
      { value: 'HTML', label: 'HTML', color: 'orange' },
      { value: 'CSS', label: 'CSS', color: 'cyan' },
      { value: 'JS', label: 'JS', color: 'yellow', isDefault: true },
      { value: 'API', label: 'API', color: 'violet' },
      { value: 'React', label: 'React', color: 'green' },
      { value: 'Domain', label: 'Domain', color: 'pink' },
    ],
  },
]

/** The old `questions` table. Any other column would be lost, so it aborts the migration. */
const LEGACY_COLUMNS = [
  'id',
  'user_id',
  'question',
  'answer_summary',
  'difficulty',
  'importance',
  'category',
  'link',
  'mastered',
  'created_at',
  'updated_at',
]

const NOW_MS = `(CAST(strftime('%s', 'now') AS INTEGER) * 1000)`

const CREATE_TABLES = [
  `create table scenarios (
    id text primary key not null,
    user_id text not null references users(id) on delete cascade,
    name text not null,
    created_at integer not null default ${NOW_MS},
    updated_at integer not null default ${NOW_MS}
  )`,
  `create table attributes (
    id text primary key not null,
    scenario_id text not null references scenarios(id) on delete cascade,
    name text not null,
    selection_mode text not null,
    ordered integer not null default 0,
    required integer not null default 0,
    position integer not null
  )`,
  `create table options (
    id text primary key not null,
    attribute_id text not null references attributes(id) on delete cascade,
    label text not null,
    color text not null,
    position integer not null,
    is_default integer not null default 0
  )`,
  // Renamed to `questions` once the old table is gone.
  `create table questions_new (
    id text primary key not null,
    scenario_id text not null references scenarios(id) on delete cascade,
    question text not null,
    answer text not null,
    link text,
    mastered integer not null default 0,
    created_at integer not null default ${NOW_MS},
    updated_at integer not null default ${NOW_MS}
  )`,
  `create table question_options (
    question_id text not null references questions(id) on delete cascade,
    option_id text not null references options(id) on delete cascade,
    primary key (question_id, option_id)
  )`,
]

// The primary key of `question_options` already indexes `question_id`.
const CREATE_INDEXES = [
  'create index scenarios_user_id_idx on scenarios (user_id)',
  'create index attributes_scenario_id_idx on attributes (scenario_id)',
  'create index options_attribute_id_idx on options (attribute_id)',
  'create index questions_scenario_id_idx on questions (scenario_id)',
  'create index question_options_option_id_idx on question_options (option_id)',
]

/** True when both queries return the same set of rows. */
function sameRows(a, b) {
  return `not exists (select * from (${a}) except select * from (${b}))
    and not exists (select * from (${b}) except select * from (${a}))`
}

// The two comparisons below read the old table inside the transaction, independently of the
// JavaScript mapping. They also catch writes made after the data was read.

const SAME_QUESTIONS = sameRows(
  `select id, user_id, question, answer_summary, link, mastered, created_at, updated_at from questions`,
  `select q.id, s.user_id, q.question, q.answer, q.link, q.mastered, q.created_at, q.updated_at
   from questions_new q join scenarios s on s.id = q.scenario_id`,
)

function legacyOptionSets() {
  return ATTRIBUTES.map(({ name, column, mode, options }) => {
    if (mode === 'multiple') {
      return `select q.id, '${name}', j.value from questions q, json_each(q.${column}) j`
    }
    const cases = options.map(({ value, label }) => `when '${value}' then '${label}'`).join(' ')
    return `select id, '${name}', case ${column} ${cases} end from questions`
  }).join(' union ')
}

const SAME_OPTION_SETS = sameRows(
  legacyOptionSets(),
  `select qo.question_id, a.name, o.label from question_options qo
   join options o on o.id = qo.option_id join attributes a on a.id = o.attribute_id`,
)

const OPTIONS_IN_OWN_SCENARIO = `not exists (
  select 1 from question_options qo
  join questions_new q on q.id = qo.question_id
  join options o on o.id = qo.option_id
  join attributes a on a.id = o.attribute_id
  where a.scenario_id <> q.scenario_id)`

/** The option labels a question gets for one attribute, or null if its stored value does not map. */
function mapValue(attribute, stored) {
  let values = [stored]
  if (attribute.mode === 'multiple') {
    try {
      values = JSON.parse(stored)
    } catch {
      return null
    }
    if (!Array.isArray(values) || !values.length) return null
  }
  const labels = values.map((value) => attribute.options.find((option) => option.value === value)?.label)
  return labels.includes(undefined) ? null : [...new Set(labels)]
}

/** Reads the source in one transaction and throws, listing every problem, if it cannot be migrated. */
async function readSource(client) {
  const [columns, users, questions, attempts] = await client.batch(
    [
      `select name from pragma_table_info('questions')`,
      'select id, username from users',
      'select id, user_id, difficulty, importance, category from questions',
      'select id, user_id, question_id from attempts',
    ],
    'read',
  )

  const found = columns.rows.map((row) => String(row.name))
  const unexpected = found.filter((name) => !LEGACY_COLUMNS.includes(name))
  const missing = LEGACY_COLUMNS.filter((name) => !found.includes(name))
  if (unexpected.length || missing.length) {
    throw new Error(
      `${id} aborted, nothing was changed: the questions table is not the expected one ` +
        `(unexpected columns: ${unexpected.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'})`,
    )
  }

  const removed = users.rows.filter((user) => REMOVED_USERNAMES.includes(user.username))
  const removedIds = new Set(removed.map((user) => user.id))
  const kept = users.rows.filter((user) => !removedIds.has(user.id))
  const keptIds = new Set(kept.map((user) => user.id))

  const problems = []
  const keptQuestions = []
  const removedQuestionIds = new Set()
  for (const row of questions.rows) {
    if (removedIds.has(row.user_id)) {
      removedQuestionIds.add(row.id)
      continue
    }
    if (!keptIds.has(row.user_id)) problems.push(`question ${row.id}: its user does not exist`)
    const labels = ATTRIBUTES.map((attribute) => {
      const mapped = mapValue(attribute, row[attribute.column])
      if (!mapped) {
        problems.push(`question ${row.id}: unknown ${attribute.column} ${JSON.stringify(row[attribute.column])}`)
      }
      return mapped ?? []
    })
    keptQuestions.push({ id: row.id, userId: row.user_id, labels })
  }

  const keptAttempts = attempts.rows.filter((attempt) => !removedIds.has(attempt.user_id))
  for (const attempt of keptAttempts) {
    if (removedQuestionIds.has(attempt.question_id)) {
      problems.push(`attempt ${attempt.id}: belongs to a kept user but answers a removed account's question`)
    }
  }

  if (problems.length) {
    throw new Error(`${id} aborted, nothing was changed:\n  ${problems.join('\n  ')}`)
  }
  return { removed, kept, questions: keptQuestions, attempts: keptAttempts }
}

/**
 * @param {import('@libsql/client/http').Client} client
 * @param {{
 *   extraGuards?: string[],
 *   record?: import('@libsql/client/http').InStatement[],
 *   log?: (line: string) => void,
 * }} [opts] `extraGuards` are further SQL conditions that must hold; `record` statements join the
 *   transaction.
 */
export async function up(client, { extraGuards = [], record = [], log = () => {} } = {}) {
  const source = await readSource(client)

  const statements = []
  /** Statement index of each check's insert, to name the one that failed. */
  const guards = new Map()
  const run = (sql, ...args) => statements.push({ sql, args })
  const guard = (name, condition, ...args) => {
    run('create table _guard(ok integer check(ok = 1))')
    guards.set(statements.length, name)
    // `ifnull`: a check constraint lets NULL through.
    run(`insert into _guard select ifnull((${condition}), 0)`, ...args)
    run('drop table _guard')
  }

  // With foreign keys on, dropping the old table would delete every attempt.
  guard('foreign keys are off', '(select foreign_keys from pragma_foreign_keys) = 0')
  for (const sql of CREATE_TABLES) run(sql)

  const removedIds = source.removed.map((user) => user.id)
  const removedList = removedIds.map(() => '?').join(', ')
  run(`create table _attempts_source as select * from attempts where user_id not in (${removedList})`, ...removedIds)
  for (const userId of removedIds) {
    run('delete from attempts where user_id = ?', userId)
    run('delete from attempts where question_id in (select id from questions where user_id = ?)', userId)
    run('delete from questions where user_id = ?', userId)
    run('delete from users where id = ?', userId)
  }

  const now = Date.now()
  const scenarios = []
  const optionChecks = []
  let optionRows = 0
  for (const user of source.kept) {
    const own = source.questions.filter((question) => question.userId === user.id)
    if (!own.length) continue

    const scenarioId = createId()
    scenarios.push({ user, questions: own.length })
    run(
      'insert into scenarios (id, user_id, name, created_at, updated_at) values (?, ?, ?, ?, ?)',
      scenarioId,
      user.id,
      SCENARIO_NAME,
      now,
      now,
    )

    const optionIds = ATTRIBUTES.map((attribute, position) => {
      const attributeId = createId()
      run(
        `insert into attributes (id, scenario_id, name, selection_mode, ordered, required, position)
         values (?, ?, ?, ?, ?, ?, ?)`,
        attributeId,
        scenarioId,
        attribute.name,
        attribute.mode,
        attribute.ordered,
        attribute.required,
        position,
      )
      return new Map(
        attribute.options.map((option, optionPosition) => {
          const optionId = createId()
          run(
            'insert into options (id, attribute_id, label, color, position, is_default) values (?, ?, ?, ?, ?, ?)',
            optionId,
            attributeId,
            option.label,
            option.color,
            optionPosition,
            option.isDefault ? 1 : 0,
          )
          const expected = own.filter((question) => question.labels[position].includes(option.label)).length
          optionChecks.push({ name: `${user.username} ${attribute.name} ${option.label}`, optionId, expected })
          optionRows += expected
          return [option.label, optionId]
        }),
      )
    })

    // Copied by the database itself, so no value passes through JavaScript.
    run(
      `insert into questions_new (id, scenario_id, question, answer, link, mastered, created_at, updated_at)
       select id, ?, question, answer_summary, link, mastered, created_at, updated_at
       from questions where user_id = ?`,
      scenarioId,
      user.id,
    )
    for (const question of own) {
      question.labels.forEach((labels, position) => {
        for (const label of labels) {
          run(
            'insert into question_options (question_id, option_id) values (?, ?)',
            question.id,
            optionIds[position].get(label),
          )
        }
      })
    }
  }

  guard('every question is copied unchanged', SAME_QUESTIONS)
  guard('every question keeps its option set', SAME_OPTION_SETS)
  guard('options belong to the scenario of their question', OPTIONS_IN_OWN_SCENARIO)

  run('drop table questions')
  run('alter table questions_new rename to questions')
  for (const sql of CREATE_INDEXES) run(sql)

  guard('user count', '(select count(*) from users) = ?', source.kept.length)
  guard('scenario count', '(select count(*) from scenarios) = ?', scenarios.length)
  guard('question count', '(select count(*) from questions) = ?', source.questions.length)
  guard('attempt count', '(select count(*) from attempts) = ?', source.attempts.length)
  for (const user of source.kept) {
    guard(
      `question count of ${user.username}`,
      `(select count(*) from questions q join scenarios s on s.id = q.scenario_id where s.user_id = ?) = ?`,
      user.id,
      source.questions.filter((question) => question.userId === user.id).length,
    )
    guard(
      `attempt count of ${user.username}`,
      '(select count(*) from attempts where user_id = ?) = ?',
      user.id,
      source.attempts.filter((attempt) => attempt.user_id === user.id).length,
    )
  }
  for (const { name, optionId, expected } of optionChecks) {
    guard(`option count of ${name}`, '(select count(*) from question_options where option_id = ?) = ?', optionId, expected)
  }
  guard('option row count', '(select count(*) from question_options) = ?', optionRows)
  guard('attempts are unchanged', sameRows('select * from attempts', 'select * from _attempts_source'))
  guard('no foreign key violations', 'not exists (select 1 from pragma_foreign_key_check)')
  extraGuards.forEach((condition, i) => guard(`extra guard ${i + 1}`, condition))

  run('drop table _attempts_source')
  statements.push(...record)

  try {
    await client.migrate(statements)
  } catch (err) {
    const failed = guards.get(err.statementIndex)
    const reason = failed ? `check "${failed}" failed` : err.message
    throw new Error(`${id} rolled back, nothing was changed: ${reason}`, { cause: err })
  }

  for (const user of source.removed) log(`  removed test account ${user.username}`)
  for (const { user, questions } of scenarios) log(`  ${user.username}: ${questions} questions in "${SCENARIO_NAME}"`)
  log(`  ${source.questions.length} questions, ${source.attempts.length} attempts, ${optionRows} option rows verified`)
}
