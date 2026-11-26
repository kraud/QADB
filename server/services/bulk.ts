import { and, eq, sql, type SQL } from 'drizzle-orm'
import { createError } from 'h3'
import { planBulk, type BulkAction } from '../../shared/scenario/bulk'
import type { Attribute } from '../../shared/scenario/types'
import { attributes, options, questionOptions, questions } from '../../db/schema'
import type { Db } from '../utils/db'
import { requireScenario } from './scenarios'

export interface BulkEditBody {
  questionIds: string[]
  attributeId: string
  action: BulkAction
  optionIds: string[]
}

const rejected = (reason: 'invalid' | 'would-empty', count: number) =>
  createError({ statusCode: 422, statusMessage: 'Validation failed', data: { reason, count } })

// A list goes in as one JSON parameter, so that no selection hits SQLite's limit on parameters.
const listed = (ids: string[]) => sql`(select value from json_each(${JSON.stringify(ids)}))`

/**
 * Checks the edit against what is stored now and returns the attribute. Throws 404 for a scenario
 * that is not the user's, and 422 for ids that are not the scenario's, an action that does not fit,
 * or a required attribute that would be left empty. `body` lists no id twice.
 */
async function requireValidEdit(db: Db, userId: string, sid: string, body: BulkEditBody): Promise<Attribute> {
  const scenario = await requireScenario(db, userId, sid)
  const attribute = scenario.attributes.find((candidate) => candidate.id === body.attributeId)
  if (!attribute) throw rejected('invalid', 0)

  const selected = and(eq(questions.scenario_id, sid), sql`${questions.id} in ${listed(body.questionIds)}`)
  const [found, chosen] = await db.batch([
    db.select({ id: questions.id }).from(questions).where(selected),
    db
      .select({ questionId: questionOptions.question_id, optionId: questionOptions.option_id })
      .from(questionOptions)
      .innerJoin(options, eq(options.id, questionOptions.option_id))
      .innerJoin(questions, eq(questions.id, questionOptions.question_id))
      .where(and(selected, eq(options.attribute_id, attribute.id))),
  ])
  if (found.length !== body.questionIds.length) throw rejected('invalid', 0)

  const held = new Map<string, string[]>(found.map(({ id }) => [id, []]))
  for (const { questionId, optionId } of chosen) held.get(questionId)!.push(optionId)
  const items = [...held].map(([id, optionIds]) => ({ id, values: { [attribute.id]: optionIds } }))

  const plan = planBulk(attribute, items, body.action, body.optionIds)
  if (!plan.ok) throw rejected(plan.reason, plan.count)
  return attribute
}

/**
 * Applies one change of one attribute to the selected questions, all or none of them. `updated` is
 * the number of questions whose values changed; only those get a new `updated_at`.
 */
export async function bulkEdit(db: Db, userId: string, sid: string, body: BulkEditBody): Promise<{ updated: number }> {
  const edit: BulkEditBody = {
    ...body,
    questionIds: [...new Set(body.questionIds)],
    // `clear` takes no options: any sent with it are ignored.
    optionIds: body.action === 'clear' ? [] : [...new Set(body.optionIds)],
  }
  const attribute = await requireValidEdit(db, userId, sid, edit)

  const ids = listed(edit.questionIds)
  const chosen = listed(edit.optionIds)
  /** The options every selected question gains, if it lacks them. */
  const gained = edit.action === 'remove' ? [] : edit.optionIds
  /** Which of the attribute's options a selected question loses. */
  const dropped = (optionId: SQL): SQL => {
    if (edit.action === 'add') return sql`0`
    return edit.action === 'remove' ? sql`${optionId} in ${chosen}` : sql`${optionId} not in ${chosen}`
  }
  // The outer column is spelled `${questions}.id`: a bare `id` would bind inside the subquery.
  const valuesOfQuestion = sql`select 1 from ${questionOptions} as held
    join ${options} as held_option on held_option.id = held.option_id
    where held.question_id = ${questions}.id and held_option.attribute_id = ${attribute.id}`

  /**
   * Fails the batch when what was checked no longer holds: a selected question, the attribute or a
   * chosen option is gone, the attribute changed its mode, or a required one was left empty. It
   * does so by inserting an invalid row.
   */
  const guard = db.run(sql`insert into ${questions} (id, scenario_id, question, answer)
    select null, null, null, null where
      (select count(*) from ${questions}
        where ${questions.scenario_id} = ${sid} and ${questions.id} in ${ids}) <> ${edit.questionIds.length}
      or not exists (select 1 from ${attributes}
        where ${attributes.id} = ${attribute.id} and ${attributes.scenario_id} = ${sid}
          and ${attributes.selection_mode} = ${attribute.selectionMode})
      or (select count(*) from ${options}
        where ${options.attribute_id} = ${attribute.id} and ${options.id} in ${chosen}) <> ${edit.optionIds.length}
      or exists (select 1 from ${questions}
        where ${questions}.id in ${ids}
          and exists (select 1 from ${attributes}
            where ${attributes.id} = ${attribute.id} and ${attributes.required} = 1)
          and not exists (${valuesOfQuestion}))`)

  try {
    const [bumped] = await db.batch([
      // First: it takes the write lock, and sees the values as they were before this change.
      db
        .update(questions)
        .set({ updated_at: Date.now() })
        .where(
          and(
            eq(questions.scenario_id, sid),
            sql`${questions}.id in ${ids}`,
            sql`(exists (${valuesOfQuestion} and ${dropped(sql`held.option_id`)})
              or exists (select 1 from json_each(${JSON.stringify(gained)}) as wanted
                where not exists (select 1 from ${questionOptions} as held
                  where held.question_id = ${questions}.id and held.option_id = wanted.value)))`,
          ),
        ),
      db.run(sql`delete from ${questionOptions}
        where ${questionOptions.question_id} in (select ${questions.id} from ${questions}
            where ${questions.scenario_id} = ${sid} and ${questions.id} in ${ids})
          and ${questionOptions.option_id} in (select ${options.id} from ${options}
            where ${options.attribute_id} = ${attribute.id} and ${dropped(sql`${options}.id`)})`),
      // `or ignore`: a question already holding the option keeps it once.
      db.run(sql`insert or ignore into ${questionOptions} (question_id, option_id)
        select ${questions}.id, ${options}.id from ${questions}, ${options}
        where ${questions.scenario_id} = ${sid} and ${questions}.id in ${ids}
          and ${options.attribute_id} = ${attribute.id} and ${options}.id in ${listed(gained)}`),
      guard,
    ])
    return { updated: bumped.rowsAffected }
  } catch (err) {
    // Something changed under us: say what is wrong with the edit now, if anything is.
    await requireValidEdit(db, userId, sid, edit)
    throw err
  }
}
