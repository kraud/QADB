import { expect, test } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import {
  filtersPanel,
  openContent,
  questionCards,
  questionTable,
  toggleFilterChip,
  toggleFiltersPanel,
} from '../flows/questions'
import { resetUserData, seedQuestions } from '../support/reset'
import { createFrontendScenario } from '../support/scenario-fixture'

const EASY = 'What is a closure?'
const HARD = 'What is reconciliation?'

test.use({ viewport: { width: 390, height: 844 } })

let scenario: Scenario

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
  scenario = await createFrontendScenario(page.request)
})

test('cards replace the table and Filters opens the panel', async ({ page }) => {
  await seedQuestions(page.request, scenario, [
    { question: EASY, difficulty: 'easy' },
    { question: HARD, difficulty: 'hard' },
  ])
  await openContent(page, scenario.id)

  await expect(questionCards(page)).toHaveText([EASY, HARD])
  await expect(questionCards(page).first()).toBeVisible()
  await expect(questionTable(page)).toHaveCount(1) // rendered, but not shown at this width
  await expect(questionTable(page)).toBeHidden()
  await expect(filtersPanel(page)).toBeHidden()

  await toggleFiltersPanel(page)
  await expect(filtersPanel(page)).toBeVisible()

  await toggleFilterChip(page, 'Hard')
  await expect(questionCards(page)).toHaveText([HARD])
  await expect(page.getByRole('button', { name: 'Filters · 1 active' })).toBeVisible()

  await toggleFiltersPanel(page)
  await expect(filtersPanel(page)).toBeHidden()
})
