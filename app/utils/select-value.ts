/** Reka refuses an empty item value, which here is a real choice ("All scenarios", default sorting). */
const EMPTY = '__empty__'

export const toItemValue = (value: string) => (value === '' ? EMPTY : value)
export const fromItemValue = (value: string) => (value === EMPTY ? '' : value)
