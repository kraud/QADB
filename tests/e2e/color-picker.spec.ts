import { expect, test, type Page } from '@playwright/test'
import { attributeCards, openNewScenario, openScenarios, optionRows, scenarioNameField } from '../flows/scenarios'
import { resetUserData } from '../support/reset'

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
  await openScenarios(page)
  await openNewScenario(page)
  await page.getByRole('button', { name: 'Add attribute' }).click()
})

const trigger = (page: Page) => optionRows(attributeCards(page).first()).first().getByRole('button', { name: 'Color', exact: true })
const list = (page: Page) => page.getByRole('group', { name: 'Colors' })
const color = (page: Page, name: string) => list(page).getByRole('button', { name, exact: true })

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 420 },
]) {
  test(`the color list stays inside a ${viewport.width}x${viewport.height} viewport near the bottom`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.evaluate(() => (document.body.style.paddingBottom = '2000px'))
    await trigger(page).evaluate((element) => {
      window.scrollBy(0, element.getBoundingClientRect().bottom - window.innerHeight + 80)
    })

    await trigger(page).click()

    await expect(color(page, 'Red')).toBeInViewport({ ratio: 1 })
    await expect(color(page, 'Blue 1')).toBeInViewport({ ratio: 1 })
  })
}

test('arrows move between colors, Enter chooses, Escape closes only the list', async ({ page }) => {
  await trigger(page).click()
  await color(page, 'Green').click()
  await expect(trigger(page)).toHaveAttribute('title', 'Green')

  await trigger(page).press('Enter')
  await expect(color(page, 'Green')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(color(page, 'Green')).not.toBeFocused()
  // Moving chooses nothing.
  await expect(color(page, 'Green')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(list(page)).toHaveCount(0)
  await expect(trigger(page)).toHaveAttribute('title', 'Green')
  await expect(trigger(page)).toBeFocused()

  await trigger(page).press('Enter')
  await expect(color(page, 'Green')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(color(page, 'Green')).not.toBeFocused()
  await page.keyboard.press('Enter')
  await expect(list(page)).toHaveCount(0)
  await expect(trigger(page)).not.toHaveAttribute('title', 'Green')
  await expect(trigger(page)).toBeFocused()
})

test('clicking outside closes the color list', async ({ page }) => {
  await trigger(page).click()
  await expect(color(page, 'Red')).toBeVisible()

  await expect(async () => {
    await scenarioNameField(page).click({ timeout: 500 })
    await expect(list(page)).toHaveCount(0, { timeout: 500 })
  }).toPass()
  await expect(scenarioNameField(page)).toBeFocused()
})
