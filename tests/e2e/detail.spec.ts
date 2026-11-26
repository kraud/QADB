import { expect, test } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import { visit } from '../flows/auth'
import { currentQuestion, practiceProgress } from '../flows/practice'
import {
  confirmDelete,
  editor,
  masteredSwitch,
  openDetail,
  setMastered,
  trackRecordResults,
  trackRecordSummary,
} from '../flows/questions'
import { fetchQuestion, resetUserData, seedQuestion } from '../support/reset'
import { addAttribute, createFrontendScenario, createScenario, FRONTEND_SCENARIO } from '../support/scenario-fixture'

const QUESTION = 'What is event delegation?'

let scenario: Scenario

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
  scenario = await createFrontendScenario(page.request)
})

test('shows track record newest first', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION, attempts: [true, false, false] })

  await openDetail(page, scenario.id, id)

  await expect(page.getByRole('heading', { level: 1, name: QUESTION })).toBeVisible()
  await expect(trackRecordResults(page)).toHaveText(['✘', '✘', '✔'])
  await expect(trackRecordSummary(page)).toHaveText(['Times practiced 3', 'Correct 1', '33.3%'])
})

test('mastered toggle persists', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION })
  await openDetail(page, scenario.id, id)
  await expect(masteredSwitch(page)).not.toBeChecked()

  await setMastered(page, true)
  // The label follows the saved question, so it shows once the change is stored.
  await expect(page.getByText('Mastered ✓')).toBeVisible()

  await openDetail(page, scenario.id, id)
  await expect(masteredSwitch(page)).toBeChecked()
  await expect(page.getByText('Mastered ✓')).toBeVisible()
})

test('unknown id shows the 404 panel', async ({ page }) => {
  await openDetail(page, scenario.id, 'does-not-exist')

  await expect(page.getByText('404 · PAGE NOT FOUND')).toBeVisible()
  await expect(page.getByRole('heading', { name: "This page doesn't exist." })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to content' })).toBeVisible()
})

test('an unknown address shows the not found page, which leads back', async ({ page }) => {
  await visit(page, '/no-such-page')

  await expect(page.getByRole('heading', { name: "This page doesn't exist." })).toBeVisible()
  await page.getByRole('button', { name: 'Back to content' }).click()
  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
})

test('shows every attribute value, the answer and the link', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, {
    question: QUESTION,
    answer: 'One **listener** on a parent.',
    difficulty: 'hard',
    categories: ['JS', 'HTML'],
    link: 'https://example.com/delegation',
  })

  await openDetail(page, scenario.id, id)

  await expect(page.locator('.badge-row .badge')).toHaveText(['Hard', 'Mid', 'HTML', 'JS'])
  await expect(page.locator('.callout-label')).toHaveText('Answer')
  await expect(page.locator('.callout strong')).toHaveText('listener')
  await expect(page.getByRole('link', { name: 'Open link' })).toHaveAttribute('href', 'https://example.com/delegation')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(editor(page).getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Hard' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a question of another scenario shows the 404 panel', async ({ page }) => {
  const other = await createScenario(page.request, { ...FRONTEND_SCENARIO, name: 'Another' })
  const id = await seedQuestion(page.request, other, { question: QUESTION })

  await openDetail(page, scenario.id, id)

  await expect(page.getByText('404 · PAGE NOT FOUND')).toBeVisible()
  await expect(page.getByRole('heading', { name: QUESTION })).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to content' }).click()
  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
})

test('an unknown scenario shows the 404 panel', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION })

  await openDetail(page, 'does-not-exist', id)

  await expect(page.getByText('404 · PAGE NOT FOUND')).toBeVisible()
  await expect(page.getByRole('heading', { name: QUESTION })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Back to content' })).toBeVisible()
})

test('mastered toggle works on an incomplete question', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION })
  await addAttribute(page.request, scenario, { name: 'Level', labels: ['Junior', 'Senior'], required: true })
  await openDetail(page, scenario.id, id)
  await expect(page.getByTitle('Level')).toHaveText('—')

  await setMastered(page, true)

  await expect(page.getByText('Mastered ✓')).toBeVisible()
  expect(await fetchQuestion(page.request, id)).toMatchObject({ mastered: 1, incomplete: true })
})

test('Practice this question starts a one-question session', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION })
  await openDetail(page, scenario.id, id)

  await page.getByRole('button', { name: 'Practice this question' }).click()

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/practice`)
  await expect(practiceProgress(page)).toHaveText('Question 1 of 1')
  await expect(currentQuestion(page)).toHaveText(QUESTION)
})

test('delete returns to the content page', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: QUESTION })
  await openDetail(page, scenario.id, id)

  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await confirmDelete(page)

  await expect(page.getByText('Question deleted')).toBeVisible()
  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible()
})
