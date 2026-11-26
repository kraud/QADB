// Page-driving steps for the scenario list and the scenario editor.
// CSS locators are used only where the app gives an element no accessible name or role.
import type { Locator, Page } from '@playwright/test'
import { visit } from './auth'

export interface OptionDefinition {
  label: string
  /** A color name as the picker shows it, e.g. "Red". Left as proposed when absent. */
  color?: string
  isDefault?: boolean
}

export interface AttributeDefinition {
  name: string
  mode?: 'Single' | 'Multiple'
  ordered?: boolean
  required?: boolean
  /** At least 2. */
  options: OptionDefinition[]
}

export interface ScenarioDefinition {
  name: string
  attributes?: AttributeDefinition[]
}

// ─── list ────────────────────────────────────────────────────────────────

export async function openScenarios(page: Page) {
  await visit(page, '/scenarios')
}

/** The list's entry for one scenario. */
export function scenarioCard(page: Page, name: string): Locator {
  return page.getByRole('listitem').filter({ has: page.getByRole('link', { name: `Edit ${name}`, exact: true }) })
}

/** From the list to the editor of a new scenario. */
export async function openNewScenario(page: Page) {
  await page.getByRole('link', { name: /^(New scenario|Create scenario)$/ }).click()
  await scenarioNameField(page).waitFor()
}

/** From the list to the editor of this scenario, once it has loaded. */
export async function openScenarioEditor(page: Page, name: string) {
  await page.getByRole('link', { name: `Edit ${name}`, exact: true }).click()
  await scenarioNameField(page).waitFor()
}

export async function openDeleteScenario(page: Page, name: string) {
  await page.getByRole('button', { name: `Delete ${name}`, exact: true }).click()
}

export function deleteScenarioDialog(page: Page): Locator {
  return page.getByRole('alertdialog', { name: 'Delete scenario' })
}

export function deleteScenarioNameField(page: Page): Locator {
  return deleteScenarioDialog(page).getByRole('textbox', { name: 'Type the scenario name to confirm' })
}

export function deleteScenarioButton(page: Page): Locator {
  return deleteScenarioDialog(page).getByRole('button', { name: 'Delete scenario' })
}

// ─── editor ──────────────────────────────────────────────────────────────

export function scenarioNameField(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Scenario name', exact: true })
}

/** The attribute cards, in order. */
export function attributeCards(page: Page): Locator {
  return page.getByRole('group', { name: /^Attribute: /, includeHidden: true })
}

/** The card of a named attribute. */
export function attributeCard(page: Page, name: string): Locator {
  return page.getByRole('group', { name: `Attribute: ${name}`, exact: true, includeHidden: true })
}

export function attributeNameField(card: Locator): Locator {
  return card.getByRole('textbox', { name: 'Attribute name' })
}

/** The option rows of a card, in order. */
export function optionRows(card: Locator): Locator {
  // Hidden ones included: an open dialog hides the form behind it from role queries.
  return card.getByRole('group', { name: /^Option: /, includeHidden: true })
}

export function optionRow(card: Locator, label: string): Locator {
  return card.getByRole('group', { name: `Option: ${label}`, exact: true, includeHidden: true })
}

export function optionLabelField(row: Locator): Locator {
  return row.getByRole('textbox', { name: 'Option label' })
}

export async function chooseSelectionMode(card: Locator, mode: 'Single' | 'Multiple') {
  await card.getByRole('group', { name: 'Selection mode' }).getByRole('button', { name: mode }).click()
}

// The switches draw over their native checkbox, so these clicks are forced. A forced click is not
// checked for what covers it, and the editor's save bar sticks to the bottom: scroll clear of it.
export async function setSwitch(scope: Locator, name: 'Ordered' | 'Required' | 'Default', on: boolean) {
  const checkbox = scope.getByRole('checkbox', { name, exact: true })
  await checkbox.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await checkbox.setChecked(on, { force: true })
}

export async function chooseColor(row: Locator, color: string) {
  await row.getByRole('button', { name: 'Color', exact: true }).click()
  await row.getByRole('button', { name: color, exact: true }).click()
}

export async function addOption(card: Locator, option: OptionDefinition) {
  await card.getByRole('button', { name: 'Add option' }).click()
  await fillOption(optionRows(card).last(), option)
}

async function fillOption(row: Locator, option: OptionDefinition) {
  // The row is named after its label, so it is addressed by position while the label changes.
  await optionLabelField(row).fill(option.label)
  if (option.color) await chooseColor(row, option.color)
  if (option.isDefault) await setSwitch(row, 'Default', true)
}

export async function deleteOption(card: Locator, label: string) {
  await card.getByRole('button', { name: `Delete option ${label}`, exact: true }).click()
}

export async function deleteAttribute(page: Page, name: string) {
  await page.getByRole('button', { name: `Delete attribute ${name}`, exact: true }).click()
}

/** The up and down buttons of a whole attribute; its option rows have their own. */
export async function moveAttribute(card: Locator, direction: 'up' | 'down') {
  await card.getByRole('group', { name: 'Attribute order' }).getByRole('button', { name: `Move ${direction}` }).click()
}

export async function moveOption(row: Locator, direction: 'up' | 'down') {
  await row.getByRole('button', { name: `Move ${direction}` }).click()
}

/** Adds an attribute after the others and fills it in. */
export async function addAttribute(page: Page, attribute: AttributeDefinition) {
  await page.getByRole('button', { name: 'Add attribute' }).click()
  const card = attributeCards(page).last()
  await attributeNameField(card).fill(attribute.name)
  if (attribute.mode) await chooseSelectionMode(card, attribute.mode)
  if (attribute.ordered) await setSwitch(card, 'Ordered', true)
  if (attribute.required) await setSwitch(card, 'Required', true)
  for (const [index, option] of attribute.options.entries()) {
    // A new attribute comes with two blank options.
    if (index < 2) await fillOption(optionRows(card).nth(index), option)
    else await addOption(card, option)
  }
}

export async function saveScenario(page: Page) {
  await page.getByRole('button', { name: 'Save scenario' }).click()
}

/** Creates a scenario, starting from the scenario list. The caller asserts the outcome. */
export async function createScenario(page: Page, definition: ScenarioDefinition) {
  await openScenarios(page)
  await openNewScenario(page)
  await scenarioNameField(page).fill(definition.name)
  for (const attribute of definition.attributes ?? []) await addAttribute(page, attribute)
  await saveScenario(page)
}

// ─── confirming changes ──────────────────────────────────────────────────

/** The dialog stating what saving does to existing questions. */
export function changesDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Confirm changes' })
}

/** The choice for the questions holding a deleted option. */
export function optionChoice(page: Page, label: string): Locator {
  return changesDialog(page).getByRole('combobox', { name: `Questions using ${label}` })
}

export async function confirmChanges(page: Page) {
  await changesDialog(page).getByRole('button', { name: 'Save changes' }).click()
}

export async function cancelChanges(page: Page) {
  await changesDialog(page).getByRole('button', { name: 'Cancel' }).click()
}
