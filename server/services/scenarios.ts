import { createId } from '@paralleldrive/cuid2'
import { and, asc, count, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import { diffScenario, findConflicts, type Conflict, type Resolutions } from '../../shared/scenario/diff'
import { nameKey, type ScenarioInput } from '../../shared/scenario/schema'
import type { Scenario, Usage } from '../../shared/scenario/types'
import { attributes, options, questionOptions, questions, scenarios } from '../../db/schema'
import type { Db } from '../utils/db'
import { isIncomplete } from './incomplete'

export interface ScenarioSummary {
  id: string
  name: string
  questionCount: number
  incompleteCount: number
}

const notFound = () => createError({ statusCode: 404, statusMessage: 'Not found' })

/** The user's scenarios with their counts, oldest first; only `sid` when given. */
function summaries(db: Db, userId: string, sid?: string): Promise<ScenarioSummary[]> {
  return db
    .select({
      id: scenarios.id,
      name: scenarios.name,
      questionCount: count(questions.id),
      // The join yields one empty row for a scenario without questions; it matches no attribute.
      incompleteCount: sql<number>`coalesce(sum(${isIncomplete}), 0)`.mapWith(Number),
    })
    .from(scenarios)
    .leftJoin(questions, eq(questions.scenario_id, scenarios.id))
    .where(and(eq(scenarios.user_id, userId), sid === undefined ? undefined : eq(scenarios.id, sid)))
    .groupBy(scenarios.id)
    // `rowid` settles scenarios created in the same millisecond.
    .orderBy(asc(scenarios.created_at), sql`${scenarios}.rowid`)
}

export function listScenarios(db: Db, userId: string): Promise<ScenarioSummary[]> {
  return summaries(db, userId)
}

/** The scenario definition, if it exists and belongs to the user; otherwise 404. */
export async function requireScenario(db: Db, userId: string, sid: string): Promise<Scenario> {
  const [[scenario], attributeRows, optionRows] = await db.batch([
    db
      .select({ id: scenarios.id, name: scenarios.name })
      .from(scenarios)
      .where(and(eq(scenarios.id, sid), eq(scenarios.user_id, userId))),
    db.select().from(attributes).where(eq(attributes.scenario_id, sid)).orderBy(asc(attributes.position)),
    db
      .select({
        id: options.id,
        attributeId: options.attribute_id,
        label: options.label,
        color: options.color,
        position: options.position,
        isDefault: options.is_default,
      })
      .from(options)
      .innerJoin(attributes, eq(attributes.id, options.attribute_id))
      .where(eq(attributes.scenario_id, sid))
      .orderBy(asc(options.position)),
  ])
  if (!scenario) throw notFound()

  return {
    ...scenario,
    attributes: attributeRows.map((attribute) => ({
      id: attribute.id,
      name: attribute.name,
      selectionMode: attribute.selection_mode,
      ordered: attribute.ordered,
      required: attribute.required,
      position: attribute.position,
      options: optionRows
        .filter((option) => option.attributeId === attribute.id)
        .map(({ attributeId: _, ...option }) => option),
    })),
  }
}

/** How many questions use what, with a zero for everything unused. */
async function usageOf(db: Db, scenario: Scenario): Promise<Usage> {
  // One row per question and attribute it has a value for.
  const perQuestion = db
    .select({
      attributeId: options.attribute_id,
      chosen: count().as('chosen'),
    })
    .from(questionOptions)
    .innerJoin(options, eq(options.id, questionOptions.option_id))
    .innerJoin(attributes, eq(attributes.id, options.attribute_id))
    .where(eq(attributes.scenario_id, scenario.id))
    .groupBy(questionOptions.question_id, options.attribute_id)
    .as('per_question')

  const [optionRows, attributeRows] = await db.batch([
    db
      .select({ optionId: questionOptions.option_id, questions: count() })
      .from(questionOptions)
      .innerJoin(options, eq(options.id, questionOptions.option_id))
      .innerJoin(attributes, eq(attributes.id, options.attribute_id))
      .where(eq(attributes.scenario_id, scenario.id))
      .groupBy(questionOptions.option_id),
    db
      .select({
        attributeId: perQuestion.attributeId,
        questions: count(),
        several: sql<number>`sum(${perQuestion.chosen} > 1)`.mapWith(Number),
      })
      .from(perQuestion)
      .groupBy(perQuestion.attributeId),
  ])

  const zeros = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, 0]))
  const attributeIds = scenario.attributes.map((attribute) => attribute.id)
  const usage: Usage = {
    optionCounts: zeros(scenario.attributes.flatMap((attribute) => attribute.options.map((option) => option.id))),
    attributeCounts: zeros(attributeIds),
    multiValueCounts: zeros(attributeIds),
  }
  for (const row of optionRows) usage.optionCounts[row.optionId] = row.questions
  for (const row of attributeRows) {
    usage.attributeCounts[row.attributeId] = row.questions
    usage.multiValueCounts[row.attributeId] = row.several
  }
  return usage
}

export async function getScenario(
  db: Db,
  userId: string,
  sid: string,
): Promise<Scenario & { usage: Usage; questionCount: number; incompleteCount: number }> {
  const scenario = await requireScenario(db, userId, sid)
  const [usage, [summary]] = await Promise.all([usageOf(db, scenario), summaries(db, userId, sid)])
  // Deleted since it was read.
  if (!summary) throw notFound()
  return { ...scenario, usage, questionCount: summary.questionCount, incompleteCount: summary.incompleteCount }
}

/** Throws 409 when the user has a scenario of that name, ignoring case; `except` is not counted. */
async function requireFreeName(db: Db, userId: string, name: string, except?: string) {
  // Compared here, because SQLite only folds the case of ASCII letters.
  const own = await db
    .select({ name: scenarios.name })
    .from(scenarios)
    .where(and(eq(scenarios.user_id, userId), except === undefined ? undefined : ne(scenarios.id, except)))
  if (own.some((scenario) => nameKey(scenario.name) === nameKey(name))) {
    throw createError({ statusCode: 409, statusMessage: 'That scenario name is already taken' })
  }
}

/** Throws 422 for any id in the input: nothing in a new scenario exists yet. */
function rejectIds(input: ScenarioInput) {
  const message = 'A new scenario cannot refer to existing ids'
  const issues = input.attributes.flatMap((attribute, a) => [
    ...(attribute.id === undefined ? [] : [{ path: ['attributes', a, 'id'], message }]),
    ...attribute.options.flatMap((option, o) =>
      option.id === undefined ? [] : [{ path: ['attributes', a, 'options', o, 'id'], message }],
    ),
  ])
  if (issues.length) throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: issues })
}

/** The scenario that `input` describes. Entries without an id get a new one. */
function toScenario(id: string, input: ScenarioInput): Scenario {
  return {
    id,
    name: input.name,
    attributes: input.attributes.map((attribute, position) => ({
      id: attribute.id ?? createId(),
      name: attribute.name,
      selectionMode: attribute.selectionMode,
      ordered: attribute.ordered,
      required: attribute.required,
      position,
      options: attribute.options.map((option, optionPosition) => ({
        id: option.id ?? createId(),
        label: option.label,
        color: option.color,
        position: optionPosition,
        isDefault: option.isDefault,
      })),
    })),
  }
}

const attributeColumns = (attribute: Scenario['attributes'][number]) => ({
  name: attribute.name,
  selection_mode: attribute.selectionMode,
  ordered: attribute.ordered,
  required: attribute.required,
  position: attribute.position,
})

const optionColumns = (option: Scenario['attributes'][number]['options'][number]) => ({
  label: option.label,
  color: option.color,
  position: option.position,
  is_default: option.isDefault,
})

/** `input` must already have passed `scenarioInputSchema`. */
export async function createScenario(db: Db, userId: string, input: ScenarioInput): Promise<Scenario> {
  rejectIds(input)
  await requireFreeName(db, userId, input.name)

  const scenario = toScenario(createId(), input)

  const now = Date.now()
  await db.batch([
    db
      .insert(scenarios)
      .values({ id: scenario.id, user_id: userId, name: scenario.name, created_at: now, updated_at: now }),
    ...scenario.attributes.map((attribute) =>
      db.insert(attributes).values({ id: attribute.id, scenario_id: scenario.id, ...attributeColumns(attribute) }),
    ),
    ...scenario.attributes.flatMap((attribute) =>
      attribute.options.map((option) =>
        db.insert(options).values({ id: option.id, attribute_id: attribute.id, ...optionColumns(option) }),
      ),
    ),
  ])
  return scenario
}

interface Move {
  from: string
  to: string
}

/**
 * Checks every id the update refers to against the stored scenario and returns where the values of
 * removed options go. Throws 422 for an id that is not the scenario's, an option under another
 * attribute, an ambiguous ref, or a `moveTo` that is not an option staying in the same attribute.
 */
function planMoves(current: Scenario, input: ScenarioInput, next: Scenario, r: Resolutions): Move[] {
  const issues: { path: (string | number)[]; message: string }[] = []
  const issue = (path: (string | number)[], message: string) => issues.push({ path, message })

  const currentOptions = new Map(
    current.attributes.map((attribute) => [attribute.id, new Set(attribute.options.map((option) => option.id))]),
  )
  const optionIds = new Set(current.attributes.flatMap((attribute) => attribute.options.map((option) => option.id)))

  input.attributes.forEach((attribute, a) => {
    const path = ['scenario', 'attributes', a]
    if (attribute.id !== undefined && !currentOptions.has(attribute.id)) {
      issue([...path, 'id'], 'Unknown attribute')
    }
    attribute.options.forEach((option, o) => {
      if (option.id !== undefined && !currentOptions.get(attribute.id ?? '')?.has(option.id)) {
        issue([...path, 'options', o, 'id'], 'Unknown option for this attribute')
      }
      if (option.ref !== undefined && optionIds.has(option.ref)) {
        issue([...path, 'options', o, 'ref'], 'A ref cannot be an existing option id')
      }
    })
  })

  for (const id of Object.keys(r.removedOptions ?? {})) {
    if (!optionIds.has(id)) issue(['resolutions', 'removedOptions', id], 'Unknown option')
  }
  for (const key of ['removedAttributes', 'collapseToSingle'] as const) {
    r[key]?.forEach((id, index) => {
      if (!currentOptions.has(id)) issue(['resolutions', key, index], 'Unknown attribute')
    })
  }

  const moves: Move[] = []
  for (const { attribute, option } of diffScenario(current, input).removedOptions) {
    const target = Object.hasOwn(r.removedOptions ?? {}, option.id) ? r.removedOptions![option.id]!.moveTo : null
    if (target === null) continue
    // `input` and `next` list the same attributes and options in the same order.
    const a = input.attributes.findIndex((candidate) => candidate.id === attribute.id)
    const o = input.attributes[a]!.options.findIndex((candidate) =>
      candidate.id === undefined ? candidate.ref === target : candidate.id === target,
    )
    if (o < 0) {
      issue(['resolutions', 'removedOptions', option.id, 'moveTo'], `Choose an option that stays in ${attribute.name}`)
    } else {
      moves.push({ from: option.id, to: next.attributes[a]!.options[o]!.id })
    }
  }

  if (issues.length) throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: issues })
  return moves
}

const conflictError = (conflicts: Conflict[]) =>
  createError({ statusCode: 409, statusMessage: 'Questions are affected by this change', data: { conflicts } })

/** True while some question would be affected by an unconfirmed change of this kind. */
function stillAffects({ type, attributeId, optionId }: { type: Conflict['type']; attributeId: string; optionId?: string }) {
  if (type === 'option-in-use') {
    return sql`exists (select 1 from ${questionOptions} where ${questionOptions.option_id} = ${optionId})`
  }
  return sql`exists (
    select 1 from ${questionOptions}
    join ${options} on ${options.id} = ${questionOptions.option_id}
    where ${options.attribute_id} = ${attributeId}
    group by ${questionOptions.question_id}
    having count(*) > ${type === 'multiple-to-single' ? sql`1` : sql`0`}
  )`
}

/**
 * Saves the whole scenario, applying the user's choices to the questions in one atomic batch.
 * `input` must already have passed `scenarioInputSchema`. Throws 409 with `data.conflicts` when
 * questions are affected by a change that `r` does not settle.
 */
export async function updateScenario(
  db: Db,
  userId: string,
  sid: string,
  input: ScenarioInput,
  r: Resolutions,
): Promise<Scenario> {
  // Ownership comes first: nothing else may be reported about another user's scenario.
  const current = await requireScenario(db, userId, sid)
  await requireFreeName(db, userId, input.name, sid)
  const next = toScenario(sid, input)
  const moves = planMoves(current, input, next, r)

  const conflictsWith = async (scenario: Scenario) => findConflicts(scenario, input, await usageOf(db, scenario), r)
  const conflicts = await conflictsWith(current)
  if (conflicts.length) throw conflictError(conflicts)

  const diff = diffScenario(current, input)
  const removedAttributeIds = diff.removedAttributes.map((attribute) => attribute.id)
  const removedOptionIds = diff.removedOptions.map(({ option }) => option.id)
  const lostOptionIds = [
    ...removedOptionIds,
    ...diff.removedAttributes.flatMap((attribute) => attribute.options.map((option) => option.id)),
  ]

  // Nothing found affected above may have become affected since. A guard inserts an invalid row,
  // failing the whole batch, when that happened.
  const unconfirmed = [
    ...diff.removedAttributes
      .filter((attribute) => !r.removedAttributes?.includes(attribute.id))
      .map((attribute) => ({ type: 'attribute-delete' as const, attributeId: attribute.id })),
    ...diff.removedOptions
      .filter(({ option }) => !Object.hasOwn(r.removedOptions ?? {}, option.id))
      .map(({ attribute, option }) => ({
        type: 'option-in-use' as const,
        attributeId: attribute.id,
        optionId: option.id,
      })),
    ...diff.collapsed
      .filter((attribute) => !r.collapseToSingle?.includes(attribute.id))
      .map((attribute) => ({ type: 'multiple-to-single' as const, attributeId: attribute.id })),
  ]

  // The questions whose values are about to change.
  const changed: SQL[] = [
    ...(lostOptionIds.length
      ? [
          sql`exists (select 1 from ${questionOptions}
            where ${questionOptions.question_id} = ${questions}.id and ${inArray(questionOptions.option_id, lostOptionIds)})`,
        ]
      : []),
    ...diff.collapsed.map(
      (attribute) => sql`(select count(*) from ${questionOptions}
        join ${options} on ${options.id} = ${questionOptions.option_id}
        where ${questionOptions.question_id} = ${questions}.id and ${options.attribute_id} = ${attribute.id}) > 1`,
    ),
  ]

  const newAttributes = next.attributes.filter((_, a) => input.attributes[a]!.id === undefined)
  const newOptions = next.attributes.flatMap((attribute, a) =>
    attribute.options
      .filter((_, o) => input.attributes[a]!.options[o]!.id === undefined)
      .map((option) => ({ id: option.id, attribute_id: attribute.id, ...optionColumns(option) })),
  )
  const now = Date.now()

  // The order matters. Removing an option cascades to the questions holding it, so values move
  // first, to options that by then exist. Collapsing needs the new option positions.
  try {
    await db.batch([
      // First, so the transaction holds the write lock before the guards look.
      db.update(scenarios).set({ name: next.name, updated_at: now }).where(eq(scenarios.id, sid)),
      ...unconfirmed.map((change) =>
        db.run(
          sql`insert into ${scenarios} (id, user_id, name) select null, null, null where ${stillAffects(change)}`,
        ),
      ),
      ...(changed.length
        ? [
            db
              .update(questions)
              .set({ updated_at: now })
              .where(and(eq(questions.scenario_id, sid), or(...changed))),
          ]
        : []),
      ...newAttributes.map((attribute) =>
        db.insert(attributes).values({ id: attribute.id, scenario_id: sid, ...attributeColumns(attribute) }),
      ),
      ...newOptions.map((option) => db.insert(options).values(option)),
      // `or ignore`: a question already holding the target keeps it once.
      ...moves.map((move) =>
        db.run(sql`insert or ignore into ${questionOptions} (question_id, option_id)
          select ${questionOptions.question_id}, ${move.to} from ${questionOptions}
          where ${questionOptions.option_id} = ${move.from}`),
      ),
      ...(removedOptionIds.length ? [db.delete(options).where(inArray(options.id, removedOptionIds))] : []),
      ...(removedAttributeIds.length
        ? [db.delete(attributes).where(inArray(attributes.id, removedAttributeIds))]
        : []),
      ...next.attributes
        .filter((_, a) => input.attributes[a]!.id !== undefined)
        .map((attribute) =>
          db.update(attributes).set(attributeColumns(attribute)).where(eq(attributes.id, attribute.id)),
        ),
      ...next.attributes.flatMap((attribute, a) =>
        attribute.options
          .filter((_, o) => input.attributes[a]!.options[o]!.id !== undefined)
          .map((option) => db.update(options).set(optionColumns(option)).where(eq(options.id, option.id))),
      ),
      // Each question keeps the first of its options in the new order.
      ...diff.collapsed.map((attribute) =>
        db.run(sql`delete from ${questionOptions} where exists (
          select 1 from ${options} as dropped
          join ${options} as earlier on earlier.attribute_id = dropped.attribute_id
            and (earlier.position, earlier.id) < (dropped.position, dropped.id)
          join ${questionOptions} as held on held.option_id = earlier.id
          where dropped.id = ${questionOptions}.option_id
            and dropped.attribute_id = ${attribute.id}
            and held.question_id = ${questionOptions}.question_id
        )`),
      ),
    ])
  } catch (err) {
    // A guard, or the scenario changing under us: report what is affected now, if anything is.
    const found = await conflictsWith(await requireScenario(db, userId, sid))
    if (found.length) throw conflictError(found)
    throw err
  }
  return requireScenario(db, userId, sid)
}

/** Deletes the scenario with its questions and their attempts, given its exact name. */
export async function deleteScenario(db: Db, userId: string, sid: string, confirmName: string): Promise<void> {
  const scenario = await requireScenario(db, userId, sid)
  if (confirmName.trim() !== scenario.name) {
    throw createError({ statusCode: 422, statusMessage: 'Type the scenario name to delete it' })
  }
  // The database cascades to everything the scenario owns.
  await db.delete(scenarios).where(eq(scenarios.id, sid))
}
