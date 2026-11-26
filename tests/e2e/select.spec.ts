import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import { visit } from '../flows/auth'
import { closeList, openList } from '../flows/controls'
import { bulkAttribute, bulkDialog, openBulkEditor, openContent, selectAllShown } from '../flows/questions'
import { resetUserData, seedQuestion } from '../support/reset'
import { createFrontendScenario, createScenario } from '../support/scenario-fixture'

const LONG = 'An extraordinarily long scenario name that cannot possibly fit in a header'

let scenario: Scenario

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
  scenario = await createFrontendScenario(page.request)
})

const switcher = (page: Page) => page.getByRole('combobox', { name: 'Scenario' })
const sort = (page: Page) => page.getByRole('combobox', { name: 'Sort by' })

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  if (!found) throw new Error('not visible')
  return found
}

/** The list is placed after it appears: wait until it stands still inside the viewport. */
async function expectInsideViewport(page: Page) {
  const { width, height } = page.viewportSize()!
  await expect
    .poll(async () => {
      const list = await box(page.getByRole('listbox'))
      return list.x >= 0 && list.y >= 0 && list.x + list.width <= width && list.y + list.height <= height
    })
    .toBe(true)
}

const sideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test('the chosen value is in the server-rendered page, with no hydration warning', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) problems.push(message.text())
  })
  const path = `/scenarios/${scenario.id}/content`

  const html = await (await page.request.get(path)).text()
  await visit(page, path)

  expect(html).toMatch(new RegExp(`role="combobox"[\\s\\S]{0,600}${scenario.name}`))
  await expect(switcher(page)).toHaveText(scenario.name)
  await expect(sort(page)).toHaveText('Sort by · Default')
  expect(problems).toEqual([])
})

for (const viewport of [
  { width: 1280, height: 500 },
  { width: 390, height: 844 },
]) {
  test(`a list near the bottom edge opens upward and stays inside a ${viewport.width}px viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await seedQuestion(page.request, scenario, { question: 'What is a closure?' })
    await openContent(page, scenario.id)
    await page.evaluate(() => (document.body.style.paddingBottom = '2000px'))
    await sort(page).evaluate((element) => {
      window.scrollBy(0, element.getBoundingClientRect().bottom - window.innerHeight + 8)
    })
    // The scroll stops at the top of the page: shrink the window to the trigger if it did not get there.
    const trigger = await box(sort(page))
    await page.setViewportSize({ width: viewport.width, height: Math.ceil(trigger.y + trigger.height + 8) })

    // Measured first: an open list hides the rest of the page from role queries.
    const closed = await box(sort(page))
    await openList(sort(page))

    await expectInsideViewport(page)
    const list = await box(page.getByRole('listbox'))
    expect(list.y + list.height).toBeLessThanOrEqual(closed.y)
  })
}

test('a long scenario name does not overflow the header at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const long = await createScenario(page.request, { name: LONG, attributes: [] })
  await openContent(page, long.id)

  await expect(switcher(page)).toHaveText(LONG)
  expect(await sideScroll(page)).toBe(0)
  await openList(switcher(page))
  await expectInsideViewport(page)
})

test('50 options scroll inside the viewport and End reaches the last one', async ({ page }) => {
  const options = Array.from({ length: 50 }, (_, i) => ({ label: `Option ${i}`, color: 'green' as const, isDefault: false }))
  const many = await createScenario(page.request, {
    name: 'Many',
    attributes: Array.from({ length: 50 }, (_, i) => ({
      name: `Rank ${i}`,
      selectionMode: 'single' as const,
      ordered: true,
      required: false,
      options: options.slice(0, 2),
    })),
  })
  await openContent(page, many.id)

  const listed = await openList(sort(page))
  await expect(listed).toHaveCount(53)
  await expectInsideViewport(page)
  await page.keyboard.press('End')

  await expect(listed.last()).toBeFocused()
  await expect(listed.last()).toBeInViewport()
})

test('arrow keys, typeahead, Enter and Escape work; focus returns to the trigger', async ({ page }) => {
  await openContent(page, scenario.id)

  // Each key waits for the list to take the focus, as a person would see it do.
  const item = (name: string) => page.getByRole('option', { name, exact: true })
  await sort(page).focus()
  await page.keyboard.press('Enter')
  await expect(item('Sort by · Default')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(item('Difficulty')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(sort(page)).toHaveText('Difficulty')
  await expect(sort(page)).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(item('Difficulty')).toBeFocused()
  await page.keyboard.type('imp')
  await expect(item('Importance')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(sort(page)).toHaveText('Importance')

  await page.keyboard.press('Enter')
  await expect(item('Importance')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(sort(page)).toHaveText('Importance')
  await expect(sort(page)).toBeFocused()
})

test('Escape closes an open list inside a dialog and keeps the dialog', async ({ page }) => {
  await seedQuestion(page.request, scenario, { question: 'What is a closure?' })
  await openContent(page, scenario.id)
  await selectAllShown(page)
  await openBulkEditor(page)

  await openList(bulkAttribute(page))
  await closeList(bulkAttribute(page))
  await expect(bulkDialog(page)).toBeVisible()
  await expect(bulkAttribute(page)).toBeFocused()

  // A click beside the open list closes the list only.
  await openList(bulkAttribute(page))
  await expect(page.getByRole('option', { selected: true })).toBeFocused()
  // Reka starts watching for outside clicks a moment after the list appears, sooner than a person
  // can click: repeat the click for as long as the list is still open.
  await expect(async () => {
    await page.mouse.click(5, 5)
    await expect(page.getByRole('listbox')).toHaveCount(0, { timeout: 500 })
  }).toPass()
  await expect(bulkDialog(page)).toBeVisible()
})

test('the chevron is inset from the right edge by at least 8px', async ({ page }) => {
  await openContent(page, scenario.id)

  for (const trigger of [switcher(page), sort(page)]) {
    const outer = await box(trigger)
    const chevron = await box(trigger.locator('svg'))
    expect(outer.x + outer.width - (chevron.x + chevron.width)).toBeGreaterThanOrEqual(8)
  }
})
