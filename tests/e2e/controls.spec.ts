import { expect, test } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import { startSelectedPractice } from '../flows/practice'
import { editor, filtersPanel, openContent, openNewEditor, questionRow } from '../flows/questions'
import { resetUserData, seedQuestions } from '../support/reset'
import { createFrontendScenario } from '../support/scenario-fixture'

const FIRST = 'What is a closure?'
const SECOND = 'What is hoisting?'

let scenario: Scenario

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
  scenario = await createFrontendScenario(page.request)
  await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  await openContent(page, scenario.id)
})

test('a chip group is one Tab stop and arrows move within it', async ({ page }) => {
  const group = filtersPanel(page).getByRole('group', { name: 'Category', exact: true })
  const chip = (name: string) => group.getByRole('button', { name, exact: true })

  await chip('HTML').focus()
  await page.keyboard.press('ArrowRight')
  await expect(chip('CSS')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(chip('CSS')).toHaveAttribute('aria-pressed', 'true')
  await expect(chip('HTML')).toHaveAttribute('aria-pressed', 'false')

  await page.keyboard.press('Tab')
  expect(await group.evaluate((element) => element.contains(document.activeElement))).toBe(false)
  await page.keyboard.press('Shift+Tab')
  await expect(chip('CSS')).toBeFocused()
})

test('a segmented control changes with arrow keys and cannot be emptied', async ({ page }) => {
  await openNewEditor(page)
  const group = editor(page).getByRole('group', { name: 'Difficulty', exact: true })
  const radio = (name: string) => group.getByRole('radio', { name, exact: true })

  await expect(radio('Medium')).toBeChecked()
  await radio('Medium').focus()
  // Reka chooses what the focus reaches while the arrow is down, as it is when a person presses it.
  await page.keyboard.down('ArrowRight')
  await expect(radio('Hard')).toBeFocused()
  await expect(radio('Hard')).toBeChecked()
  await page.keyboard.up('ArrowRight')
  await radio('Hard').click()
  await page.keyboard.press('Space')

  await expect(radio('Hard')).toBeChecked()
})

test('Space toggles a switch and a checkbox; clicking a switch label toggles it', async ({ page }) => {
  const incomplete = filtersPanel(page).getByRole('switch', { name: 'Incomplete', exact: true })
  await incomplete.focus()
  await page.keyboard.press('Space')
  await expect(incomplete).toBeChecked()
  await filtersPanel(page).getByText('Incomplete', { exact: true }).last().click()
  await expect(incomplete).not.toBeChecked()

  const box = questionRow(page, FIRST).getByRole('checkbox')
  await box.focus()
  await page.keyboard.press('Space')
  await expect(box).toBeChecked()
})

test('Select all shows the indeterminate state', async ({ page }) => {
  const all = page.getByRole('checkbox', { name: 'Select all shown' })
  await questionRow(page, FIRST).getByRole('checkbox').click()
  await expect(all).toHaveAttribute('aria-checked', 'mixed')

  await all.click()
  await expect(all).toBeChecked()
  await expect(questionRow(page, SECOND).getByRole('checkbox')).toBeChecked()
})

test('clicking a row checkbox does not open the question', async ({ page }) => {
  await questionRow(page, FIRST).getByRole('checkbox').click()

  await expect(questionRow(page, FIRST).getByRole('checkbox')).toBeChecked()
  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
})

test('practice progress exposes value and maximum', async ({ page }) => {
  await startSelectedPractice(page, [FIRST, SECOND], true)
  const progress = page.getByRole('progressbar', { name: 'Practice progress' })

  await expect(progress).toHaveAttribute('aria-valuenow', '0')
  await expect(progress).toHaveAttribute('aria-valuemax', '2')
  await page.getByRole('button', { name: 'Next question' }).click()
  await expect(progress).toHaveAttribute('aria-valuenow', '1')
})
