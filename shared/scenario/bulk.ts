import type { Attribute, AttributeValues, SelectionMode } from './types'

export type BulkAction = 'set' | 'clear' | 'add' | 'replace' | 'remove'

export type BulkPlan =
  | { ok: true; changes: { id: string; optionIds: string[] }[] }
  | { ok: false; reason: 'invalid' | 'would-empty'; count: number }

const ACTION_MODE: Record<BulkAction, SelectionMode> = {
  set: 'single',
  clear: 'single',
  add: 'multiple',
  replace: 'multiple',
  remove: 'multiple',
}

/** Whether the chosen options suit the action. `clear` takes none, so any sent with it are ignored. */
function validChoice(attribute: Attribute, action: BulkAction, chosen: Set<string>): boolean {
  if (action === 'clear') return true
  if (action === 'set' ? chosen.size !== 1 : chosen.size === 0) return false
  return [...chosen].every((id) => attribute.options.some((option) => option.id === id))
}

/**
 * Works out what one attribute change does to a list of questions, listing only those that change.
 * It is rejected as a whole if it would leave a required attribute empty on any of them; `count`
 * says on how many (0 for an invalid request).
 */
export function planBulk(
  attr: Attribute,
  items: { id: string; values: AttributeValues }[],
  action: BulkAction,
  optionIds: string[],
): BulkPlan {
  const chosen = new Set(optionIds)
  if (ACTION_MODE[action] !== attr.selectionMode || !validChoice(attr, action, chosen)) {
    return { ok: false, reason: 'invalid', count: 0 }
  }

  const keeps = (current: Set<string>, optionId: string) => {
    switch (action) {
      case 'clear': return false
      case 'add': return current.has(optionId) || chosen.has(optionId)
      case 'remove': return current.has(optionId) && !chosen.has(optionId)
      default: return chosen.has(optionId)
    }
  }

  const results = items.map((item) => {
    const current = new Set(item.values[attr.id])
    const next = attr.options.map((option) => option.id).filter((id) => keeps(current, id))
    const changed = next.length !== current.size || next.some((id) => !current.has(id))
    return { id: item.id, optionIds: next, changed }
  })

  const emptied = attr.required ? results.filter((result) => !result.optionIds.length).length : 0
  if (emptied) return { ok: false, reason: 'would-empty', count: emptied }

  return {
    ok: true,
    changes: results.filter((result) => result.changed).map(({ id, optionIds }) => ({ id, optionIds })),
  }
}
