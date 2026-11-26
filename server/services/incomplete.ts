import { sql } from 'drizzle-orm'
import { attributes, options, questionOptions, questions } from '../../db/schema'

/**
 * True for an incomplete question: some required attribute of its scenario has no option on it.
 * Correlated with `questions`, so the surrounding query must select from that table, unaliased.
 */
// The outer columns are spelled `${questions}.x`: drizzle drops the table name from a column
// reference in single-table queries, and a bare `id` would bind to a table inside the subquery.
export const isIncomplete = sql`exists (
  select 1 from ${attributes} as required_attribute
  where required_attribute.scenario_id = ${questions}.scenario_id
    and required_attribute.required = 1
    and not exists (
      select 1 from ${questionOptions} as chosen
      join ${options} as chosen_option on chosen_option.id = chosen.option_id
      where chosen.question_id = ${questions}.id
        and chosen_option.attribute_id = required_attribute.id
    )
)`.mapWith(Boolean)
