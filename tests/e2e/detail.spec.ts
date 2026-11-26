import { expect, test } from '@playwright/test'
import {
  masteredSwitch,
  openDetail,
  setMastered,
  trackRecordResults,
  trackRecordSummary,
} from '../flows/questions'
import { resetUserData, seedQuestion } from '../support/reset'

const QUESTION = 'What is event delegation?'

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
})

test('shows track record newest first', async ({ page }) => {
  const id = await seedQuestion(page.request, { question: QUESTION, attempts: [true, false, false] })

  await openDetail(page, id)

  await expect(page.getByRole('heading', { level: 1, name: QUESTION })).toBeVisible()
  await expect(trackRecordResults(page)).toHaveText(['✘', '✘', '✔'])
  await expect(trackRecordSummary(page)).toHaveText(['Times practiced 3', 'Correct 1', '33.3%'])
})

test('mastered toggle persists', async ({ page }) => {
  const id = await seedQuestion(page.request, { question: QUESTION })
  await openDetail(page, id)
  await expect(masteredSwitch(page)).not.toBeChecked()

  await setMastered(page, true)
  // The label follows the saved question, so it shows once the change is stored.
  await expect(page.getByText('Mastered ✓')).toBeVisible()

  await openDetail(page, id)
  await expect(masteredSwitch(page)).toBeChecked()
  await expect(page.getByText('Mastered ✓')).toBeVisible()
})

test('unknown id shows the 404 panel', async ({ page }) => {
  await openDetail(page, 'does-not-exist')

  await expect(page.getByText('404 · PAGE NOT FOUND')).toBeVisible()
  await expect(page.getByRole('heading', { name: "This page doesn't exist." })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to content' })).toBeVisible()
})
