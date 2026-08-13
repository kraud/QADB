import { z } from 'zod'

export const DIFFICULTY = ['easy', 'medium', 'hard'] as const
export const DIFFICULTY_ORDER: Record<string, number> = { easy: 1, medium: 2, hard: 3 }

export const IMPORTANCE = ['low', 'mid', 'high'] as const
export const IMPORTANCE_ORDER: Record<string, number> = { low: 1, mid: 2, high: 3 }

export const CATEGORY = ['HTML', 'CSS', 'JS', 'API', 'React'] as const

export const difficultySchema = z.enum(['easy', 'medium', 'hard'])
export const importanceSchema = z.enum(['low', 'mid', 'high'])
export const categorySchema = z.enum(['HTML', 'CSS', 'JS', 'API', 'React'])

export type Difficulty = (typeof DIFFICULTY)[number]
export type Importance = (typeof IMPORTANCE)[number]
export type Category = (typeof CATEGORY)[number]

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
export const IMPORTANCE_LABEL: Record<Importance, string> = { low: 'Low', mid: 'Mid', high: 'High' }

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: 'var(--diff-easy)',
  medium: 'var(--diff-med)',
  hard: 'var(--diff-hard)',
}
export const IMPORTANCE_COLOR: Record<Importance, string> = {
  low: 'var(--imp-low)',
  mid: 'var(--imp-mid)',
  high: 'var(--imp-high)',
}
export const CATEGORY_COLOR: Record<Category, string> = {
  HTML: 'var(--cat-html)',
  CSS: 'var(--cat-css)',
  JS: 'var(--cat-js)',
  API: 'var(--cat-api)',
  React: 'var(--cat-react)',
}
