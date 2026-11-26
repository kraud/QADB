import { expect, test, type Page } from '@playwright/test'
import {
  chooseAmountOperator,
  chooseFilterOption,
  filtersPanel,
  listedQuestions,
  openContent,
  resetFilters,
  search,
  selectAllShown,
  setPracticeCount,
  sortBy,
  toggleFilterChip,
  toggleRecentlyFailed,
  toggleSortDirection,
} from '../flows/questions'
import { recordAttempt, resetUserData, seedQuestions, type SeedQuestion } from '../support/reset'

const ALPHA = 'Alpha: what is a closure?'
const BETA = 'Beta: how does flexbox work?'
const GAMMA = 'Gamma: which tags are semantic?'
const DELTA = 'Delta: what is a hook?'
const ALL = [ALPHA, BETA, GAMMA, DELTA]

const BANK: SeedQuestion[] = [
  // 2 attempts, 50 %, last one incorrect
  { question: ALPHA, difficulty: 'easy', importance: 'high', categories: ['JS'], attempts: [true, false] },
  // 1 attempt, 100 %
  { question: BETA, difficulty: 'medium', importance: 'low', categories: ['CSS'], mastered: true, attempts: [true] },
  // 3 attempts, 0 %
  { question: GAMMA, difficulty: 'hard', importance: 'mid', categories: ['HTML', 'API'], attempts: [false, false, false] },
  // never practiced
  { question: DELTA, difficulty: 'medium', importance: 'high', categories: ['React'] },
]

/** Seeds the standard bank and opens the list with every question showing. */
async function openBank(page: Page) {
  const ids = await seedQuestions(page.request, BANK)
  await openContent(page)
  await expect(listedQuestions(page)).toHaveText(ALL)
  return ids
}

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
})

test('empty bank shows "No questions yet"', async ({ page }) => {
  await openContent(page)

  await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible()
  await expect(page.getByText('Add your first question to start building your bank.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add your first question' })).toBeVisible()
})

test('each filter narrows the list', async ({ page }) => {
  const [, , gammaId] = await openBank(page)
  const list = listedQuestions(page)

  await test.step('difficulty', async () => {
    await toggleFilterChip(page, 'Easy')
    await expect(list).toHaveText([ALPHA])
    await toggleFilterChip(page, 'Easy')
    await expect(list).toHaveText(ALL)
  })

  await test.step('importance', async () => {
    await toggleFilterChip(page, 'Low')
    await expect(list).toHaveText([BETA])
    await toggleFilterChip(page, 'Low')
    await expect(list).toHaveText(ALL)
  })

  await test.step('category', async () => {
    await toggleFilterChip(page, 'API')
    await expect(list).toHaveText([GAMMA])
    await toggleFilterChip(page, 'API')
    await expect(list).toHaveText(ALL)
  })

  await test.step('never done', async () => {
    await chooseFilterOption(page, 'Never been done', 'Yes')
    await expect(list).toHaveText([DELTA])
    await chooseFilterOption(page, 'Never been done', 'No')
    await expect(list).toHaveText([ALPHA, BETA, GAMMA])
    await chooseFilterOption(page, 'Never been done', 'All')
    await expect(list).toHaveText(ALL)
  })

  await test.step('mastered', async () => {
    await chooseFilterOption(page, 'Mastered', 'Yes')
    await expect(list).toHaveText([BETA])
    await chooseFilterOption(page, 'Mastered', 'No')
    await expect(list).toHaveText([ALPHA, GAMMA, DELTA])
    await chooseFilterOption(page, 'Mastered', 'All')
    await expect(list).toHaveText(ALL)
  })

  await test.step('amount >', async () => {
    await chooseAmountOperator(page, '>')
    await expect(list).toHaveText([ALPHA, BETA, GAMMA]) // an empty count means 0
    await setPracticeCount(page, 1)
    await expect(list).toHaveText([ALPHA, GAMMA])
  })

  await test.step('amount <', async () => {
    await chooseAmountOperator(page, '<')
    await expect(list).toHaveText([DELTA])
    await setPracticeCount(page, 2)
    await expect(list).toHaveText([BETA, DELTA])
  })

  await test.step('amount =', async () => {
    await chooseAmountOperator(page, '=')
    await expect(list).toHaveText([ALPHA])
    await setPracticeCount(page, 3)
    await expect(list).toHaveText([GAMMA])
    await chooseAmountOperator(page, 'all')
    await expect(list).toHaveText(ALL)
  })

  await test.step('recently failed', async () => {
    // Gamma has failed before, but its last attempt is now correct.
    await recordAttempt(page.request, gammaId!, true)
    await toggleRecentlyFailed(page)
    await expect(list).toHaveText([ALPHA])
    await toggleRecentlyFailed(page)
    await expect(list).toHaveText(ALL)
  })
})

test('values OR within a filter and AND across filters', async ({ page }) => {
  await openBank(page)
  const list = listedQuestions(page)

  await toggleFilterChip(page, 'Easy')
  await expect(list).toHaveText([ALPHA])
  await toggleFilterChip(page, 'Hard')
  await expect(list).toHaveText([ALPHA, GAMMA])

  await toggleFilterChip(page, 'High') // Delta is High too, but neither Easy nor Hard
  await expect(list).toHaveText([ALPHA])
  await toggleFilterChip(page, 'Mid')
  await expect(list).toHaveText([ALPHA, GAMMA])

  await toggleFilterChip(page, 'HTML')
  await expect(list).toHaveText([GAMMA])
  await toggleFilterChip(page, 'JS')
  await expect(list).toHaveText([ALPHA, GAMMA])
})

test('search matches every word', async ({ page }) => {
  const loop = 'How does the event loop work?'
  const delegation = 'What is event delegation?'
  const box = 'Explain the CSS box model'
  await seedQuestions(page.request, [
    { question: loop, answer: 'It runs queued callbacks one at a time.' },
    { question: delegation },
    { question: box },
  ])
  await openContent(page)
  const list = listedQuestions(page)
  await expect(list).toHaveText([loop, delegation, box])

  await search(page, 'event')
  await expect(list).toHaveText([loop, delegation])

  await search(page, 'callbacks') // only in an answer, and only question text is searched
  await expect(page.getByRole('heading', { name: 'No questions match these filters' })).toBeVisible()
  await expect(list).toHaveCount(0)

  await search(page, 'LOOP even') // any order, any case, parts of words
  await expect(list).toHaveText([loop])

  await search(page, 'event model')
  await expect(page.getByRole('heading', { name: 'No questions match these filters' })).toBeVisible()
  await expect(list).toHaveCount(0)
})

test('sort by difficulty, importance, % and amount in both directions', async ({ page }) => {
  await openBank(page)
  const list = listedQuestions(page)

  // Ties keep creation order in both directions; never practiced counts as the lowest %.
  await sortBy(page, 'Difficulty')
  await expect(list).toHaveText([ALPHA, BETA, DELTA, GAMMA])
  await toggleSortDirection(page)
  await expect(list).toHaveText([GAMMA, BETA, DELTA, ALPHA])

  await sortBy(page, 'Importance') // the direction stays descending
  await expect(list).toHaveText([ALPHA, DELTA, GAMMA, BETA])
  await toggleSortDirection(page)
  await expect(list).toHaveText([BETA, GAMMA, ALPHA, DELTA])

  await sortBy(page, 'Track record %')
  await expect(list).toHaveText([DELTA, GAMMA, ALPHA, BETA])
  await toggleSortDirection(page)
  await expect(list).toHaveText([BETA, ALPHA, GAMMA, DELTA])

  await sortBy(page, 'Track record amount')
  await expect(list).toHaveText([GAMMA, ALPHA, BETA, DELTA])
  await toggleSortDirection(page)
  await expect(list).toHaveText([DELTA, BETA, ALPHA, GAMMA])
})

test('select all, then filtering shows "Selection adjusted to the current results"', async ({ page }) => {
  await openBank(page)

  await selectAllShown(page)
  await expect(page.getByText('4 selected')).toBeVisible()

  await toggleFilterChip(page, 'Hard')

  await expect(page.getByText('Selection adjusted to the current results')).toBeVisible()
  await expect(listedQuestions(page)).toHaveText([GAMMA])
  await expect(page.getByText('1 selected')).toBeVisible()
})

test('no matches shows "No questions match these filters"', async ({ page }) => {
  await openBank(page)

  await toggleFilterChip(page, 'Easy')
  await toggleFilterChip(page, 'Low')

  await expect(page.getByRole('heading', { name: 'No questions match these filters' })).toBeVisible()
  await expect(page.getByText('Try loosening a filter or reset to see the whole bank.')).toBeVisible()
  await expect(listedQuestions(page)).toHaveCount(0)
})

test('Reset filters shows every question again, including never practiced ones', async ({ page }) => {
  await openBank(page)
  const searchBox = page.getByRole('searchbox', { name: 'Search questions' })
  // One of every filter, all of them matching Gamma.
  await search(page, 'semantic')
  await toggleFilterChip(page, 'Hard')
  await toggleFilterChip(page, 'Mid')
  await toggleFilterChip(page, 'HTML')
  await chooseFilterOption(page, 'Never been done', 'No')
  await chooseFilterOption(page, 'Mastered', 'No')
  await chooseAmountOperator(page, '>')
  await setPracticeCount(page, 1)
  await toggleRecentlyFailed(page)
  await expect(filtersPanel(page).getByText('8 active')).toBeVisible()
  await expect(listedQuestions(page)).toHaveText([GAMMA])

  await resetFilters(page)

  await expect(listedQuestions(page)).toHaveText(ALL)
  await expect(searchBox).toHaveValue('')
  await expect(filtersPanel(page).getByText('0 active')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Operator' })).toHaveValue('all')
})
