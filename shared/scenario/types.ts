import type { ColorKey } from './colors'

export type SelectionMode = 'single' | 'multiple'

export interface Option {
  id: string
  label: string
  color: ColorKey
  position: number
  isDefault: boolean
}

export interface Attribute {
  id: string
  name: string
  selectionMode: SelectionMode
  ordered: boolean
  required: boolean
  position: number
  /** Sorted by `position`. */
  options: Option[]
}

export interface Scenario {
  id: string
  name: string
  /** Sorted by `position`. */
  attributes: Attribute[]
}

/** Chosen option ids (in option order) keyed by attribute id. */
export type AttributeValues = Record<string, string[]>
