import { z } from 'zod'
import { COLOR_KEYS } from './colors'

const NAME_MAX = 80
const LABEL_MAX = 40

/** Trimmed, non-blank text of at most `max` characters. */
const text = (what: 'name' | 'label', max: number) =>
  z.string().trim().min(1, `Enter a ${what}`).max(max, `Use at most ${max} characters`)

/** How names and labels are compared for uniqueness. */
export const nameKey = (name: string) => name.trim().toLocaleLowerCase()

/** Indexes of the entries repeating an earlier name. Blank ones are reported as blank instead. */
function repeatedIndexes(names: string[]): number[] {
  const seen = new Set<string>()
  return names.flatMap((name, index) => {
    const key = nameKey(name)
    if (!key) return []
    if (seen.has(key)) return [index]
    seen.add(key)
    return []
  })
}

const optionInputSchema = z.object({
  id: z.string().min(1).optional(),
  /** Names a not-yet-saved option, so that a request can refer to it. */
  ref: z.string().min(1).optional(),
  label: text('label', LABEL_MAX),
  color: z.enum(COLOR_KEYS),
  isDefault: z.boolean(),
})

const attributeInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: text('name', NAME_MAX),
    selectionMode: z.enum(['single', 'multiple']),
    ordered: z.boolean(),
    required: z.boolean(),
    options: z.array(optionInputSchema).min(2, 'Add at least 2 options'),
  })
  .superRefine((attribute, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message })

    for (const index of repeatedIndexes(attribute.options.map((option) => option.label))) {
      issue(['options', index, 'label'], 'Option labels must be unique')
    }

    if (attribute.selectionMode !== 'single') {
      if (attribute.ordered) issue(['ordered'], 'Only single selection can be ordered')
      return
    }
    const defaults = attribute.options.flatMap((option, index) => (option.isDefault ? [index] : []))
    for (const index of defaults.slice(1)) {
      issue(['options', index, 'isDefault'], 'Single selection allows one default')
    }
  })

/** Reports each id or ref that an earlier entry already used, anywhere in the scenario. */
function rejectRepeats(ctx: z.RefinementCtx, entries: { value: string | undefined; path: (string | number)[] }[]) {
  const seen = new Set<string>()
  for (const { value, path } of entries) {
    if (value === undefined) continue
    if (seen.has(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `Each ${path.at(-1)} can be used only once` })
    }
    seen.add(value)
  }
}

/** A whole scenario as the editor saves it. Positions come from array order. */
export const scenarioInputSchema = z.object({
  name: text('name', NAME_MAX),
  attributes: z.array(attributeInputSchema).superRefine((attributes, ctx) => {
    for (const index of repeatedIndexes(attributes.map((attribute) => attribute.name))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'name'], message: 'Attribute names must be unique' })
    }
    rejectRepeats(
      ctx,
      attributes.map((attribute, a) => ({ value: attribute.id, path: [a, 'id'] })),
    )
    for (const key of ['id', 'ref'] as const) {
      rejectRepeats(
        ctx,
        attributes.flatMap((attribute, a) =>
          attribute.options.map((option, o) => ({ value: option[key], path: [a, 'options', o, key] })),
        ),
      )
    }
  }),
})

export type ScenarioInput = z.infer<typeof scenarioInputSchema>
