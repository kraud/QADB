import { expect, test, type Page } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import { answerCurrent, currentQuestion, startSelectedPractice } from '../flows/practice'
import {
  addQuestion,
  chooseEditorOption,
  confirmDelete,
  editor,
  editorAttribute,
  incompleteBanner,
  incompleteSwitch,
  listedQuestions,
  masteredSwitch,
  openContent,
  openDeleteDialog,
  openEditor,
  questionRow,
  resetFilters,
  saveEditor,
  search,
  selectQuestion,
  setMastered,
  showIncomplete,
  toggleIncompleteFilter,
} from '../flows/questions'
import { addAttribute, openScenarioEditor, openScenarios, saveScenario } from '../flows/scenarios'
import { fetchQuestion, resetUserData, seedQuestions } from '../support/reset'
import {
  addAttribute as addAttributeByApi,
  createFrontendScenario,
  createScenario,
  json,
} from '../support/scenario-fixture'
import { toast } from '../flows/controls'

const FIRST = 'First: what is a closure?'
const SECOND = 'Second: how does flexbox work?'
const NEW = 'New: what is a hook?'
const NO_MATCH = 'No questions match these filters'

let scenario: Scenario

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
  scenario = await createFrontendScenario(page.request)
})

/** Both questions lack the required "Level", added after them. */
async function seedIncomplete(page: Page) {
  const ids = await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  await addAttributeByApi(page.request, scenario, { name: 'Level', labels: ['Junior', 'Senior'], required: true })
  return ids
}

test('adding a required attribute shows the banner; Show lists the incomplete questions', async ({ page }) => {
  await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  await openContent(page, scenario.id)
  await expect(listedQuestions(page)).toHaveText([FIRST, SECOND])
  await expect(incompleteBanner(page)).toHaveCount(0)

  await page.getByRole('navigation').getByRole('link', { name: 'Scenarios' }).click()
  await openScenarioEditor(page, scenario.name)
  await addAttribute(page, { name: 'Level', required: true, options: [{ label: 'Junior' }, { label: 'Senior' }] })
  await saveScenario(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  await expect(incompleteBanner(page)).toContainText('2 incomplete questions')

  await addQuestion(page, { question: NEW, answer: 'An answer.' })
  // The editor refuses to save without the new attribute.
  await expect(editorAttribute(page, 'Level').getByText('Level is required')).toBeVisible()
  await chooseEditorOption(page, 'Level', 'Junior')
  await saveEditor(page)
  await expect(listedQuestions(page)).toHaveText([FIRST, SECOND, NEW])
  await expect(incompleteBanner(page)).toContainText('2 incomplete questions')
  await expect(questionRow(page, FIRST).getByText('Incomplete', { exact: true })).toBeVisible()
  await expect(questionRow(page, FIRST).getByTitle('Level')).toHaveText('—')
  await expect(questionRow(page, NEW).getByText('Incomplete', { exact: true })).toHaveCount(0)

  // Show leaves out whatever else was narrowing the list, so that it lists all the banner counts.
  await search(page, 'First')
  await expect(listedQuestions(page)).toHaveText([FIRST])
  await showIncomplete(page)

  await expect(listedQuestions(page)).toHaveText([FIRST, SECOND])
  await expect(incompleteSwitch(page)).toBeChecked()
  await expect(page.getByRole('searchbox', { name: 'Search questions' })).toHaveValue('')
  await expect(page.getByRole('complementary')).toContainText('1 active')

  await toggleIncompleteFilter(page)
  await expect(listedQuestions(page)).toHaveText([FIRST, SECOND, NEW])
  await toggleIncompleteFilter(page)
  await expect(listedQuestions(page)).toHaveText([FIRST, SECOND])
  await resetFilters(page)
  await expect(incompleteSwitch(page)).not.toBeChecked()
  await expect(listedQuestions(page)).toHaveText([FIRST, SECOND, NEW])
})

test('the editor highlights what is missing and blocks save until chosen', async ({ page }) => {
  const [first] = await seedIncomplete(page)
  await openContent(page, scenario.id)
  await showIncomplete(page)
  await selectQuestion(page, FIRST)

  await openEditor(page, FIRST)
  const level = editorAttribute(page, 'Level')
  await expect(level.getByText('Level is required')).toBeVisible()
  await saveEditor(page)
  await expect(editor(page)).toBeVisible()
  expect((await fetchQuestion(page.request, first!)).incomplete).toBe(true)
  await chooseEditorOption(page, 'Level', 'Senior')
  await saveEditor(page)

  // The fixed question leaves the filtered list and the selection.
  await expect(listedQuestions(page)).toHaveText([SECOND])
  await expect(toast(page, 'Selection adjusted to the current results')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start practice' })).toHaveCount(0)
  await expect(incompleteBanner(page)).toContainText('1 incomplete question')
  await expect(incompleteBanner(page)).not.toContainText('questions')
})

test('mastered and practice work on an incomplete question', async ({ page }) => {
  const [first] = await seedIncomplete(page)
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST], true)

  await expect(currentQuestion(page)).toHaveText(FIRST)
  await answerCurrent(page, true)
  await expect(toast(page, 'Correct — recorded')).toBeVisible()
  await setMastered(page, true)
  await expect(masteredSwitch(page)).toBeChecked()

  await expect.poll(async () => (await fetchQuestion(page.request, first!)).mastered).toBe(1)
  const stored = await fetchQuestion(page.request, first!)
  expect(stored.incomplete).toBe(true)
  expect(stored.attempts.map((a) => a.correct)).toEqual([1])
})

test('banner disappears when none remain', async ({ page }) => {
  await seedIncomplete(page)
  await openContent(page, scenario.id)
  await showIncomplete(page)

  await openEditor(page, FIRST)
  await chooseEditorOption(page, 'Level', 'Junior')
  await saveEditor(page)
  await expect(incompleteBanner(page)).toContainText('1 incomplete question')

  await openDeleteDialog(page, SECOND)
  await confirmDelete(page)

  await expect(incompleteBanner(page)).toHaveCount(0)
  // The filter is still on, and there is a way out of the empty list.
  await expect(page.getByRole('heading', { name: NO_MATCH })).toBeVisible()
  await expect(incompleteSwitch(page)).toBeChecked()
  await toggleIncompleteFilter(page)
  await expect(listedQuestions(page)).toHaveText([FIRST])
})

test('the banner is current after a question is fixed on its detail page', async ({ page }) => {
  await seedIncomplete(page)
  await openContent(page, scenario.id)
  await expect(incompleteBanner(page)).toContainText('2 incomplete questions')

  await questionRow(page, FIRST).getByText(FIRST).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await chooseEditorOption(page, 'Level', 'Junior')
  await saveEditor(page)
  await expect(editor(page)).toBeHidden()
  await page.getByRole('link', { name: 'Back to content' }).click()

  await expect(incompleteBanner(page)).toContainText('1 incomplete question')
})

test('a scenario without attributes has no banner, filter or bulk editing', async ({ page }) => {
  const plain = await createScenario(page.request, { name: 'Plain', attributes: [] })
  await json(page.request.post(`/api/scenarios/${plain.id}/questions`, { data: { question: FIRST, answer: 'A.', values: {} } }))
  await openContent(page, plain.id)
  await selectQuestion(page, FIRST)

  await expect(page.getByRole('button', { name: 'Start practice' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit attributes' })).toHaveCount(0)
  await expect(incompleteBanner(page)).toHaveCount(0)
  await expect(incompleteSwitch(page)).toHaveCount(0)
  await expect(page.getByText('Incomplete', { exact: true })).toHaveCount(0)
})
