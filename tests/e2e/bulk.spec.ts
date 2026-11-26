import { expect, test, type Page, type Route } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import {
  applyBulk,
  applyButton,
  bulkAction,
  bulkAttribute,
  bulkDialog,
  bulkOption,
  cancelBulk,
  chooseBulkAction,
  chooseBulkAttribute,
  incompleteBanner,
  incompleteSwitch,
  listedQuestions,
  openBulkEditor,
  openContent,
  questionCards,
  questionRow,
  resetFilters,
  selectAllShown,
  selectCard,
  selectQuestion,
  showIncomplete,
  toggleBulkOption,
  toggleFilterChip,
} from '../flows/questions'
import { fetchQuestion, resetUserData, seedQuestions } from '../support/reset'
import { addAttribute, createFrontendScenario, json, optionValues } from '../support/scenario-fixture'

const FIRST = 'First: what is a closure?'
const SECOND = 'Second: how does flexbox work?'
const THIRD = 'Third: what is a hook?'

let scenario: Scenario

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
  scenario = await createFrontendScenario(page.request)
})

/** The labels each question holds for one attribute. */
async function held(page: Page, current: Scenario, ids: string[], name: string) {
  const attribute = current.attributes.find((a) => a.name === name)!
  return Promise.all(
    ids.map(async (id) => {
      const question = await fetchQuestion(page.request, id)
      return attribute.options.filter((o) => question.values[attribute.id]!.includes(o.id)).map((o) => o.label)
    }),
  )
}

/** The bulk requests the page has sent. */
function bulkRequests(page: Page) {
  const sent: unknown[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/questions/bulk')) sent.push(request.postDataJSON())
  })
  return sent
}

const selectedCount = (page: Page, n: number) => page.getByText(`${n} selected`, { exact: true })

test('bulk set fixes all selected; fixed rows leave the filtered selection', async ({ page }) => {
  const ids = await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  const changed = await addAttribute(page.request, scenario, {
    name: 'Level',
    labels: ['Junior', 'Senior'],
    required: true,
  })
  await openContent(page, scenario.id)
  await showIncomplete(page)
  await selectAllShown(page)
  await openBulkEditor(page)

  // The dialog starts at what the selection is missing.
  await expect(bulkAttribute(page).locator('option:checked')).toHaveText('Level')
  await expect(bulkAction(page).getByRole('option')).toHaveText(['Set'])
  await expect(applyButton(page)).toBeDisabled()
  await expect(bulkDialog(page).getByRole('status')).toHaveText('Choose an option.')
  await toggleBulkOption(page, 'Junior')
  await toggleBulkOption(page, 'Senior')
  await expect(bulkDialog(page).getByRole('button', { pressed: true })).toHaveText(['Senior'])
  await expect(bulkDialog(page).getByRole('status')).toHaveText('2 questions will change.')
  await applyBulk(page)

  await expect(bulkDialog(page)).toHaveCount(0)
  await expect(page.getByText('2 questions updated')).toBeVisible()
  await expect(page.getByText('Selection adjusted to the current results')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit attributes' })).toHaveCount(0)
  await expect(incompleteBanner(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'No questions match these filters' })).toBeVisible()
  await expect(incompleteSwitch(page)).toBeChecked()
  expect(await held(page, changed, ids, 'Level')).toEqual([['Senior'], ['Senior']])

  await resetFilters(page)
  await expect(listedQuestions(page)).toHaveText([FIRST, SECOND])
})

test('bulk add, replace and remove on a multiple attribute', async ({ page }) => {
  const ids = await seedQuestions(page.request, scenario, [
    { question: FIRST, categories: ['JS'] },
    { question: SECOND, categories: ['CSS', 'JS'] },
    { question: THIRD, categories: ['HTML'] },
  ])
  const sent = bulkRequests(page)
  await openContent(page, scenario.id)
  await selectQuestion(page, FIRST)
  await selectQuestion(page, SECOND)

  await test.step('add never duplicates', async () => {
    await openBulkEditor(page)
    await chooseBulkAttribute(page, 'Category')
    await expect(bulkAction(page).getByRole('option')).toHaveText(['Add', 'Replace', 'Remove'])
    await expect(bulkDialog(page).getByRole('status')).toHaveText('Choose at least one option.')
    await toggleBulkOption(page, 'CSS')
    await expect(bulkDialog(page).getByRole('status')).toHaveText('1 question will change.')
    await toggleBulkOption(page, 'CSS')
    await toggleBulkOption(page, 'JS')
    await expect(bulkDialog(page).getByRole('status')).toHaveText('No questions will change.')
    await expect(applyButton(page)).toBeDisabled()
    await toggleBulkOption(page, 'API')
    await expect(bulkDialog(page).getByRole('status')).toHaveText('2 questions will change.')
    await applyBulk(page)
    await expect(page.getByText('2 questions updated')).toBeVisible()
    expect(await held(page, scenario, ids, 'Category')).toEqual([['JS', 'API'], ['CSS', 'JS', 'API'], ['HTML']])
  })

  await test.step('the selection stays, and the next dialog starts afresh', async () => {
    await expect(selectedCount(page, 2)).toBeVisible()
    await openBulkEditor(page)
    await chooseBulkAttribute(page, 'Category')
    await expect(bulkDialog(page).getByRole('button', { pressed: true })).toHaveCount(0)
    await toggleBulkOption(page, 'React')
    await chooseBulkAction(page, 'Replace')
    await expect(bulkDialog(page).getByRole('button', { pressed: true })).toHaveCount(0)
    await toggleBulkOption(page, 'React')
    await chooseBulkAttribute(page, 'Difficulty')
    await expect(bulkAction(page).locator('option:checked')).toHaveText('Set')
    await expect(bulkDialog(page).getByRole('button', { pressed: true })).toHaveCount(0)
    await chooseBulkAttribute(page, 'Category')
    await expect(bulkAction(page).locator('option:checked')).toHaveText('Add')
    await expect(bulkDialog(page).getByRole('button', { pressed: true })).toHaveCount(0)
  })

  await test.step('replace', async () => {
    await chooseBulkAction(page, 'Replace')
    await toggleBulkOption(page, 'React')
    await toggleBulkOption(page, 'API')
    await applyBulk(page)
    await expect(questionRow(page, FIRST).getByTitle('Category')).toHaveText('APIReact')
    expect(await held(page, scenario, ids, 'Category')).toEqual([['API', 'React'], ['API', 'React'], ['HTML']])
  })

  await test.step('remove; a row that stops matching the filter leaves the selection', async () => {
    await toggleFilterChip(page, 'React')
    await expect(listedQuestions(page)).toHaveText([FIRST, SECOND])
    await openBulkEditor(page)
    await chooseBulkAttribute(page, 'Category')
    await chooseBulkAction(page, 'Remove')
    await toggleBulkOption(page, 'React')
    await applyBulk(page)
    await expect(page.getByRole('heading', { name: 'No questions match these filters' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit attributes' })).toHaveCount(0)
    expect(await held(page, scenario, ids, 'Category')).toEqual([['API'], ['API'], ['HTML']])
  })

  expect(sent).toHaveLength(3)
})

test('bulk clear on an optional attribute', async ({ page }) => {
  const ids = await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  const changed = await addAttribute(page.request, scenario, {
    name: 'Region',
    labels: ['North', 'South'],
    required: false,
  })
  const values = optionValues(changed, {
    Difficulty: ['Medium'],
    Importance: ['Mid'],
    Category: ['JS'],
    Region: ['North'],
  })
  await json(page.request.patch(`/api/questions/${ids[0]}`, { data: { values } }))
  await openContent(page, scenario.id)
  await selectAllShown(page)
  await openBulkEditor(page)

  await chooseBulkAttribute(page, 'Difficulty')
  await expect(bulkAction(page).getByRole('option')).toHaveText(['Set']) // required: no Clear
  await chooseBulkAttribute(page, 'Region')
  await expect(bulkAction(page).getByRole('option')).toHaveText(['Set', 'Clear'])
  await chooseBulkAction(page, 'Clear')
  await expect(bulkDialog(page).getByRole('button', { name: 'North' })).toHaveCount(0)
  await expect(bulkDialog(page).getByRole('status')).toHaveText('1 question will change.')
  await applyBulk(page)

  await expect(page.getByText('1 question updated')).toBeVisible()
  await expect(questionRow(page, FIRST).getByTitle('Region')).toHaveText('—')
  await expect(selectedCount(page, 2)).toBeVisible()
  expect(await held(page, changed, ids, 'Region')).toEqual([[], []])
})

test('removing the last option of a required attribute is refused with the count', async ({ page }) => {
  const ids = await seedQuestions(page.request, scenario, [
    { question: FIRST, categories: ['JS'] },
    { question: SECOND, categories: ['JS'] },
    { question: THIRD, categories: ['CSS', 'JS'] },
  ])
  const sent = bulkRequests(page)
  await openContent(page, scenario.id)
  await selectAllShown(page)
  await openBulkEditor(page)
  await chooseBulkAttribute(page, 'Category')
  await chooseBulkAction(page, 'Remove')

  await toggleBulkOption(page, 'JS')

  await expect(bulkDialog(page).getByRole('status')).toHaveText(
    'Category is required, and this would leave 2 questions without an option. Nothing would be changed.',
  )
  await expect(applyButton(page)).toBeDisabled()
  await cancelBulk(page)
  await expect(bulkDialog(page)).toHaveCount(0)
  await expect(selectedCount(page, 3)).toBeVisible()
  expect(sent).toEqual([])
  expect(await held(page, scenario, ids, 'Category')).toEqual([['JS'], ['JS'], ['CSS', 'JS']])
})

test('a refusal by the server shows its count and reads the list again', async ({ page }) => {
  const [first] = await seedQuestions(page.request, scenario, [{ question: FIRST, categories: ['CSS', 'JS'] }])
  await openContent(page, scenario.id)
  await selectAllShown(page)
  await openBulkEditor(page)
  await chooseBulkAttribute(page, 'Category')
  await chooseBulkAction(page, 'Remove')
  await toggleBulkOption(page, 'JS')
  await expect(bulkDialog(page).getByRole('status')).toHaveText('1 question will change.')
  // Changed elsewhere since the list was read.
  const values = optionValues(scenario, { Difficulty: ['Medium'], Importance: ['Mid'], Category: ['JS'] })
  await json(page.request.patch(`/api/questions/${first}`, { data: { values } }))

  await applyButton(page).click()

  await expect(bulkDialog(page).getByRole('alert')).toHaveText(
    'The questions changed since the list was read. Nothing was changed.',
  )
  await expect(bulkDialog(page).getByRole('status')).toContainText('would leave 1 question without an option')
  await expect(applyButton(page)).toBeDisabled()
  await expect(questionRow(page, FIRST).getByTitle('Category')).toHaveText('JS')
  await page.keyboard.press('Escape')
  await expect(bulkDialog(page)).toHaveCount(0)
})

test('Apply sends one request and the dialog stays while it runs', async ({ page }) => {
  await seedQuestions(page.request, scenario, [{ question: FIRST }])
  const held: Route[] = []
  await page.route('**/questions/bulk', (route) => {
    held.push(route)
  })
  await openContent(page, scenario.id)
  await selectAllShown(page)
  await openBulkEditor(page)
  await chooseBulkAttribute(page, 'Difficulty')
  await toggleBulkOption(page, 'Hard')

  await applyButton(page).click()

  await expect(applyButton(page)).toBeDisabled()
  await expect(bulkDialog(page).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await expect(bulkAttribute(page)).toBeDisabled()
  await expect(bulkOption(page, 'Easy')).toBeDisabled()
  await page.locator('.overlay').click({ position: { x: 5, y: 5 } })
  await expect(bulkDialog(page)).toBeVisible()
  await expect.poll(() => held.length).toBe(1)

  await held[0]!.fulfill({ status: 500, json: {} })
  await expect(bulkDialog(page).getByRole('alert')).toHaveText('Something went wrong. Please try again.')
  await expect(applyButton(page)).toBeEnabled()
  await applyButton(page).click()
  await expect.poll(() => held.length).toBe(2)
  await held[1]!.continue()

  await expect(bulkDialog(page)).toHaveCount(0)
  await expect(page.getByText('1 question updated')).toBeVisible()
  expect(held).toHaveLength(2)
})

test.describe('on a narrow screen', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('bulk dialog works at 390px width', async ({ page }) => {
    const ids = await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
    const changed = await addAttribute(page.request, scenario, {
      name: 'Level',
      labels: ['Junior', 'Senior'],
      required: true,
    })
    await openContent(page, scenario.id)
    await expect(incompleteBanner(page)).toContainText('2 incomplete questions')
    await expect(page.locator('.mcard').first().getByText('Incomplete', { exact: true })).toBeVisible()
    await showIncomplete(page)
    await expect(questionCards(page)).toHaveText([FIRST, SECOND])
    await selectCard(page, FIRST)
    await selectCard(page, SECOND)
    await openBulkEditor(page)
    await toggleBulkOption(page, 'Junior')

    await expect(applyButton(page)).toBeInViewport({ ratio: 1 })
    const box = (await bulkDialog(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await applyBulk(page)

    await expect(page.getByText('2 questions updated')).toBeVisible()
    await expect(incompleteBanner(page)).toHaveCount(0)
    expect(await held(page, changed, ids, 'Level')).toEqual([['Junior'], ['Junior']])
  })
})
