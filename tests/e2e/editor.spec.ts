import { expect, test } from '@playwright/test'
import {
  addQuestion,
  answerField,
  answerPreview,
  cancelEditor,
  closeEditor,
  confirmDelete,
  discardChanges,
  discardDialog,
  editor,
  formatAnswer,
  keepEditing,
  listedQuestions,
  openContent,
  openDeleteDialog,
  openEditor,
  openNewEditor,
  questionField,
  questionRow,
  saveEditor,
  showAnswerPreview,
} from '../flows/questions'
import { resetUserData, seedQuestion } from '../support/reset'

const QUESTION = 'What is hoisting?'

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
})

test('add shows "Question added"', async ({ page }) => {
  await openContent(page)

  await addQuestion(page, {
    question: QUESTION,
    answer: 'Declarations move to the top of their scope.',
    difficulty: 'Hard',
    importance: 'High',
    categories: ['CSS'],
  })

  await expect(page.getByText('Question added')).toBeVisible()
  await expect(editor(page)).toBeHidden()
  await expect(listedQuestions(page)).toHaveText([QUESTION])
  const row = questionRow(page, QUESTION)
  await expect(row.getByText('Hard', { exact: true })).toBeVisible()
  await expect(row.getByText('High', { exact: true })).toBeVisible()
  await expect(row.getByText('CSS', { exact: true })).toBeVisible()
  await expect(row.getByText('JS', { exact: true })).toBeHidden()
})

test('required fields show errors', async ({ page }) => {
  await openContent(page)
  await openNewEditor(page)

  await saveEditor(page)

  await expect(editor(page).getByText('The question is required.')).toBeVisible()
  await expect(editor(page).getByText('An answer summary is required.')).toBeVisible()
})

test('edit shows "Question updated"', async ({ page }) => {
  await seedQuestion(page.request, { question: QUESTION })
  await openContent(page)
  await openEditor(page, QUESTION)
  await expect(questionField(page)).toHaveValue(QUESTION)

  await questionField(page).fill('What is temporal dead zone?')
  await saveEditor(page)

  await expect(page.getByText('Question updated')).toBeVisible()
  await expect(editor(page)).toBeHidden()
  await expect(listedQuestions(page)).toHaveText(['What is temporal dead zone?'])
})

test('delete warns with the attempt count, then "Question deleted"', async ({ page }) => {
  await seedQuestion(page.request, { question: QUESTION, attempts: [true, false] })
  await openContent(page)

  await openDeleteDialog(page, QUESTION)
  await expect(page.getByRole('alertdialog', { name: 'Delete question' })).toContainText(
    "This also deletes its practice history (2 attempts). This can't be undone.",
  )
  await confirmDelete(page)

  await expect(page.getByText('Question deleted')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible()
})

test('closing with typed changes asks "Discard changes?"', async ({ page }) => {
  await openContent(page)
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
  await openContent(page)
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
  await openContent(page)
  await openNewEditor(page)
  await answerField(page).fill('plain answer')

  await formatAnswer(page)

  await expect(answerField(page)).toHaveValue('**stub** plain answer')
  await expect(page.getByText('Formatted with AI')).toBeVisible()
})
