import type { AttributeValues } from '../scenario/types'

export interface QuestionStats {
  attemptCount: number
  correctCount: number
  trackRecordPct: number | null
  lastAnsweredAt: number | null
  lastCorrect: number | null
}

export interface QuestionWithStats {
  id: string
  scenarioId: string
  question: string
  answer: string
  link: string | null
  mastered: number
  created_at: number
  updated_at: number
  /** An entry for every attribute of the scenario, empty where nothing is chosen. */
  values: AttributeValues
  /** Some required attribute has no option. */
  incomplete: boolean
  stats: QuestionStats
}

export interface AttemptRow {
  id: string
  correct: number
  answered_at: number
}

export interface Filters {
  diff: string[]
  imp: string[]
  cat: string[]
  nbd: 'all' | 'yes' | 'no'
  mastered: 'all' | 'yes' | 'no'
  op: 'all' | '>' | '<' | '='
  n: number
  recent: boolean
  q: string
}

export type SortKey = '' | 'difficulty' | 'importance' | 'pct' | 'amount'
