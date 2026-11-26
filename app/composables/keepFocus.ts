/**
 * Keeps the keyboard where it was after an up or down button moved its row: moving the row drops
 * the focus, and at either end the button is disabled, so its neighbor takes over.
 */
export async function keepFocus(button: EventTarget | null) {
  if (!(button instanceof HTMLButtonElement)) return
  await nextTick()
  const target = button.disabled ? button.parentElement?.querySelector<HTMLButtonElement>('button:enabled') : button
  target?.focus()
}
