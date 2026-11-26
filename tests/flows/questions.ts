// Page-driving steps for the question list, the editor and the detail page.
// CSS locators are used only where the app gives an element no accessible name or role.
import type { Locator, Page } from '@playwright/test'
import { visit } from './auth'

export interface QuestionInput {
  question: string
  answer: string
  difficulty?: 'Easy' | 'Medium' | 'Hard'
  importance?: 'Low' | 'Mid' | 'High'
  categories?: string[]
  link?: string
}

/** Runs `action` and waits for the list request it triggers. */
async function reloadingList(page: Page, action: () => Promise<unknown>) {
  const response = page.waitForResponse(
    (res) => new URL(res.url()).pathname === '/api/questions' && res.request().method() === 'GET',
  )
  await Promise.all([response, action()])
}

/** Opens the question list and waits for its first load. */
export async function openContent(page: Page) {
  await reloadingList(page, () => visit(page, '/content'))
}

// ─── list ────────────────────────────────────────────────────────────────

/** Question texts in the desktop table, in display order. */
export function listedQuestions(page: Page): Locator {
  return page.locator('.qtable:not(.sk-table) .q-cell')
}

/** The desktop table, hidden on narrow screens. */
export function questionTable(page: Page): Locator {
  return page.locator('.qtable')
}

/** Question texts in the card list shown on narrow screens. */
export function questionCards(page: Page): Locator {
  return page.locator('.mcard .q')
}

export function questionRow(page: Page, text: string): Locator {
  return page.getByRole('row').filter({ hasText: text })
}

// The app draws its own box over each native checkbox, so these clicks are forced; they land on the
// drawing, inside the same label, exactly like a user's click.
export async function selectQuestion(page: Page, text: string) {
  await questionRow(page, text).getByRole('checkbox').check({ force: true })
}

export async function selectAllShown(page: Page) {
  await page.getByRole('checkbox', { name: 'Select all shown' }).check({ force: true })
}

export async function sortBy(
  page: Page,
  label: 'Difficulty' | 'Importance' | 'Track record %' | 'Track record amount',
) {
  await reloadingList(page, () => page.getByRole('combobox', { name: 'Sort by' }).selectOption({ label }))
}

export async function toggleSortDirection(page: Page) {
  await reloadingList(page, () => page.getByRole('button', { name: /^Sort (ascending|descending)$/ }).click())
}

export async function search(page: Page, text: string) {
  await reloadingList(page, () => page.getByRole('searchbox', { name: 'Search questions' }).fill(text))
}

export async function openDeleteDialog(page: Page, text: string) {
  await questionRow(page, text).getByRole('button', { name: /^Delete / }).click()
}

export async function confirmDelete(page: Page) {
  await page.getByRole('alertdialog', { name: 'Delete question' }).getByRole('button', { name: 'Delete' }).click()
}

// ─── filters ─────────────────────────────────────────────────────────────

export function filtersPanel(page: Page): Locator {
  return page.getByRole('complementary')
}

/** Toggles a difficulty, importance or category chip. */
export async function toggleFilterChip(page: Page, name: string) {
  await reloadingList(page, () => filtersPanel(page).getByRole('button', { name, exact: true }).click())
}

export async function chooseFilterOption(
  page: Page,
  group: 'Never been done' | 'Mastered',
  option: 'All' | 'Yes' | 'No',
) {
  const button = filtersPanel(page)
    .locator('.filter-group')
    .filter({ has: page.locator('.filter-title', { hasText: group }) })
    .getByRole('button', { name: option, exact: true })
  await reloadingList(page, () => button.click())
}

export async function chooseAmountOperator(page: Page, operator: 'all' | '>' | '<' | '=') {
  await reloadingList(page, () => page.getByRole('combobox', { name: 'Operator' }).selectOption(operator))
}

export async function setPracticeCount(page: Page, count: number) {
  await reloadingList(page, () => page.getByRole('spinbutton', { name: 'Practice count' }).fill(String(count)))
}

export async function toggleRecentlyFailed(page: Page) {
  await reloadingList(page, () =>
    page.getByRole('checkbox', { name: 'Only questions whose last attempt was incorrect' }).click(),
  )
}

/** The reset button at the bottom of the filters panel. */
export async function resetFilters(page: Page) {
  await reloadingList(page, () => filtersPanel(page).getByRole('button', { name: 'Reset filters' }).click())
}

/** Shows or hides the filters panel on narrow screens. */
export async function toggleFiltersPanel(page: Page) {
  await page.getByRole('button', { name: /^Filters/ }).click()
}

// ─── editor ──────────────────────────────────────────────────────────────

/** The add/edit dialog. */
export function editor(page: Page): Locator {
  return page.getByRole('dialog', { name: /^(Add|Edit) question$/ })
}

export function questionField(page: Page): Locator {
  return editor(page).getByLabel('Question', { exact: true })
}

export function answerField(page: Page): Locator {
  return editor(page).getByPlaceholder(/What you'd say out loud/)
}

export function answerPreview(page: Page): Locator {
  return editor(page).locator('.answer-preview')
}

export async function openNewEditor(page: Page) {
  await page.getByRole('button', { name: 'Add question', exact: true }).click()
  await questionField(page).waitFor()
}

/** Opens the editor from the table row and waits for the question to load. */
export async function openEditor(page: Page, text: string) {
  await questionRow(page, text).getByRole('button', { name: /^Edit / }).click()
  await questionField(page).waitFor()
}

export async function showAnswerPreview(page: Page) {
  await editor(page).getByRole('button', { name: 'Display' }).click()
}

export async function formatAnswer(page: Page) {
  await editor(page).getByRole('button', { name: 'Format' }).click()
}

export async function saveEditor(page: Page) {
  await editor(page).getByRole('button', { name: 'Save' }).click()
}

export async function closeEditor(page: Page) {
  await editor(page).getByRole('button', { name: 'Close' }).click()
}

export async function cancelEditor(page: Page) {
  await editor(page).getByRole('button', { name: 'Cancel' }).click()
}

export function discardDialog(page: Page): Locator {
  return page.getByRole('alertdialog', { name: 'Discard changes?' })
}

export async function keepEditing(page: Page) {
  await discardDialog(page).getByRole('button', { name: 'Keep editing' }).click()
}

export async function discardChanges(page: Page) {
  await discardDialog(page).getByRole('button', { name: 'Discard' }).click()
}

async function chooseEditorOption(page: Page, field: 'Difficulty' | 'Importance', option: string) {
  await editor(page)
    .locator('.field')
    .filter({ has: page.locator('label', { hasText: field }) })
    .getByRole('button', { name: option, exact: true })
    .click()
}

/** Fills in and saves a new question from the list page. The caller asserts the outcome. */
export async function addQuestion(page: Page, input: QuestionInput) {
  await openNewEditor(page)
  await questionField(page).fill(input.question)
  await answerField(page).fill(input.answer)
  if (input.difficulty) await chooseEditorOption(page, 'Difficulty', input.difficulty)
  if (input.importance) await chooseEditorOption(page, 'Importance', input.importance)
  if (input.categories) {
    // A new question starts with JS, and the last selected category cannot be removed.
    const chip = (name: string) => editor(page).getByRole('button', { name, exact: true })
    for (const name of input.categories) {
      if (name !== 'JS') await chip(name).click()
    }
    if (!input.categories.includes('JS')) await chip('JS').click()
  }
  if (input.link) await editor(page).getByLabel(/^Link to original/).fill(input.link)
  await saveEditor(page)
}

// ─── detail ──────────────────────────────────────────────────────────────

export async function openDetail(page: Page, id: string) {
  await visit(page, `/questions/${id}`)
}

export function masteredSwitch(page: Page): Locator {
  return page.getByRole('checkbox', { name: 'Mark as mastered' })
}

export async function setMastered(page: Page, mastered: boolean) {
  await masteredSwitch(page).setChecked(mastered, { force: true }) // drawn over, like the checkboxes
}

/** The result column of the track record table, top row first. */
export function trackRecordResults(page: Page): Locator {
  return page.locator('.tr-table tbody td.res')
}

/** "Times practiced", "Correct" and the percentage above the track record table. */
export function trackRecordSummary(page: Page): Locator {
  return page.locator('.track-summary .ts')
}
