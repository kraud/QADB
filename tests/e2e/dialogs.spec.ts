import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import {
  answerField,
  discardDialog,
  editor,
  keepEditing,
  openContent,
  openEditor,
  openNewEditor,
  questionField,
  saveEditor,
} from '../flows/questions'
import { resetUserData, seedQuestions } from '../support/reset'
import { createFrontendScenario } from '../support/scenario-fixture'

const QUESTION = 'What is a closure?'

let scenario: Scenario

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
  scenario = await createFrontendScenario(page.request)
})

const addButton = (page: Page) => page.getByRole('button', { name: 'Add question', exact: true })

/** Tabs `times` times and says whether the focus ever left the dialog. */
async function tabsOut(page: Page, dialog: Locator, times: number) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(i % 4 === 3 ? 'Shift+Tab' : 'Tab')
    if (!(await dialog.evaluate((element) => element.contains(document.activeElement)))) return true
  }
  return false
}

test('opening focuses the first field; closing returns focus to the opener', async ({ page }) => {
  await openContent(page, scenario.id)

  await addButton(page).click()
  await expect(questionField(page)).toBeFocused()
  await page.keyboard.press('Escape')

  await expect(editor(page)).toBeHidden()
  await expect(addButton(page)).toBeFocused()
})

test('Tab stays inside the dialog, including while saving', async ({ page }) => {
  await openContent(page, scenario.id)
  await openNewEditor(page)
  await questionField(page).fill(QUESTION)
  await answerField(page).fill('A function with its scope.')
  expect(await tabsOut(page, editor(page), 25)).toBe(false)

  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/scenarios/*/questions', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  await saveEditor(page)
  await expect(editor(page).getByRole('button', { name: 'Save' })).toBeDisabled()
  expect(await tabsOut(page, editor(page), 25)).toBe(false)
  release()
  await expect(editor(page)).toBeHidden()
})

test('the page behind does not scroll or take clicks', async ({ page }) => {
  await seedQuestions(
    page.request,
    scenario,
    Array.from({ length: 30 }, (_, i) => ({ question: `Question number ${i}` })),
  )
  await openContent(page, scenario.id)
  await openNewEditor(page)

  await page.mouse.move(5, 400)
  await page.mouse.wheel(0, 600)
  await expect(editor(page)).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  // The list behind is out of reach of the keyboard and of screen readers.
  await expect(page.getByRole('button', { name: 'Add question', exact: true })).toHaveCount(0)
})

test('closing the discard confirmation returns focus to the editor', async ({ page }) => {
  await openContent(page, scenario.id)
  await openNewEditor(page)
  await questionField(page).fill(QUESTION)
  const cancel = editor(page).getByRole('button', { name: 'Cancel' })

  await cancel.click()
  await expect(discardDialog(page)).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(discardDialog(page)).toBeHidden()
  await expect(editor(page)).toBeVisible()
  await expect(cancel).toBeFocused()
})

test('Escape and overlay click ask before discarding typed changes', async ({ page }) => {
  await seedQuestions(page.request, scenario, [{ question: QUESTION }])
  await openContent(page, scenario.id)
  await openEditor(page, QUESTION)
  await expect(questionField(page)).toHaveValue(QUESTION)
  await questionField(page).fill('Changed')

  await page.keyboard.press('Escape')
  await expect(discardDialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(discardDialog(page)).toBeHidden()
  await expect(questionField(page)).toHaveValue('Changed')

  // A click on the backdrop, once the dialog is listening for it.
  await expect(async () => {
    await page.mouse.click(5, 5)
    await expect(discardDialog(page)).toBeVisible({ timeout: 500 })
  }).toPass()
  await keepEditing(page)
  await expect(questionField(page)).toHaveValue('Changed')
})
