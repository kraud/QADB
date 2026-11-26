// Driving the shared controls. No assertions: recording scripts import these.
import type { Locator } from '@playwright/test'

/** The options of the open list. */
export function listOptions(trigger: Locator): Locator {
  return trigger.page().getByRole('listbox').getByRole('option')
}

/** Opens a select and returns its options; close it again with `closeList`. */
export async function openList(trigger: Locator): Promise<Locator> {
  await trigger.click()
  await trigger.page().getByRole('listbox').waitFor()
  return listOptions(trigger)
}

export async function closeList(trigger: Locator) {
  await trigger.page().keyboard.press('Escape')
  await trigger.page().getByRole('listbox').waitFor({ state: 'detached' })
}

/** Picks the option with this exact label. */
export async function chooseOption(trigger: Locator, label: string) {
  const options = await openList(trigger)
  await options.and(trigger.page().getByRole('option', { name: label, exact: true })).click()
  await trigger.page().getByRole('listbox').waitFor({ state: 'detached' })
}
