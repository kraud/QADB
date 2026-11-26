import type { AttributeValues, Scenario, Usage } from '../scenario/types'

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

export interface ScenarioSummary {
  id: string
  name: string
  questionCount: number
  incompleteCount: number
}

/** A scenario as read on its own: its definition with usage and counts. */
export type ScenarioDetail = Scenario & { usage: Usage; questionCount: number; incompleteCount: number }
