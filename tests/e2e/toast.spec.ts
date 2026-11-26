import { expect, test, type Page } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import { toast } from '../flows/controls'
import { startSelectedPractice } from '../flows/practice'
import { addQuestion, editor, openContent, openNewEditor } from '../flows/questions'
import { resetUserData, seedQuestion } from '../support/reset'
import { createFrontendScenario } from '../support/scenario-fixture'

const QUESTION = 'What is a closure?'
const NEW = { question: 'What is hoisting?', answer: 'Declarations move up.' }

let scenario: Scenario

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
  scenario = await createFrontendScenario(page.request)
})

const mastered = (page: Page) => page.getByRole('switch', { name: 'Mark as mastered' })

test('a toast is announced and disappears', async ({ page }) => {
  await openContent(page, scenario.id)

  await addQuestion(page, NEW)

  await expect(toast(page, 'Question added')).toBeVisible()
  // Read out from a live region screen readers can reach (Reka's own is hidden from them).
  await expect(page.getByRole('status').filter({ hasText: 'Question added' })).toHaveCount(1)
  await expect(toast(page, 'Question added')).toHaveCount(0)
})

test('hovering a toast keeps it open', async ({ page }) => {
  await openContent(page, scenario.id)
  await addQuestion(page, NEW)
  const shown = toast(page, 'Question added')

  await shown.hover()
  // Longer than a toast lasts: there is no event to wait for when nothing should happen.
  await page.waitForTimeout(3200)
  await expect(shown).toBeVisible()

  await page.mouse.move(5, 600)
  await expect(shown).toHaveCount(0)
})

test('several toasts stack and do not block clicks', async ({ page }) => {
  await seedQuestion(page.request, scenario, { question: QUESTION })
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [QUESTION], true)

  await mastered(page).click()
  await expect(toast(page, 'Marked as mastered')).toBeVisible()
  await mastered(page).click()
  await expect(toast(page, 'Mastered flag removed')).toBeVisible()
  await expect(page.locator('.toast')).toHaveCount(2)
  const [first, second] = await Promise.all(
    [0, 1].map(async (i) => (await page.locator('.toast').nth(i).boundingBox())!),
  )
  expect(Math.abs(second!.y - first!.y)).toBeGreaterThanOrEqual(first!.height)

  await page.getByRole('button', { name: 'Show answer' }).click()
  await expect(page.getByRole('button', { name: 'Correct', exact: true })).toBeVisible()
})

test('clicking a toast over a dialog leaves the dialog alone', async ({ page }) => {
  await openContent(page, scenario.id)
  await addQuestion(page, NEW)
  await openNewEditor(page)

  await toast(page, 'Question added').click()

  await expect(editor(page)).toBeVisible()
})
