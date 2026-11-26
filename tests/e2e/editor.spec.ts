import { expect, test, type Page, type Route } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import {
  addQuestion,
  answerField,
  answerPreview,
  cancelEditor,
  chooseEditorOption,
  chosenEditorOptions,
  closeEditor,
  confirmDelete,
  discardChanges,
  discardDialog,
  editor,
  editorAttribute,
  editorOption,
  formatAnswer,
  keepEditing,
  linkField,
  listedQuestions,
  openContent,
  openDeleteDialog,
  openDetail,
  openEditor,
  openNewEditor,
  questionField,
  questionRow,
  saveEditor,
  showAnswerPreview,
} from '../flows/questions'
import { fetchQuestion, resetUserData, seedQuestion } from '../support/reset'
import { addAttribute, addOptions, createFrontendScenario, json, optionValues } from '../support/scenario-fixture'
import { toast } from '../flows/controls'

const QUESTION = 'What is hoisting?'

let scenario: Scenario

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
  scenario = await createFrontendScenario(page.request)
})

test('add shows "Question added"', async ({ page }) => {
  await openContent(page, scenario.id)

  await addQuestion(page, {
    question: QUESTION,
    answer: 'Declarations move to the top of their scope.',
    difficulty: 'Hard',
    importance: 'High',
    categories: ['CSS'],
  })

  await expect(toast(page, 'Question added')).toBeVisible()
  await expect(editor(page)).toBeHidden()
  await expect(listedQuestions(page)).toHaveText([QUESTION])
  const row = questionRow(page, QUESTION)
  await expect(row.getByText('Hard', { exact: true })).toBeVisible()
  await expect(row.getByText('High', { exact: true })).toBeVisible()
  await expect(row.getByText('CSS', { exact: true })).toBeVisible()
  await expect(row.getByText('JS', { exact: true })).toBeHidden()
  await openEditor(page, QUESTION)
  await expect(answerField(page)).toHaveValue('Declarations move to the top of their scope.')
})

test('required fields show errors', async ({ page }) => {
  await openContent(page, scenario.id)
  await openNewEditor(page)

  await saveEditor(page)

  await expect(editor(page).getByText('The question is required.')).toBeVisible()
  await expect(editor(page).getByText('An answer is required.')).toBeVisible()
})

test('edit shows "Question updated"', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, {
    question: QUESTION,
    answer: 'The original answer.',
    difficulty: 'hard',
    importance: 'high',
    categories: ['CSS', 'API'],
    link: 'https://example.com/hoisting',
    mastered: true,
  })
  await openContent(page, scenario.id)
  await openEditor(page, QUESTION)
  await expect(questionField(page)).toHaveValue(QUESTION)

  await questionField(page).fill('What is temporal dead zone?')
  await saveEditor(page)

  await expect(toast(page, 'Question updated')).toBeVisible()
  await expect(editor(page)).toBeHidden()
  await expect(listedQuestions(page)).toHaveText(['What is temporal dead zone?'])
  // Everything left untouched is stored as it was.
  expect(await fetchQuestion(page.request, id)).toMatchObject({
    question: 'What is temporal dead zone?',
    answer: 'The original answer.',
    values: optionValues(scenario, { Difficulty: ['Hard'], Importance: ['High'], Category: ['CSS', 'API'] }),
    link: 'https://example.com/hoisting',
    mastered: 1,
  })
})

test('delete warns with the attempt count, then "Question deleted"', async ({ page }) => {
  await seedQuestion(page.request, scenario, { question: QUESTION, attempts: [true, false] })
  await openContent(page, scenario.id)

  await openDeleteDialog(page, QUESTION)
  await expect(page.getByRole('alertdialog', { name: 'Delete question' })).toContainText(
    "This also deletes its practice history (2 attempts). This can't be undone.",
  )
  await confirmDelete(page)

  await expect(toast(page, 'Question deleted')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible()
})

test('closing with typed changes asks "Discard changes?"', async ({ page }) => {
  await openContent(page, scenario.id)
  await openNewEditor(page)
  await questionField(page).fill(QUESTION)

  await closeEditor(page)
  await expect(discardDialog(page)).toContainText('Your edits to this question will be lost.')
  await keepEditing(page)
  await expect(discardDialog(page)).toBeHidden()
  await expect(questionField(page)).toHaveValue(QUESTION)

  await cancelEditor(page)
  await discardChanges(page)
  await expect(editor(page)).toBeHidden()
  await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible()
})

test('Display tab renders Markdown', async ({ page }) => {
  await openContent(page, scenario.id)
  await openNewEditor(page)
  await answerField(page).fill('## Scope\n\nUse **let** inside `for` loops.')

  await showAnswerPreview(page)

  const preview = answerPreview(page)
  await expect(preview.getByRole('heading', { level: 2, name: 'Scope' })).toBeVisible()
  await expect(preview.locator('strong')).toHaveText('let')
  await expect(preview.locator('code')).toHaveText('for')
  await expect(answerField(page)).toBeHidden()
})

test('Format replaces the answer with the stub result', async ({ page }) => {
  await openContent(page, scenario.id)
  await openNewEditor(page)
  await answerField(page).fill('plain answer')

  await formatAnswer(page)

  await expect(answerField(page)).toHaveValue('**stub** plain answer')
  await expect(toast(page, 'Formatted with AI')).toBeVisible()
})

test('closing after changing only an attribute asks "Discard changes?"', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION })
  await openContent(page, scenario.id)

  await test.step('untouched, it closes at once', async () => {
    await openEditor(page, QUESTION)
    await closeEditor(page)
    await expect(editor(page)).toBeHidden()
    await expect(discardDialog(page)).toBeHidden()
  })

  await test.step('a change asks, and taking it back does not', async () => {
    await openEditor(page, QUESTION)
    await chooseEditorOption(page, 'Difficulty', 'Hard')
    await closeEditor(page)
    await expect(discardDialog(page)).toContainText('Your edits to this question will be lost.')
    await keepEditing(page)
    await expect(editorOption(page, 'Difficulty', 'Hard')).toHaveAttribute('data-state', /^(on|checked)$/)

    await chooseEditorOption(page, 'Difficulty', 'Medium')
    await closeEditor(page)
    await expect(editor(page)).toBeHidden()
    await expect(discardDialog(page)).toBeHidden()
  })

  await test.step('discarding leaves the question as it was', async () => {
    await openEditor(page, QUESTION)
    await chooseEditorOption(page, 'Category', 'CSS')
    await cancelEditor(page)
    await discardChanges(page)
    await expect(editor(page)).toBeHidden()
    expect((await fetchQuestion(page.request, id)).values).toEqual(
      optionValues(scenario, { Difficulty: ['Medium'], Importance: ['Mid'], Category: ['JS'] }),
    )
  })

  await test.step('also for a new question', async () => {
    await openNewEditor(page)
    await closeEditor(page)
    await expect(editor(page)).toBeHidden()

    await openNewEditor(page)
    await chooseEditorOption(page, 'Importance', 'High')
    await closeEditor(page)
    await expect(discardDialog(page)).toBeVisible()
  })
})

test('a new question starts with the default options', async ({ page }) => {
  await openContent(page, scenario.id)

  await openNewEditor(page)

  await expect(chosenEditorOptions(page, 'Difficulty')).toHaveText(['Medium'])
  await expect(chosenEditorOptions(page, 'Importance')).toHaveText(['Mid'])
  await expect(chosenEditorOptions(page, 'Category')).toHaveText(['JS'])
  // The last choice of a required multiple attribute stays.
  await expect(editorOption(page, 'Category', 'JS')).toBeDisabled()
  await expect(editor(page).getByRole('button', { name: /^Clear / })).toHaveCount(0)
})

test('editing an incomplete question marks what is missing and preselects nothing', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION })
  const changed = await addAttribute(page.request, scenario, {
    name: 'Level',
    labels: ['Junior', 'Senior'], // Junior is the default
    required: true,
  })
  await openContent(page, scenario.id)

  await openEditor(page, QUESTION)

  const level = editorAttribute(page, 'Level')
  await expect(level.getByText('Level is required')).toBeVisible()
  await expect(level.getByRole('button', { pressed: true })).toHaveCount(0)
  await expect(editor(page).locator('.field-err:visible')).toHaveCount(1)
  await closeEditor(page)
  await expect(editor(page)).toBeHidden() // opening it changed nothing

  await openEditor(page, QUESTION)
  await saveEditor(page)
  await expect(level.getByText('Level is required')).toBeVisible()
  await expect(editor(page)).toBeVisible()
  expect((await fetchQuestion(page.request, id)).incomplete).toBe(true)

  await chooseEditorOption(page, 'Level', 'Senior')
  await expect(level.getByText('Level is required')).toBeHidden()
  await saveEditor(page)

  await expect(toast(page, 'Question updated')).toBeVisible()
  expect(await fetchQuestion(page.request, id)).toMatchObject({
    incomplete: false,
    values: optionValues(changed, {
      Difficulty: ['Medium'],
      Importance: ['Mid'],
      Category: ['JS'],
      Level: ['Senior'],
    }),
  })
})

test('single choice holds one option, and optional attributes can be cleared', async ({ page }) => {
  // Up to four options make a segmented control, more make chips.
  const withRegion = await addAttribute(page.request, scenario, {
    name: 'Region',
    labels: ['North', 'South', 'East', 'West'],
    required: false,
  })
  const changed = await addAttribute(page.request, withRegion, {
    name: 'Team',
    labels: ['Red', 'Blue', 'Green', 'Pink', 'Gray'],
    required: false,
  })
  await openContent(page, scenario.id)
  await openNewEditor(page)
  await expect(editorAttribute(page, 'Region').locator('.seg')).toBeVisible()
  await expect(editorAttribute(page, 'Team').locator('.chip-group')).toBeVisible()
  await expect(editorAttribute(page, 'Team').locator('.seg')).toHaveCount(0)
  await questionField(page).fill(QUESTION)
  await answerField(page).fill('An answer.')

  for (const [attribute, first, second] of [
    ['Region', 'South', 'East'],
    ['Team', 'Blue', 'Pink'],
  ] as const) {
    await chooseEditorOption(page, attribute, first)
    await chooseEditorOption(page, attribute, second)
    await expect(chosenEditorOptions(page, attribute)).toHaveText([second])
  }
  await saveEditor(page)
  await expect(toast(page, 'Question added')).toBeVisible()
  await openEditor(page, QUESTION)
  await expect(chosenEditorOptions(page, 'Team')).toHaveText(['Pink'])

  await editor(page).getByRole('button', { name: 'Clear Region' }).click()
  await chooseEditorOption(page, 'Team', 'Pink') // a chosen chip lets go
  await expect(chosenEditorOptions(page, 'Region')).toHaveCount(0)
  await expect(chosenEditorOptions(page, 'Team')).toHaveCount(0)
  const saved = page.waitForRequest((req) => req.method() === 'PATCH')
  await saveEditor(page)

  const empty = optionValues(changed, { Difficulty: ['Medium'], Importance: ['Mid'], Category: ['JS'] })
  expect((await saved).postDataJSON().values).toEqual(empty)
  await expect(toast(page, 'Question updated')).toBeVisible()
  await expect(questionRow(page, QUESTION).getByTitle('Region')).toHaveText('—')
})

test('an emptied link is removed', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION, link: 'https://example.com/hoisting' })
  await openContent(page, scenario.id)
  await openEditor(page, QUESTION)

  await linkField(page).fill('')
  await saveEditor(page)

  await expect(toast(page, 'Question updated')).toBeVisible()
  expect((await fetchQuestion(page.request, id)).link).toBeNull()
})

// ─── a scenario changed elsewhere while the page is open ─────────────────

/**
 * What another tab does: adds a Category and a Difficulty option and an optional attribute, and
 * gives the question the new ones. Returns the scenario as it is now.
 */
async function changeElsewhere(page: Page, questionId: string) {
  let changed = await addOptions(page.request, scenario, 'Category', ['Vue'])
  changed = await addOptions(page.request, changed, 'Difficulty', ['Expert'])
  changed = await addAttribute(page.request, changed, { name: 'Region', labels: ['North', 'South'], required: false })
  const values = optionValues(changed, {
    Difficulty: ['Expert'],
    Importance: ['Mid'],
    Category: ['JS', 'Vue'],
    Region: ['South'],
  })
  await json(page.request.patch(`/api/questions/${questionId}`, { data: { values } }))
  return changed
}

test('editing on a stale page shows and keeps what was added elsewhere', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION })
  await openContent(page, scenario.id)
  const changed = await changeElsewhere(page, id)

  await openEditor(page, QUESTION)

  for (const [attribute, option] of [
    ['Difficulty', 'Expert'],
    ['Category', 'Vue'],
    ['Region', 'South'],
  ] as const) {
    await expect(editorOption(page, attribute, option)).toHaveAttribute('data-state', /^(on|checked)$/)
  }
  await closeEditor(page)
  await expect(editor(page)).toBeHidden() // opening it changed nothing

  await openEditor(page, QUESTION)
  await questionField(page).fill('Renamed')
  await saveEditor(page)

  await expect(toast(page, 'Question updated')).toBeVisible()
  expect((await fetchQuestion(page.request, id)).values).toEqual(
    optionValues(changed, { Difficulty: ['Expert'], Importance: ['Mid'], Category: ['JS', 'Vue'], Region: ['South'] }),
  )
})

test('a new question on a stale page starts from the current scenario', async ({ page }) => {
  await openContent(page, scenario.id)
  const changed = await addAttribute(page.request, scenario, {
    name: 'Region',
    labels: ['North', 'South'], // North is the default
    required: true,
  })

  await openNewEditor(page)

  await expect(editorOption(page, 'Region', 'North')).toHaveAttribute('data-state', /^(on|checked)$/)
  await closeEditor(page)
  await expect(editor(page)).toBeHidden()
  await openNewEditor(page)
  await questionField(page).fill(QUESTION)
  await answerField(page).fill('An answer.')
  await saveEditor(page)

  await expect(toast(page, 'Question added')).toBeVisible()
  await expect(questionRow(page, QUESTION).getByTitle('Region')).toHaveText('North')
  expect(changed.attributes).toHaveLength(4)
})

test('options the editor cannot name are kept when the scenario cannot be read again', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION })
  await openContent(page, scenario.id)
  const changed = await changeElsewhere(page, id)
  // The editor is left with what the page read before the change.
  let refused = 0
  await page.route(`**/api/scenarios/${scenario.id}`, (route) => {
    refused++
    return route.abort()
  })

  await openEditor(page, QUESTION)
  expect(refused).toBeGreaterThan(0)
  await expect(editorAttribute(page, 'Region')).toHaveCount(0)
  await expect(editor(page).getByText('Difficulty is required')).toHaveCount(0)
  // Choosing among the known options of a multiple attribute leaves the unknown one alone.
  await chooseEditorOption(page, 'Category', 'CSS')
  await saveEditor(page)

  await expect(toast(page, 'Question updated')).toBeVisible()
  expect((await fetchQuestion(page.request, id)).values).toEqual(
    optionValues(changed, {
      Difficulty: ['Expert'],
      Importance: ['Mid'],
      Category: ['CSS', 'JS', 'Vue'],
      Region: ['South'],
    }),
  )
})

test('the detail page shows an attribute added elsewhere once it is saved', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION })
  await openDetail(page, scenario.id, id)
  await expect(page.getByRole('heading', { name: QUESTION })).toBeVisible()
  await addAttribute(page.request, scenario, { name: 'Region', labels: ['North', 'South'], required: false })

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await chooseEditorOption(page, 'Region', 'South')
  await saveEditor(page)

  await expect(editor(page)).toBeHidden()
  await expect(page.locator('.detail-head .badge-row')).toContainText('South')
})

test('a slow load does not overwrite the editor opened after it', async ({ page }) => {
  const other = 'What is a closure?'
  const id = await seedQuestion(page.request, scenario, { question: QUESTION })
  await seedQuestion(page.request, scenario, { question: other })
  const held: Route[] = []
  await page.route(`**/api/questions/${id}`, (route) => {
    held.push(route)
  })
  await openContent(page, scenario.id)

  /** Opens the first question, closes before it has loaded, opens something else, then answers. */
  async function overtake(openOther: () => Promise<void>, shows: string) {
    await questionRow(page, QUESTION).getByRole('button', { name: /^Edit / }).click()
    await expect.poll(() => held.length).toBe(1)
    await closeEditor(page)
    await expect(editor(page)).toBeHidden()
    await openOther()
    await expect(questionField(page)).toHaveValue(shows)

    const answered = page.waitForResponse((res) => res.url().endsWith(`/api/questions/${id}`))
    await held.pop()!.continue()
    await (await answered).finished()
    // Time for a late answer to reach the form, which it must not.
    await page.waitForTimeout(500)
    await expect(questionField(page)).toHaveValue(shows)
    await closeEditor(page)
    await expect(editor(page)).toBeHidden()
    await expect(discardDialog(page)).toBeHidden()
  }

  await test.step('another question', () => overtake(() => openEditor(page, other), other))
  await test.step('a new question', () => overtake(() => openNewEditor(page), ''))
})
