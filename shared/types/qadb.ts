export interface QuestionStats {
  attemptCount: number
  correctCount: number
  trackRecordPct: number | null
  lastAnsweredAt: number | null
  lastCorrect: number | null
}

export interface QuestionWithStats {
  id: string
  question: string
  answer_summary: string
  difficulty: string
  importance: string
  category: string
  link: string | null
  mastered: number
  created_at: number
  updated_at: number
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
  op: '>' | '<' | '='
  n: number
  recent: boolean
  q: string
}

export type SortKey = '' | 'difficulty' | 'importance' | 'pct' | 'amount'
