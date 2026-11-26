import { expect, test, type Page, type Route } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import { visit } from '../flows/auth'
import { chooseOption, closeList, openList, toast } from '../flows/controls'
import { answerCurrent, currentQuestion, showAnswer, startSelectedPractice } from '../flows/practice'
import {
  answerField,
  chooseEditorOption,
  incompleteBanner,
  listedQuestions,
  openContent,
  openEditor,
  openNewEditor,
  questionField,
  questionRow,
  saveEditor,
} from '../flows/questions'
import {
  addAttribute,
  addOption,
  attributeCard,
  attributeCards,
  attributeNameField,
  cancelChanges,
  changesDialog,
  chooseColor,
  chooseSelectionMode,
  confirmChanges,
  createScenario,
  deleteAttribute,
  deleteOption,
  deleteScenarioButton,
  deleteScenarioDialog,
  deleteScenarioNameField,
  moveAttribute,
  moveOption,
  openDeleteScenario,
  openNewScenario,
  openScenarioEditor,
  openScenarios,
  optionChoice,
  optionLabelField,
  optionRow,
  optionRows,
  saveScenario,
  scenarioCard,
  scenarioNameField,
  setSwitch,
} from '../flows/scenarios'
import { fetchQuestion, resetUserData, seedQuestion, seedQuestions } from '../support/reset'
import {
  addAttribute as addAttributeByApi,
  createFrontendScenario,
  createScenario as createScenarioByApi,
  FRONTEND_SCENARIO,
  json,
} from '../support/scenario-fixture'

const FIRST = 'First: what is a promise?'
const SECOND = 'Second: what is a generator?'
const NAME = FRONTEND_SCENARIO.name
const CONTENT_URL = /\/scenarios\/([^/]+)\/content$/

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
})

/** The front-end scenario, with the list open. */
async function listWithFrontend(page: Page) {
  const scenario = await createFrontendScenario(page.request)
  await openScenarios(page)
  return scenario
}

function readScenario(page: Page, sid: string) {
  return json<Scenario>(page.request.get(`/api/scenarios/${sid}`))
}

/** The labels a question holds for one attribute, by name. */
async function heldLabels(page: Page, sid: string, questionId: string, attributeName: string) {
  const [scenario, question] = await Promise.all([readScenario(page, sid), fetchQuestion(page.request, questionId)])
  const attribute = scenario.attributes.find((a) => a.name === attributeName)!
  return attribute.options.filter((o) => question.values[attribute.id]!.includes(o.id)).map((o) => o.label)
}

/** The create and update requests the page has sent. */
function savesOf(page: Page) {
  const sent: string[] = []
  page.on('request', (request) => {
    if (!['POST', 'PUT'].includes(request.method())) return
    if (/^\/api\/scenarios(\/[^/]+)?$/.test(new URL(request.url()).pathname)) sent.push(request.method())
  })
  return sent
}

const switcher = (page: Page) => page.getByRole('combobox', { name: 'Scenario' })

async function expectSwitcherLists(page: Page, names: string[]) {
  await expect(await openList(switcher(page))).toHaveText(names)
  await closeList(switcher(page))
}

test('a new user sees "Create your first scenario"', async ({ page }) => {
  await openScenarios(page)

  await expect(page.getByRole('heading', { name: 'Create your first scenario' })).toBeVisible()
  await openNewScenario(page)

  await expect(page).toHaveURL('/scenarios/new')
  await expect(page.getByRole('heading', { name: 'New scenario' })).toBeVisible()
  await expect(scenarioNameField(page)).toHaveValue('')
  await expect(attributeCards(page)).toHaveCount(0)
})

test('create a scenario with a single and a multiple attribute, then add and practice a question', async ({ page }) => {
  await createScenario(page, {
    name: 'Finance',
    attributes: [
      {
        name: 'Level',
        ordered: true,
        required: true,
        options: [{ label: 'Basic', color: 'Green', isDefault: true }, { label: 'Advanced' }],
      },
      {
        name: 'Topic',
        mode: 'Multiple',
        options: [{ label: 'Tax' }, { label: 'Debt' }, { label: 'Equity' }],
      },
    ],
  })

  await expect(page).toHaveURL(CONTENT_URL)
  await expect(toast(page, 'Scenario created')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible()
  await expectSwitcherLists(page, ['All scenarios', 'Finance'])
  const sid = CONTENT_URL.exec(page.url())![1]!
  const stored = await readScenario(page, sid)
  expect(stored.attributes).toMatchObject([
    { name: 'Level', selectionMode: 'single', ordered: true, required: true },
    { name: 'Topic', selectionMode: 'multiple', ordered: false, required: false },
  ])
  expect(stored.attributes[0]!.options).toMatchObject([
    { label: 'Basic', color: 'green', isDefault: true },
    { label: 'Advanced', isDefault: false },
  ])

  await openNewEditor(page)
  await questionField(page).fill(FIRST)
  await answerField(page).fill('A placeholder for a value.')
  await chooseEditorOption(page, 'Topic', 'Tax')
  await chooseEditorOption(page, 'Topic', 'Equity')
  await saveEditor(page)

  const row = questionRow(page, FIRST)
  await expect(row).toContainText('Basic')
  await expect(row).toContainText('Tax')
  await expect(row).toContainText('Equity')

  await startSelectedPractice(page, [FIRST], true)
  await expect(currentQuestion(page)).toHaveText(FIRST)
  await showAnswer(page)
  await answerCurrent(page, true)
  await expect(toast(page, 'Correct — recorded')).toBeVisible()
})

test('a scenario without attributes is a plain list', async ({ page }) => {
  await createScenario(page, { name: 'Plain' })

  await expect(page).toHaveURL(CONTENT_URL)
  await openNewEditor(page)
  await questionField(page).fill(FIRST)
  await answerField(page).fill('An answer.')
  await saveEditor(page)
  await expect(listedQuestions(page)).toHaveText([FIRST])
})

test("a new scenario shows none of another scenario's questions", async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  await seedQuestion(page.request, scenario, { question: FIRST })

  await createScenario(page, { name: 'Finance' })

  await expect(page).toHaveURL(CONTENT_URL)
  await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible()
  await expect(page.getByText(FIRST)).toHaveCount(0)

  await chooseOption(switcher(page), scenario.name)
  await expect(listedQuestions(page)).toHaveText([FIRST])
})

test('field errors for duplicate names and fewer than 2 options', async ({ page }) => {
  await createFrontendScenario(page.request)
  const saves = savesOf(page)
  await openScenarios(page)
  await openNewScenario(page)

  await addAttribute(page, { name: 'Level', options: [{ label: 'Basic' }, { label: 'basic ' }] })
  await addAttribute(page, { name: 'level', options: [{ label: 'One' }, { label: '' }] })
  await saveScenario(page)

  const first = attributeCards(page).first()
  const second = attributeCards(page).last()
  await expect(page.getByText('Enter a name')).toBeVisible()
  await expect(scenarioNameField(page)).toBeFocused()
  await expect(optionRows(first).last()).toContainText('Option labels must be unique')
  await expect(second).toContainText('Attribute names must be unique')
  await expect(optionRows(second).last()).toContainText('Enter a label')

  // With only 2 options neither can go; each attribute says so for itself.
  await deleteOption(first, 'Basic')
  await expect(optionRows(first)).toHaveCount(2)
  await expect(first).toContainText('An attribute needs at least 2 options. Add another before deleting one.')
  await expect(second).not.toContainText('at least 2 options')

  // Errors follow the fields as they are corrected.
  await addOption(first, { label: 'Expert' })
  await expect(first).not.toContainText('at least 2 options')
  await deleteOption(first, 'basic ')
  await expect(optionRows(first)).toHaveCount(2)
  await expect(first).not.toContainText('Option labels must be unique')
  await attributeNameField(second).fill('Topic')
  await expect(page.getByText('Attribute names must be unique')).toHaveCount(0)
  await optionLabelField(optionRows(attributeCard(page, 'Topic')).last()).fill('Two')
  expect(saves).toEqual([])

  // Only the server knows the other scenarios' names.
  await scenarioNameField(page).fill(NAME.toUpperCase())
  await saveScenario(page)
  await expect(page.getByText('That scenario name is already taken')).toBeVisible()
  await expect(page).toHaveURL('/scenarios/new')

  await scenarioNameField(page).fill('Finance')
  await expect(page.getByText('That scenario name is already taken')).toHaveCount(0)
  await saveScenario(page)
  await expect(page).toHaveURL(CONTENT_URL)
  expect(saves).toEqual(['POST', 'POST'])
})

test('Save is disabled while saving', async ({ page }) => {
  const held: Route[] = []
  await page.route('**/api/scenarios', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    held.push(route)
  })
  await openScenarios(page)
  await openNewScenario(page)
  await scenarioNameField(page).fill('Finance')

  await saveScenario(page)
  await expect(page.getByRole('button', { name: 'Save scenario' })).toBeDisabled()
  await scenarioNameField(page).press('Enter')
  await expect.poll(() => held.length).toBe(1)

  await held[0]!.continue()
  await expect(page).toHaveURL(CONTENT_URL)
  expect(held).toHaveLength(1)
})

test('switching selection mode keeps the attribute valid', async ({ page }) => {
  await openScenarios(page)
  await openNewScenario(page)
  await scenarioNameField(page).fill('Finance')
  await addAttribute(page, {
    name: 'Level',
    ordered: true,
    options: [{ label: 'Basic' }, { label: 'Advanced', isDefault: true }],
  })
  const card = attributeCard(page, 'Level')
  const ordered = card.getByRole('switch', { name: 'Ordered' })

  await chooseSelectionMode(card, 'Multiple')
  await expect(ordered).not.toBeChecked()
  await expect(ordered).toBeDisabled()
  await setSwitch(optionRow(card, 'Basic'), 'Default', true)
  await expect(optionRow(card, 'Advanced').getByRole('switch', { name: 'Default' })).toBeChecked()

  await chooseSelectionMode(card, 'Single')
  await expect(ordered).toBeEnabled()
  await expect(optionRow(card, 'Basic').getByRole('switch', { name: 'Default' })).toBeChecked()
  await expect(optionRow(card, 'Advanced').getByRole('switch', { name: 'Default' })).not.toBeChecked()

  await setSwitch(card, 'Ordered', true)
  await chooseSelectionMode(card, 'Multiple')
  await saveScenario(page)

  await expect(page).toHaveURL(CONTENT_URL)
})

test('leaving the editor with changes asks to discard', async ({ page }) => {
  const discard = page.getByRole('alertdialog', { name: 'Discard changes?' })
  await listWithFrontend(page)

  await test.step('nothing changed: leaves at once', async () => {
    await openScenarioEditor(page, NAME)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Scenarios', exact: true })).toBeVisible()
    await expect(discard).toHaveCount(0)
  })

  await test.step('keep editing, through the back link', async () => {
    await openScenarioEditor(page, NAME)
    await scenarioNameField(page).fill('Renamed')
    await page.getByRole('link', { name: 'Back to scenarios' }).click()
    await discard.getByRole('button', { name: 'Keep editing' }).click()
    await expect(discard).toHaveCount(0)
    await expect(scenarioNameField(page)).toHaveValue('Renamed')
    await expect(page).toHaveURL(/\/edit$/)
  })

  await test.step('discard, through the browser', async () => {
    await page.goBack()
    await discard.getByRole('button', { name: 'Discard' }).click()
    await expect(page).toHaveURL('/scenarios')
    await expect(scenarioCard(page, NAME)).toBeVisible()
  })

  await test.step('a new scenario, through the header', async () => {
    await openNewScenario(page)
    await scenarioNameField(page).fill('Draft')
    await page.getByRole('navigation').getByRole('link', { name: 'Scenarios' }).click()
    await discard.getByRole('button', { name: 'Discard' }).click()
    await expect(page).toHaveURL('/scenarios')
    await expectSwitcherLists(page, ['All scenarios', NAME])
  })

  await test.step('undone changes are no changes', async () => {
    await openScenarioEditor(page, NAME)
    await scenarioNameField(page).fill('Renamed')
    await scenarioNameField(page).fill(NAME)
    await page.getByRole('link', { name: 'Back to scenarios' }).click()
    await expect(page).toHaveURL('/scenarios')
    await expect(discard).toHaveCount(0)
  })
})

test('rename, recolor and reorder show up in the table', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  await seedQuestion(page.request, scenario, { question: FIRST, difficulty: 'easy' })
  // Seen before the change, so that stale data would show.
  await openContent(page, scenario.id)
  await expect(questionRow(page, FIRST)).toContainText('Easy')
  await page.getByRole('navigation').getByRole('link', { name: 'Scenarios' }).click()
  await openScenarioEditor(page, NAME)

  await scenarioNameField(page).fill('Interviews')
  const card = attributeCards(page).first()
  await attributeNameField(card).fill('Level')
  await optionLabelField(optionRow(card, 'Easy')).fill('Simple')
  await chooseColor(optionRow(card, 'Simple'), 'Red')
  await moveOption(optionRow(card, 'Simple'), 'down')
  await expect(optionRows(card).nth(1)).toHaveAccessibleName('Option: Simple')
  await moveAttribute(attributeCard(page, 'Level'), 'down')
  await expect(attributeCards(page).nth(1)).toHaveAccessibleName('Attribute: Level')
  await saveScenario(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  await expect(toast(page, 'Scenario saved')).toBeVisible()
  await expect(page.locator('.qtable th')).toContainText(['Question', 'Importance', 'Level', 'Category'])
  const badge = questionRow(page, FIRST).getByText('Simple', { exact: true })
  await expect(badge).toHaveAttribute('style', /--c-red/)
  await expectSwitcherLists(page, ['All scenarios', 'Interviews'])
  await expect(page.getByRole('complementary').getByRole('group', { name: 'Level' }).getByRole('button')).toHaveText([
    'Medium',
    'Simple',
    'Hard',
    'None',
  ])
  await page.getByRole('navigation').getByRole('link', { name: 'Scenarios' }).click()
  await expect(scenarioCard(page, 'Interviews')).toContainText('1 question')
})

/** Opens the editor of the front-end scenario from the list. */
async function editFrontend(page: Page) {
  await openScenarios(page)
  await openScenarioEditor(page, NAME)
}

test('an added option is applied directly and can be chosen', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  const question = await seedQuestion(page.request, scenario, { question: FIRST, difficulty: 'easy' })
  await editFrontend(page)

  await addOption(attributeCard(page, 'Difficulty'), { label: 'Expert' })
  await saveScenario(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  expect(await heldLabels(page, scenario.id, question, 'Difficulty')).toEqual(['Easy'])
  await openEditor(page, FIRST)
  await chooseEditorOption(page, 'Difficulty', 'Expert')
  await saveEditor(page)
  await expect(questionRow(page, FIRST)).toContainText('Expert')
})

test('an added optional attribute leaves questions empty and complete', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  const question = await seedQuestion(page.request, scenario, { question: FIRST })
  await editFrontend(page)

  await addAttribute(page, { name: 'Region', options: [{ label: 'North', isDefault: true }, { label: 'South' }] })
  await saveScenario(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  await expect(questionRow(page, FIRST).getByTitle('Region')).toHaveText('—')
  await expect(incompleteBanner(page)).toHaveCount(0)
  // Defaults are for new questions only.
  expect(await heldLabels(page, scenario.id, question, 'Region')).toEqual([])
  expect((await fetchQuestion(page.request, question)).incomplete).toBe(false)
})

test('turning Required on makes the questions without a value incomplete', async ({ page }) => {
  const created = await createFrontendScenario(page.request)
  const scenario = await addAttributeByApi(page.request, created, {
    name: 'Region',
    labels: ['North', 'South'],
    required: false,
  })
  const [without] = await seedQuestions(page.request, scenario, [{ question: FIRST }])
  await openContent(page, scenario.id)
  await expect(listedQuestions(page)).toHaveText([FIRST])
  await expect(incompleteBanner(page)).toHaveCount(0)
  await editFrontend(page)

  await setSwitch(attributeCard(page, 'Region'), 'Required', true)
  await saveScenario(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  await expect(incompleteBanner(page)).toContainText('1 incomplete question')
  await expect(questionRow(page, FIRST).getByText('Incomplete', { exact: true })).toBeVisible()
  expect((await fetchQuestion(page.request, without!)).incomplete).toBe(true)
})

test('moving to an option a question already has keeps it once', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  const [both, one] = await seedQuestions(page.request, scenario, [
    { question: FIRST, categories: ['CSS', 'JS'] },
    { question: SECOND, categories: ['CSS'] },
  ])
  await editFrontend(page)

  await deleteOption(attributeCard(page, 'Category'), 'CSS')
  await saveScenario(page)
  await expect(changesDialog(page)).toContainText('2 questions use “CSS” (Category).')
  await chooseOption(optionChoice(page, 'CSS'), 'Move to JS')
  await confirmChanges(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  await expect(questionRow(page, FIRST).getByTitle('Category')).toHaveText('JS')
  expect(await heldLabels(page, scenario.id, both!, 'Category')).toEqual(['JS'])
  expect(await heldLabels(page, scenario.id, one!, 'Category')).toEqual(['JS'])
})

test('single to multiple is applied directly and switches Ordered off', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  const question = await seedQuestion(page.request, scenario, { question: FIRST, difficulty: 'hard' })
  await editFrontend(page)
  const card = attributeCard(page, 'Difficulty')
  await expect(card.getByRole('switch', { name: 'Ordered' })).toBeChecked()

  await chooseSelectionMode(card, 'Multiple')
  await expect(card.getByRole('switch', { name: 'Ordered' })).not.toBeChecked()
  await saveScenario(page)

  // No confirmation on the way.
  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  const stored = await readScenario(page, scenario.id)
  expect(stored.attributes[0]).toMatchObject({ selectionMode: 'multiple', ordered: false })
  expect(await heldLabels(page, scenario.id, question, 'Difficulty')).toEqual(['Hard'])
  const sort = page.getByRole('combobox', { name: 'Sort by' })
  const sortable = await openList(sort)
  await expect(sortable.filter({ hasText: 'Importance' })).toHaveCount(1)
  await expect(sortable.filter({ hasText: 'Difficulty' })).toHaveCount(0)
  await closeList(sort)
  await openEditor(page, FIRST)
  await chooseEditorOption(page, 'Difficulty', 'Easy')
  await saveEditor(page)
  await expect(questionRow(page, FIRST).getByTitle('Difficulty')).toHaveText('EasyHard')
})

test('delete an option in use: move; then delete another: leave empty', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  const [hard, easy] = await seedQuestions(page.request, scenario, [
    { question: FIRST, difficulty: 'hard' },
    { question: SECOND, difficulty: 'easy' },
  ])
  const saves = savesOf(page)
  await openScenarios(page)
  await openScenarioEditor(page, NAME)
  const card = attributeCard(page, 'Difficulty')

  await test.step('move to an option that is not saved yet', async () => {
    await addOption(card, { label: 'Expert' })
    await deleteOption(card, 'Hard')
    await saveScenario(page)

    const dialog = changesDialog(page)
    await expect(dialog).toContainText('1 question uses “Hard” (Difficulty).')
    // Only the options that stay in this attribute.
    await expect(optionChoice(page, 'Hard')).toHaveText('Choose…')
    await expect(await openList(optionChoice(page, 'Hard'))).toHaveText([
      'Move to Easy',
      'Move to Medium',
      'Move to Expert',
      'Leave empty',
    ])
    await closeList(optionChoice(page, 'Hard'))
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(saves).toEqual([])

    await chooseOption(optionChoice(page, 'Hard'), 'Move to Expert')
    await confirmChanges(page)

    await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
    await expect(questionRow(page, FIRST)).toContainText('Expert')
    expect(await heldLabels(page, scenario.id, hard!, 'Difficulty')).toEqual(['Expert'])
  })

  await test.step('leave empty', async () => {
    await page.getByRole('navigation').getByRole('link', { name: 'Scenarios' }).click()
    await openScenarioEditor(page, NAME)
    await deleteOption(card, 'Easy')
    await saveScenario(page)

    const dialog = changesDialog(page)
    await expect(dialog).toContainText('1 question uses “Easy” (Difficulty).')
    await chooseOption(optionChoice(page, 'Easy'), 'Leave empty')
    await expect(dialog).toContainText('Difficulty is required: questions left without an option become incomplete.')
    await confirmChanges(page)

    await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
    await expect(questionRow(page, SECOND)).toContainText('—')
    expect(await heldLabels(page, scenario.id, easy!, 'Difficulty')).toEqual([])
    expect((await fetchQuestion(page.request, easy!)).incomplete).toBe(true)
  })
})

test('an unused option is deleted without asking', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  await seedQuestion(page.request, scenario, { question: FIRST, difficulty: 'easy' })
  await openScenarios(page)
  await openScenarioEditor(page, NAME)

  await deleteOption(attributeCard(page, 'Difficulty'), 'Hard')
  await saveScenario(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  const stored = await readScenario(page, scenario.id)
  expect(stored.attributes[0]!.options.map((o) => o.label)).toEqual(['Easy', 'Medium'])
})

test('delete an attribute in use after the warning', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  await openScenarios(page)
  await openScenarioEditor(page, NAME)

  await deleteAttribute(page, 'Category')
  await saveScenario(page)
  await expect(changesDialog(page)).toContainText(
    'Deleting “Category” removes its values from 2 questions. The questions are kept.',
  )

  await cancelChanges(page)
  await expect(changesDialog(page)).toHaveCount(0)
  await expect(attributeCards(page)).toHaveCount(2)
  expect((await readScenario(page, scenario.id)).attributes).toHaveLength(3)

  await saveScenario(page)
  await confirmChanges(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  await expect(listedQuestions(page)).toHaveText([FIRST, SECOND])
  await expect(page.locator('.qtable th').filter({ hasText: 'Category' })).toHaveCount(0)
})

test('multiple to single after the warning', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  const [first] = await seedQuestions(page.request, scenario, [
    { question: FIRST, categories: ['API', 'HTML'] },
    { question: SECOND, categories: ['CSS'] },
  ])
  await openScenarios(page)
  await openScenarioEditor(page, NAME)

  await chooseSelectionMode(attributeCard(page, 'Category'), 'Single')
  await saveScenario(page)
  await expect(changesDialog(page)).toContainText(
    '1 question has several Category options. It keeps only the first in option order.',
  )
  await confirmChanges(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  expect(await heldLabels(page, scenario.id, first!, 'Category')).toEqual(['HTML'])
  await expect(questionRow(page, FIRST)).not.toContainText('API')
})

test('questions that changed since the editor opened are reported and nothing typed is lost', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  await seedQuestion(page.request, scenario, { question: FIRST, difficulty: 'easy' })
  const saves = savesOf(page)
  await openScenarios(page)
  await openScenarioEditor(page, NAME)
  const card = attributeCard(page, 'Difficulty')
  // Written elsewhere, after the editor read the counts: "Hard" was unused.
  const second = await seedQuestion(page.request, scenario, { question: SECOND, difficulty: 'hard' })

  await scenarioNameField(page).fill('Renamed')
  await addOption(card, { label: 'Expert' })
  await deleteOption(card, 'Hard')
  await saveScenario(page)

  const dialog = changesDialog(page)
  await expect(dialog).toContainText('Questions changed since you opened the editor.')
  await expect(dialog).toContainText('1 question uses “Hard” (Difficulty).')

  await cancelChanges(page)
  await expect(scenarioNameField(page)).toHaveValue('Renamed')
  await expect(optionRows(card)).toHaveCount(3)
  await expect(optionRow(card, 'Expert')).toBeVisible()

  // Written elsewhere meanwhile: saving again asks with the counts as they are now.
  const third = await seedQuestion(page.request, scenario, { question: 'Third', difficulty: 'hard' })
  await saveScenario(page)
  await expect(dialog).toContainText('2 questions use “Hard” (Difficulty).')
  await chooseOption(optionChoice(page, 'Hard'), 'Move to Expert')
  await confirmChanges(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  expect(saves).toEqual(['PUT', 'PUT'])
  expect((await readScenario(page, scenario.id)).name).toBe('Renamed')
  expect(await heldLabels(page, scenario.id, second, 'Difficulty')).toEqual(['Expert'])
  expect(await heldLabels(page, scenario.id, third, 'Difficulty')).toEqual(['Expert'])
})

test('after a refused save every destructive change is confirmed again, with current counts', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  const first = await seedQuestion(page.request, scenario, { question: FIRST, difficulty: 'easy' })
  const saves = savesOf(page)
  await openScenarios(page)
  await openScenarioEditor(page, NAME)
  const card = attributeCard(page, 'Difficulty')
  await addOption(card, { label: 'Expert' })
  await deleteOption(card, 'Easy')
  await deleteOption(card, 'Hard')
  await saveScenario(page)
  const dialog = changesDialog(page)
  await expect(dialog).toContainText('1 question uses “Easy” (Difficulty).')
  await expect(dialog).not.toContainText('Hard')

  // Written elsewhere while the dialog is open: more of what is being confirmed, and something new.
  await seedQuestion(page.request, scenario, { question: SECOND, difficulty: 'easy' })
  await seedQuestion(page.request, scenario, { question: 'Third', difficulty: 'hard' })
  await chooseOption(optionChoice(page, 'Easy'), 'Move to Medium')
  await confirmChanges(page)

  await expect(dialog).toContainText('Questions changed since you opened the editor.')
  await expect(dialog).toContainText('2 questions use “Easy” (Difficulty).')
  await expect(dialog).toContainText('1 question uses “Hard” (Difficulty).')
  // Nothing chosen before counts, and the keyboard is still in the dialog.
  await expect(optionChoice(page, 'Easy')).toHaveText('Choose…')
  await expect(optionChoice(page, 'Hard')).toHaveText('Choose…')
  await expect(optionChoice(page, 'Easy')).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  // The edits are still in the form, and nothing is stored.
  await expect(optionRows(card)).toHaveCount(2)
  await expect(optionRow(card, 'Expert')).toBeVisible()
  expect(await heldLabels(page, scenario.id, first, 'Difficulty')).toEqual(['Easy'])

  await chooseOption(optionChoice(page, 'Easy'), 'Move to Medium')
  await chooseOption(optionChoice(page, 'Hard'), 'Move to Expert')
  await confirmChanges(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  expect(saves).toEqual(['PUT', 'PUT'])
  expect(await heldLabels(page, scenario.id, first, 'Difficulty')).toEqual(['Medium'])
})

test('a refused save whose counts cannot be read asks again from fresh counts next time', async ({ page }) => {
  const scenario = await createFrontendScenario(page.request)
  await seedQuestion(page.request, scenario, { question: FIRST, difficulty: 'easy' })
  await openScenarios(page)
  await openScenarioEditor(page, NAME)
  const card = attributeCard(page, 'Difficulty')
  await deleteOption(card, 'Hard')
  await seedQuestion(page.request, scenario, { question: SECOND, difficulty: 'hard' })
  const url = `**/api/scenarios/${scenario.id}`
  await page.route(url, (route) => (route.request().method() === 'GET' ? route.abort() : route.fallback()))

  await saveScenario(page)

  await expect(page.getByRole('alert')).toContainText('Something went wrong. Please try again.')
  await expect(changesDialog(page)).toHaveCount(0)
  await expect(optionRows(card)).toHaveCount(2)

  await page.unroute(url)
  await saveScenario(page)
  await expect(changesDialog(page)).toContainText('1 question uses “Hard” (Difficulty).')
  await chooseOption(optionChoice(page, 'Hard'), 'Leave empty')
  await confirmChanges(page)
  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
})

test('delete a scenario by typing its name', async ({ page }) => {
  const kept = await createScenarioByApi(page.request, { ...FRONTEND_SCENARIO, name: 'Kept' })
  const scenario = await createFrontendScenario(page.request)
  await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  // It is now the last opened scenario, with a practice session under way.
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST, SECOND], true)
  await expect(currentQuestion(page)).toHaveText(FIRST)
  await page.getByRole('navigation').getByRole('link', { name: 'Scenarios' }).click()

  await openDeleteScenario(page, NAME)
  await expect(deleteScenarioDialog(page)).toContainText('2 questions')
  await expect(deleteScenarioButton(page)).toBeDisabled()
  await deleteScenarioNameField(page).fill(NAME.toLowerCase())
  await expect(deleteScenarioButton(page)).toBeDisabled()
  // Tabbing past the last enabled control stays in the dialog.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(deleteScenarioNameField(page)).toBeFocused()
  await deleteScenarioDialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(deleteScenarioDialog(page)).toHaveCount(0)
  await expect(scenarioCard(page, NAME)).toBeVisible()

  await openDeleteScenario(page, NAME)
  await expect(deleteScenarioNameField(page)).toHaveValue('')
  await deleteScenarioNameField(page).fill(NAME)
  await deleteScenarioButton(page).click()

  await expect(toast(page, 'Scenario deleted')).toBeVisible()
  await expect(scenarioCard(page, NAME)).toHaveCount(0)
  await expect(scenarioCard(page, 'Kept')).toBeVisible()
  await expectSwitcherLists(page, ['All scenarios', 'Kept'])
  expect((await page.context().cookies()).filter((c) => c.name === 'qadb_scenario' && c.value)).toEqual([])
  const stored = await page.evaluate(() => sessionStorage.getItem('qadb:practice'))
  expect(JSON.parse(stored!)).toMatchObject({ scenarioId: '', queue: [] })

  // Neither the home page nor the old practice address ends on a blank screen.
  await visit(page, '/')
  await expect(page).toHaveURL(`/scenarios/${kept.id}/content`)
  await expect(page.getByRole('heading', { name: 'Content' })).toBeVisible()
  await visit(page, `/scenarios/${scenario.id}/practice`)
  await expect(page).toHaveURL('/scenarios')

  await openDeleteScenario(page, 'Kept')
  await deleteScenarioNameField(page).fill('Kept')
  await deleteScenarioNameField(page).press('Enter')
  await expect(page.getByRole('heading', { name: 'Create your first scenario' })).toBeVisible()
  await visit(page, '/')
  await expect(page).toHaveURL('/scenarios')
  await expect(page.getByRole('heading', { name: 'Create your first scenario' })).toBeVisible()
})

test('editing an unknown scenario shows the not found panel', async ({ page }) => {
  await visit(page, '/scenarios/unknown/edit')

  await expect(page.getByRole('heading', { name: "This page doesn't exist." })).toBeVisible()
})

test('the scenario screens fit a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const long = 'Averyveryverylongscenarionamewithoutanyspaces-and-then-some-more-words'
  const scenario = await createScenarioByApi(page.request, { ...FRONTEND_SCENARIO, name: long })
  await seedQuestion(page.request, scenario, { question: FIRST })
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

  await openScenarios(page)
  await expect(scenarioCard(page, long)).toBeVisible()
  expect(await overflow()).toBeLessThanOrEqual(0)

  await openDeleteScenario(page, long)
  await expect(deleteScenarioNameField(page)).toBeInViewport()
  expect(await overflow()).toBeLessThanOrEqual(0)
  await deleteScenarioDialog(page).getByRole('button', { name: 'Cancel' }).click()

  await openScenarioEditor(page, long)
  expect(await overflow()).toBeLessThanOrEqual(0)

  // The label sits right beside the color and takes the rest of the line.
  const first = optionRows(attributeCards(page).first()).first()
  const color = (await first.getByRole('button', { name: 'Color', exact: true }).boundingBox())!
  const label = (await optionLabelField(first).boundingBox())!
  expect(label.x - (color.x + color.width)).toBeLessThanOrEqual(12)
  expect(label.width).toBeGreaterThan(200)

  // The color choices stay on screen, from the first row to the last attribute's.
  const row = optionRows(attributeCards(page).last()).last()
  await row.getByRole('button', { name: 'Color', exact: true }).click()
  const colors = page.getByRole('group', { name: 'Colors' })
  await expect(colors.getByRole('button', { name: 'Red', exact: true })).toBeInViewport({ ratio: 1 })
  await expect(colors.getByRole('button', { name: 'Blue 1', exact: true })).toBeInViewport({ ratio: 1 })
  expect(await overflow()).toBeLessThanOrEqual(0)
  await page.keyboard.press('Escape')
  await expect(colors).toHaveCount(0)

  await deleteAttribute(page, 'Category')
  await saveScenario(page)
  await expect(changesDialog(page).getByRole('button', { name: 'Save changes' })).toBeInViewport({ ratio: 1 })
  expect(await overflow()).toBeLessThanOrEqual(0)
})
