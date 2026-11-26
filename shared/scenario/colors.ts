/** The fixed palette options pick from; each key has a light and a dark `--c-<key>` CSS variable. */
export const COLOR_KEYS = [
  'blue-1',
  'blue-2',
  'blue-3',
  'gray-1',
  'gray-2',
  'gray-3',
  'orange',
  'cyan',
  'yellow',
  'violet',
  'green',
  'pink',
  'red',
] as const

export type ColorKey = (typeof COLOR_KEYS)[number]

export const colorVar = (key: ColorKey) => `var(--c-${key})`
