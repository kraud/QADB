import { createId } from '@paralleldrive/cuid2'
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, max, sql, sum, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import type { Filters, parseQuestionQuery, SortDir, SortKey } from '../../shared/scenario/query'
import type { Attribute, AttributeValues, Scenario } from '../../shared/scenario/types'
import { missingAttributeIds, validateValues } from '../../shared/scenario/values'
import type { AttemptRow, QuestionWithStats } from '../../shared/types/qadb'
import { attempts, attributes, options, questionOptions, questions, scenarios } from '../../db/schema'
import type { Db } from '../utils/db'
import { isIncomplete } from './incomplete'
import { requireScenario } from './scenarios'

export interface QuestionBody {
  question: string
  answer: string
  link?: string | null
  values: AttributeValues
}

export type QuestionChanges = Partial<QuestionBody & { mastered: 0 | 1 }>

const notFound = () => createError({ statusCode: 404, statusMessage: 'Not found' })

/** Aggregate attempt stats per question, LEFT JOINed onto `questions`. */
function questionStats(db: Db) {
  return db
    .select({
      questionId: attempts.question_id,
      attemptCount: count(attempts.id).as('attemptCount'),
      correctCount: sum(attempts.correct).mapWith(Number).as('correctCount'),
      lastAnsweredAt: max(attempts.answered_at).as('lastAnsweredAt'),
      lastCorrect: sql<number | null>`(
        select a.correct from attempts a
        where a.question_id = attempts.question_id
        order by a.answered_at desc
        limit 1
      )`.as('lastCorrect'),
    })
    .from(attempts)
    .groupBy(attempts.question_id)
    .as('qstats')
}

type Stats = ReturnType<typeof questionStats>

/**
 * The questions of one scenario matching every condition, in the wire format. Values only ever
 * name the scenario's own options, in option order, with an entry for every attribute.
 */
async function selectQuestions(
  db: Db,
  scenario: Scenario,
  stats: Stats,
  conditions: SQL[],
  orderBy: SQL[],
  /** Narrows which questions have their values read. */
  valuesOf?: SQL,
): Promise<QuestionWithStats[]> {
  const [rows, chosen] = await db.batch([
    db
      .select({
        id: questions.id,
        scenarioId: questions.scenario_id,
        question: questions.question,
        answer: questions.answer,
        link: questions.link,
        mastered: questions.mastered,
        created_at: questions.created_at,
        updated_at: questions.updated_at,
        incomplete: isIncomplete,
        attemptCount: stats.attemptCount,
        correctCount: stats.correctCount,
        lastAnsweredAt: stats.lastAnsweredAt,
        lastCorrect: stats.lastCorrect,
      })
      .from(questions)
      .leftJoin(stats, eq(questions.id, stats.questionId))
      .where(and(eq(questions.scenario_id, scenario.id), ...conditions))
      .orderBy(...orderBy),
    db
      .select({ questionId: questionOptions.question_id, optionId: questionOptions.option_id })
      .from(questionOptions)
      .innerJoin(questions, eq(questions.id, questionOptions.question_id))
      .where(and(eq(questions.scenario_id, scenario.id), valuesOf)),
  ])

  const held = new Map<string, Set<string>>()
  for (const { questionId, optionId } of chosen) {
    const optionIds = held.get(questionId)
    if (optionIds) optionIds.add(optionId)
    else held.set(questionId, new Set([optionId]))
  }

  return rows.map(({ attemptCount, correctCount, lastAnsweredAt, lastCorrect, ...row }) => {
    const optionIds = held.get(row.id)
    const answered = attemptCount ?? 0
    const correct = correctCount ?? 0
    return {
      ...row,
      values: Object.fromEntries(
        scenario.attributes.map((attribute) => [
          attribute.id,
          attribute.options.filter((option) => optionIds?.has(option.id)).map((option) => option.id),
        ]),
      ),
      stats: {
        attemptCount: answered,
        correctCount: correct,
        trackRecordPct: answered > 0 ? (correct * 100) / answered : null,
        lastAnsweredAt: lastAnsweredAt ?? null,
        lastCorrect: lastCorrect ?? null,
      },
    }
  })
}

/** One question of the scenario; 404 when it is not (or no longer) there. */
async function readQuestion(db: Db, scenario: Scenario, id: string): Promise<QuestionWithStats> {
  const [question] = await selectQuestions(
    db,
    scenario,
    questionStats(db),
    [eq(questions.id, id)],
    [],
    eq(questions.id, id),
  )
  if (!question) throw notFound()
  return question
}

/** The scenario of the question, if it exists and belongs to the user; otherwise 404. */
async function requireQuestionScenario(db: Db, userId: string, id: string): Promise<Scenario> {
  const [owned] = await db
    .select({ sid: questions.scenario_id })
    .from(questions)
    .innerJoin(scenarios, eq(scenarios.id, questions.scenario_id))
    .where(and(eq(questions.id, id), eq(scenarios.user_id, userId)))
  if (!owned) throw notFound()
  return requireScenario(db, userId, owned.sid)
}

/** True when the question holds one of these options, or any option at all matching `where`. */
const hasOption = (where: SQL) =>
  sql`exists (
    select 1 from ${questionOptions}
    join ${options} on ${options.id} = ${questionOptions.option_id}
    where ${questionOptions.question_id} = ${questions}.id and ${where}
  )`

/**
 * One condition per filtered attribute: any of its chosen options, or, with "None" chosen, no
 * option at all. Ids that are not in the scenario are dropped before they get near the query.
 */
function attributeConditions(scenario: Scenario, filters: Filters): SQL[] {
  const chosen = new Set(filters.options)
  const none = new Set(filters.none)
  return scenario.attributes.flatMap((attribute) => {
    const optionIds = attribute.options.map((option) => option.id).filter((id) => chosen.has(id))
    const either = [
      ...(optionIds.length ? [hasOption(inArray(options.id, optionIds))] : []),
      ...(none.has(attribute.id) ? [sql`not ${hasOption(eq(options.attribute_id, attribute.id))}`] : []),
    ]
    return either.length ? [sql`(${sql.join(either, sql` or `)})`] : []
  })
}

/** Joins with AND as a balanced tree: a flat chain over many attributes exceeds SQLite's depth limit. */
function allOf(conditions: SQL[]): SQL | undefined {
  if (conditions.length <= 1) return conditions[0]
  const half = Math.ceil(conditions.length / 2)
  return and(allOf(conditions.slice(0, half)), allOf(conditions.slice(half)))
}

/** Every word must occur in the question, ignoring case. */
function searchCondition(q: string): SQL | undefined {
  const words = [...new Set(q.split(/\s+/).filter(Boolean))]
  if (!words.length) return undefined
  // One parameter and no LIKE, so that neither many words nor a long one hits a limit of SQLite.
  // `lower` folds the same letters as LIKE does.
  return sql`not exists (
    select 1 from json_each(${JSON.stringify(words)}) as word
    where instr(lower(${questions}.question), lower(word.value)) = 0
  )`
}

function filterConditions(scenario: Scenario, stats: Stats, filters: Filters): SQL[] {
  const attemptCount = sql<number>`coalesce(${stats.attemptCount}, 0)`
  const compare = { '>': gt, '<': lt, '=': eq }
  return [
    allOf(attributeConditions(scenario, filters)),
    filters.incomplete ? isIncomplete : undefined,
    filters.nbd === 'yes' ? isNull(stats.attemptCount) : undefined,
    filters.nbd === 'no' ? isNotNull(stats.attemptCount) : undefined,
    filters.mastered === 'all' ? undefined : eq(questions.mastered, filters.mastered === 'yes' ? 1 : 0),
    filters.op === 'all' ? undefined : compare[filters.op](attemptCount, filters.n),
    filters.recent ? and(eq(stats.lastCorrect, 0), isNotNull(stats.attemptCount)) : undefined,
    searchCondition(filters.q),
  ].filter((condition) => condition !== undefined)
}

/** The position of the question's option of this attribute; null without one. */
const optionPosition = (attribute: Attribute) =>
  sql`(
    select min(${options.position}) from ${questionOptions}
    join ${options} on ${options.id} = ${questionOptions.option_id}
    where ${questionOptions.question_id} = ${questions}.id and ${options.attribute_id} = ${attribute.id}
  )`

/** Oldest first unless a known sort key says otherwise; creation order also settles ties. */
function ordering(scenario: Scenario, stats: Stats, sortKey: SortKey, sortDir: SortDir): SQL[] {
  const tiebreak = [asc(questions.created_at), asc(questions.id)]
  const direction = sortDir === 'desc' ? desc : asc
  if (sortKey === 'pct') {
    const pct = sql`case when coalesce(${stats.attemptCount}, 0) = 0 then null else (coalesce(${stats.correctCount}, 0) * 100.0 / ${stats.attemptCount}) end`
    return [direction(pct), ...tiebreak]
  }
  if (sortKey === 'amount') return [direction(sql`coalesce(${stats.attemptCount}, 0)`), ...tiebreak]

  const attribute = scenario.attributes.find(
    (candidate) => candidate.ordered && sortKey === `attr:${candidate.id}`,
  )
  if (!attribute) return tiebreak
  return [sql`${direction(optionPosition(attribute))} nulls last`, ...tiebreak]
}

export async function listQuestions(
  db: Db,
  userId: string,
  sid: string,
  { filters, sortKey, sortDir }: ReturnType<typeof parseQuestionQuery>,
): Promise<QuestionWithStats[]> {
  const scenario = await requireScenario(db, userId, sid)
  const stats = questionStats(db)
  return selectQuestions(
    db,
    scenario,
    stats,
    filterConditions(scenario, stats, filters),
    ordering(scenario, stats, sortKey, sortDir),
  )
}

export async function listQuestionIds(db: Db, userId: string, sid: string): Promise<{ id: string }[]> {
  await requireScenario(db, userId, sid)
  return db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.scenario_id, sid))
    .orderBy(asc(questions.created_at), asc(questions.id))
}

export async function getQuestion(
  db: Db,
  userId: string,
  id: string,
): Promise<QuestionWithStats & { attempts: AttemptRow[] }> {
  const question = await readQuestion(db, await requireQuestionScenario(db, userId, id), id)
  const history = await db
    .select({ id: attempts.id, correct: attempts.correct, answered_at: attempts.answered_at })
    .from(attempts)
    .where(eq(attempts.question_id, id))
    .orderBy(desc(attempts.answered_at), desc(attempts.id))
  return { ...question, attempts: history }
}

/** Throws 422 unless the values suit the scenario and fill every required attribute. */
function requireValidValues(scenario: Scenario, values: AttributeValues) {
  const issues = validateValues(scenario, values, { requireAll: true })
  if (issues.length) throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: issues })
}

const optionRows = (questionId: string, values: AttributeValues) =>
  Object.values(values)
    .flat()
    .map((optionId) => ({ question_id: questionId, option_id: optionId }))

/**
 * Fails the batch it is part of when the question holds two options of a single-mode attribute, or
 * an option of another scenario, by inserting an invalid row. The values were checked against a
 * definition that a concurrent edit may have changed since.
 */
const guardValues = (db: Db, questionId: string) =>
  db.run(sql`insert into ${questions} (id, scenario_id, question, answer)
    select null, null, null, null where exists (
      select 1 from ${questionOptions}
      join ${options} on ${options.id} = ${questionOptions.option_id}
      join ${attributes} on ${attributes.id} = ${options.attribute_id}
      join ${questions} on ${questions.id} = ${questionOptions.question_id}
      where ${questionOptions.question_id} = ${questionId}
      group by ${attributes.id}
      having ${attributes.scenario_id} <> ${questions.scenario_id}
        or (${attributes.selection_mode} = 'single' and count(*) > 1)
    )`)

export async function createQuestion(
  db: Db,
  userId: string,
  sid: string,
  body: QuestionBody,
): Promise<QuestionWithStats> {
  const scenario = await requireScenario(db, userId, sid)
  requireValidValues(scenario, body.values)

  const id = createId()
  const now = Date.now()
  const rows = optionRows(id, body.values)
  try {
    await db.batch([
      // First, so the transaction holds the write lock before the guard looks.
      db.insert(questions).values({
        id,
        scenario_id: sid,
        question: body.question,
        answer: body.answer,
        link: body.link?.trim() || null,
        mastered: 0,
        created_at: now,
        updated_at: now,
      }),
      ...rows.map((row) => db.insert(questionOptions).values(row)),
      guardValues(db, id),
    ])
  } catch (err) {
    // The scenario changed under us: say what is wrong with the values now, if anything is.
    requireValidValues(await requireScenario(db, userId, sid), body.values)
    throw err
  }
  return readQuestion(db, scenario, id)
}

/**
 * Throws 422 unless the values sent suit the scenario and, laid over what the question holds, fill
 * every required attribute.
 */
async function requireValidChange(db: Db, scenario: Scenario, id: string, values: AttributeValues) {
  const stored = (await readQuestion(db, scenario, id)).values
  const issues = validateValues(scenario, values, { requireAll: false })
  // What was sent wins; an empty list there leaves nothing.
  for (const attributeId of missingAttributeIds(scenario, { ...stored, ...values })) {
    const { name } = scenario.attributes.find((attribute) => attribute.id === attributeId)!
    issues.push({ path: ['values', attributeId], message: `${name} is required` })
  }
  if (issues.length) throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: issues })
}

/**
 * Changes what is given. `values`, when given, replaces the options of the attributes it names (an
 * empty list clears one); the others keep theirs, so that a client that does not know an attribute
 * cannot wipe it.
 */
export async function updateQuestion(
  db: Db,
  userId: string,
  id: string,
  changes: QuestionChanges,
): Promise<QuestionWithStats> {
  const scenario = await requireQuestionScenario(db, userId, id)
  const { values, link, ...columns } = changes
  if (values) await requireValidChange(db, scenario, id, values)

  const update = db
    .update(questions)
    .set({
      ...columns,
      ...(link === undefined ? {} : { link: link?.trim() || null }),
      updated_at: Date.now(),
    })
    .where(eq(questions.id, id))

  if (!values) {
    await update
    return readQuestion(db, scenario, id)
  }

  try {
    await db.batch([
      // First, so the transaction holds the write lock before the guard looks.
      update,
      db.delete(questionOptions).where(
        and(
          eq(questionOptions.question_id, id),
          inArray(
            questionOptions.option_id,
            db.select({ id: options.id }).from(options).where(inArray(options.attribute_id, Object.keys(values))),
          ),
        ),
      ),
      ...optionRows(id, values).map((row) => db.insert(questionOptions).values(row)),
      guardValues(db, id),
    ])
  } catch (err) {
    // The question or its scenario changed under us: 404 or 422 if that explains the failure.
    await requireValidChange(db, await requireQuestionScenario(db, userId, id), id, values)
    throw err
  }
  // Read afresh: the definition may have changed in a way the values survive.
  return readQuestion(db, scenario, id)
}

/** Deletes the question; the database removes its values and attempts with it. */
export async function deleteQuestion(db: Db, userId: string, id: string): Promise<void> {
  await requireQuestionScenario(db, userId, id)
  await db.delete(questions).where(eq(questions.id, id))
}

export async function recordAttempt(
  db: Db,
  userId: string,
  questionId: string,
  correct: 0 | 1,
): Promise<QuestionWithStats> {
  const scenario = await requireQuestionScenario(db, userId, questionId)
  await db
    .insert(attempts)
    .values({ id: createId(), question_id: questionId, user_id: userId, correct, answered_at: Date.now() })
  return readQuestion(db, scenario, questionId)
}
