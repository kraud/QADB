// Mirrors the DDL in `scripts/db/migrations/0001-scenarios.mjs`, which is what creates the tables.
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { ColorKey } from '../shared/scenario/colors'

/** Unix milliseconds at the moment a row is inserted. */
const nowMs = sql`(CAST(strftime('%s', 'now') AS INTEGER) * 1000)`

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  created_at: integer('created_at').notNull().default(nowMs),
})

export const scenarios = sqliteTable(
  'scenarios',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    created_at: integer('created_at').notNull().default(nowMs),
    updated_at: integer('updated_at').notNull().default(nowMs),
  },
  (table) => [index('scenarios_user_id_idx').on(table.user_id)],
)

export const attributes = sqliteTable(
  'attributes',
  {
    id: text('id').primaryKey(),
    scenario_id: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    selection_mode: text('selection_mode', { enum: ['single', 'multiple'] }).notNull(),
    ordered: integer('ordered', { mode: 'boolean' }).notNull().default(false),
    required: integer('required', { mode: 'boolean' }).notNull().default(false),
    position: integer('position').notNull(),
  },
  (table) => [index('attributes_scenario_id_idx').on(table.scenario_id)],
)

export const options = sqliteTable(
  'options',
  {
    id: text('id').primaryKey(),
    attribute_id: text('attribute_id')
      .notNull()
      .references(() => attributes.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    color: text('color').$type<ColorKey>().notNull(),
    position: integer('position').notNull(),
    is_default: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [index('options_attribute_id_idx').on(table.attribute_id)],
)

export const questions = sqliteTable(
  'questions',
  {
    id: text('id').primaryKey(),
    scenario_id: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    link: text('link'),
    mastered: integer('mastered').notNull().default(0),
    created_at: integer('created_at').notNull().default(nowMs),
    updated_at: integer('updated_at').notNull().default(nowMs),
  },
  (table) => [index('questions_scenario_id_idx').on(table.scenario_id)],
)

export const questionOptions = sqliteTable(
  'question_options',
  {
    question_id: text('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    option_id: text('option_id')
      .notNull()
      .references(() => options.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.question_id, table.option_id] }),
    index('question_options_option_id_idx').on(table.option_id),
  ],
)

export const attempts = sqliteTable(
  'attempts',
  {
    id: text('id').primaryKey(),
    question_id: text('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    correct: integer('correct').notNull(),
    answered_at: integer('answered_at').notNull().default(nowMs),
  },
  (table) => [
    index('attempts_question_answered_idx').on(table.question_id, table.answered_at),
    index('attempts_user_answered_idx').on(table.user_id, table.answered_at),
  ],
)
