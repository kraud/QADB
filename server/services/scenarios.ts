import { createId } from '@paralleldrive/cuid2'
import { and, asc, count, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { nameKey, type ScenarioInput } from '../../shared/scenario/schema'
import type { Scenario } from '../../shared/scenario/types'
import { attributes, options, questionOptions, questions, scenarios } from '../../db/schema'
import type { Db } from '../utils/db'
import { isIncomplete } from './incomplete'

export interface Usage {
  /** Questions holding each option, by option id. */
  optionCounts: Record<string, number>
  /** Questions holding at least one option of each attribute, by attribute id. */
  attributeCounts: Record<string, number>
  /** Questions holding several options of each attribute, by attribute id. */
  multiValueCounts: Record<string, number>
}

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

/** Throws 409 when the user has a scenario of that name, ignoring case. */
async function requireFreeName(db: Db, userId: string, name: string) {
  // Compared here, because SQLite only folds the case of ASCII letters.
  const own = await db.select({ name: scenarios.name }).from(scenarios).where(eq(scenarios.user_id, userId))
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

/** `input` must already have passed `scenarioInputSchema`. */
export async function createScenario(db: Db, userId: string, input: ScenarioInput): Promise<Scenario> {
  rejectIds(input)
  await requireFreeName(db, userId, input.name)

  const scenario: Scenario = {
    id: createId(),
    name: input.name,
    attributes: input.attributes.map((attribute, position) => ({
      id: createId(),
      name: attribute.name,
      selectionMode: attribute.selectionMode,
      ordered: attribute.ordered,
      required: attribute.required,
      position,
      options: attribute.options.map((option, optionPosition) => ({
        id: createId(),
        label: option.label,
        color: option.color,
        position: optionPosition,
        isDefault: option.isDefault,
      })),
    })),
  }

  const now = Date.now()
  await db.batch([
    db
      .insert(scenarios)
      .values({ id: scenario.id, user_id: userId, name: scenario.name, created_at: now, updated_at: now }),
    ...scenario.attributes.map((attribute) =>
      db.insert(attributes).values({
        id: attribute.id,
        scenario_id: scenario.id,
        name: attribute.name,
        selection_mode: attribute.selectionMode,
        ordered: attribute.ordered,
        required: attribute.required,
        position: attribute.position,
      }),
    ),
    ...scenario.attributes.flatMap((attribute) =>
      attribute.options.map((option) =>
        db.insert(options).values({
          id: option.id,
          attribute_id: attribute.id,
          label: option.label,
          color: option.color,
          position: option.position,
          is_default: option.isDefault,
        }),
      ),
    ),
  ])
  return scenario
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
