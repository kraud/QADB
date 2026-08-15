import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Unix milliseconds at the moment a row is inserted. */
const nowMs = sql`(CAST(strftime('%s', 'now') AS INTEGER) * 1000)`

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  created_at: integer('created_at').notNull().default(nowMs),
})

export const questions = sqliteTable(
  'questions',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer_summary: text('answer_summary').notNull(),
    difficulty: text('difficulty').notNull(),
    importance: text('importance').notNull(),
    category: text('category').notNull(),
    link: text('link'),
    mastered: integer('mastered').notNull().default(0),
    created_at: integer('created_at').notNull().default(nowMs),
    updated_at: integer('updated_at').notNull().default(nowMs),
  },
  (table) => [
    index('questions_user_id_idx').on(table.user_id),
    index('questions_user_difficulty_idx').on(table.user_id, table.difficulty),
    index('questions_user_importance_idx').on(table.user_id, table.importance),
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
