// Page-driving steps for the question list, the editor and the detail page.
// CSS locators are used only where the app gives an element no accessible name or role.
import type { Locator, Page } from '@playwright/test'
import { visit } from './auth'
import { chooseOption } from './controls'

/** Option labels are those of the front-end scenario fixture. */
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
    (res) =>
      /^\/api\/scenarios\/[^/]+\/questions$/.test(new URL(res.url()).pathname) && res.request().method() === 'GET',
  )
  await Promise.all([response, action()])
}

/** Opens the question list of a scenario and waits for its first load. */
export async function openContent(page: Page, sid: string) {
  await reloadingList(page, () => visit(page, `/scenarios/${sid}/content`))
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
  // Hidden ones included: an open dialog hides the list behind it from role queries.
  return page.getByRole('row', { includeHidden: true }).filter({ hasText: text })
}

export async function selectQuestion(page: Page, text: string) {
  await questionRow(page, text).getByRole('checkbox').check()
}

export async function selectAllShown(page: Page) {
  await page.getByRole('checkbox', { name: 'Select all shown' }).check()
}

export async function sortBy(
  page: Page,
  label: 'Difficulty' | 'Importance' | 'Track record %' | 'Track record amount',
) {
  await reloadingList(page, () => chooseOption(page.getByRole('combobox', { name: 'Sort by' }), label))
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

/** Toggles an attribute option chip. */
export async function toggleFilterChip(page: Page, name: string) {
  await reloadingList(page, () => filtersPanel(page).getByRole('button', { name, exact: true }).click())
}

/** Toggles the "None" chip of an attribute, which finds the questions without a value for it. */
export async function toggleNoneChip(page: Page, attribute: string) {
  const chip = filtersPanel(page)
    .getByRole('group', { name: attribute, exact: true })
    .getByRole('button', { name: 'None', exact: true })
  await reloadingList(page, () => chip.click())
}

export async function chooseFilterOption(
  page: Page,
  group: 'Never been done' | 'Mastered',
  option: 'All' | 'Yes' | 'No',
) {
  const button = filtersPanel(page)
    .getByRole('group', { name: group, exact: true })
    .getByRole('radio', { name: option, exact: true })
  await reloadingList(page, () => button.click())
}

export async function chooseAmountOperator(page: Page, operator: 'all' | '>' | '<' | '=') {
  await reloadingList(page, () => chooseOption(page.getByRole('combobox', { name: 'Operator' }), operator))
}

export async function setPracticeCount(page: Page, count: number) {
  await reloadingList(page, () => page.getByRole('spinbutton', { name: 'Practice count' }).fill(String(count)))
}

export async function toggleRecentlyFailed(page: Page) {
  await reloadingList(page, () =>
    page.getByRole('switch', { name: 'Only questions whose last attempt was incorrect' }).click(),
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

// ─── incomplete questions ────────────────────────────────────────────────

/** The banner counting the incomplete questions; absent when there are none. */
export function incompleteBanner(page: Page): Locator {
  return page.getByRole('region', { name: 'Incomplete questions' })
}

export async function showIncomplete(page: Page) {
  await reloadingList(page, () => incompleteBanner(page).getByRole('button', { name: 'Show' }).click())
}

export function incompleteSwitch(page: Page): Locator {
  return filtersPanel(page).getByRole('switch', { name: 'Incomplete', exact: true })
}

export async function toggleIncompleteFilter(page: Page) {
  await reloadingList(page, () => incompleteSwitch(page).click())
}

// ─── bulk editing ────────────────────────────────────────────────────────

/** Selects a question's card in the list shown on narrow screens. */
export async function selectCard(page: Page, text: string) {
  await page.locator('.mcard').filter({ hasText: text }).getByRole('checkbox').check()
}

export function bulkDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Edit attributes' })
}

export async function openBulkEditor(page: Page) {
  await page.getByRole('button', { name: 'Edit attributes', exact: true }).click()
  await bulkDialog(page).waitFor()
}

export function bulkAttribute(page: Page): Locator {
  return bulkDialog(page).getByRole('combobox', { name: 'Attribute' })
}

export function bulkAction(page: Page): Locator {
  return bulkDialog(page).getByRole('combobox', { name: 'Action' })
}

export async function chooseBulkAttribute(page: Page, label: string) {
  await chooseOption(bulkAttribute(page), label)
}

export async function chooseBulkAction(page: Page, label: 'Set' | 'Clear' | 'Add' | 'Replace' | 'Remove') {
  await chooseOption(bulkAction(page), label)
}

/** An option in the bulk dialog; `aria-pressed` says whether it is chosen. */
export function bulkOption(page: Page, name: string): Locator {
  return bulkDialog(page).getByRole('button', { name, exact: true })
}

export async function toggleBulkOption(page: Page, name: string) {
  await bulkOption(page, name).click()
}

export function applyButton(page: Page): Locator {
  return bulkDialog(page).getByRole('button', { name: 'Apply' })
}

/** Applies the change and waits for the list to be read again. The caller asserts the outcome. */
export async function applyBulk(page: Page) {
  await reloadingList(page, () => applyButton(page).click())
}

export async function cancelBulk(page: Page) {
  await bulkDialog(page).getByRole('button', { name: 'Cancel' }).click()
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
  return editor(page).getByLabel('Answer', { exact: true })
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
  await editor(page).getByRole('radio', { name: 'Display' }).click()
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

/** The editor's control for one attribute. */
export function editorAttribute(page: Page, name: string): Locator {
  return editor(page).getByRole('group', { name, exact: true })
}

/** An option of an attribute in the editor: a radio in a segmented control, otherwise a chip. */
export function editorOption(page: Page, attribute: string, option: string): Locator {
  const field = editorAttribute(page, attribute)
  const exactly = { name: option, exact: true }
  return field.getByRole('radio', exactly).or(field.getByRole('button', exactly))
}

/** The chosen options of an attribute in the editor. */
export function chosenEditorOptions(page: Page, attribute: string): Locator {
  const field = editorAttribute(page, attribute)
  return field.getByRole('radio', { checked: true }).or(field.getByRole('button', { pressed: true }))
}

export async function chooseEditorOption(page: Page, attribute: string, option: string) {
  await editorOption(page, attribute, option).click()
}

export function linkField(page: Page): Locator {
  return editor(page).getByLabel('Link', { exact: true })
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
    for (const name of input.categories) {
      if (name !== 'JS') await chooseEditorOption(page, 'Category', name)
    }
    if (!input.categories.includes('JS')) await chooseEditorOption(page, 'Category', 'JS')
  }
  if (input.link) await linkField(page).fill(input.link)
  await saveEditor(page)
}

// ─── detail ──────────────────────────────────────────────────────────────

export async function openDetail(page: Page, sid: string, id: string) {
  await visit(page, `/scenarios/${sid}/questions/${id}`)
}

export function masteredSwitch(page: Page): Locator {
  return page.getByRole('switch', { name: 'Mark as mastered' })
}

export async function setMastered(page: Page, mastered: boolean) {
  await masteredSwitch(page).setChecked(mastered)
}

/** The result column of the track record table, top row first. */
export function trackRecordResults(page: Page): Locator {
  return page.locator('.tr-table tbody td.res')
}

/** "Times practiced", "Correct" and the percentage above the track record table. */
export function trackRecordSummary(page: Page): Locator {
  return page.locator('.track-summary .ts')
}
