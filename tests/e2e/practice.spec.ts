import { expect, test, type Page, type Route } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import { visit } from '../flows/auth'
import { chooseOption } from '../flows/controls'
import {
  answerCurrent,
  currentQuestion,
  nextQuestion,
  practiceAgain,
  practiceProgress,
  showAnswer,
  startRandomPractice,
  startSelectedPractice,
} from '../flows/practice'
import { listedQuestions, openContent, sortBy } from '../flows/questions'
import {
  deleteQuestion,
  deleteScenario,
  fetchQuestion,
  resetUserData,
  seedQuestion,
  seedQuestions,
} from '../support/reset'
import { addAttribute, createFrontendScenario, createScenario, FRONTEND_SCENARIO } from '../support/scenario-fixture'

const FIRST = 'First: what is a promise?'
const SECOND = 'Second: what is a generator?'
const THIRD = 'Third: what is a proxy?'

let scenario: Scenario

/** Keeps the page's matching requests waiting until released; the server then answers them. */
async function hold(page: Page, method: string, path: string) {
  const held: Route[] = []
  await page.route(`**${path}`, (route) => {
    if (route.request().method() !== method) return route.fallback()
    held.push(route)
  })
  return {
    waiting: () => held.length,
    async release() {
      await expect.poll(() => held.length).toBeGreaterThan(0)
      for (const route of held.splice(0)) await route.continue()
    },
  }
}

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
  scenario = await createFrontendScenario(page.request)
})

test('curated practice follows table order when the switch is on', async ({ page }) => {
  await seedQuestions(page.request, scenario, [
    { question: FIRST, difficulty: 'hard' },
    { question: SECOND, difficulty: 'easy' },
    { question: THIRD, difficulty: 'medium' },
  ])
  await openContent(page, scenario.id)
  await sortBy(page, 'Difficulty')
  await expect(listedQuestions(page)).toHaveText([SECOND, THIRD, FIRST])

  // Picked in neither table nor creation order.
  await startSelectedPractice(page, [THIRD, FIRST, SECOND], true)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/practice`)
  await expect(page.getByText('Practice — 3 questions selected')).toBeVisible()
  for (const [index, question] of [SECOND, THIRD, FIRST].entries()) {
    await expect(practiceProgress(page)).toHaveText(`Question ${index + 1} of 3`)
    await expect(currentQuestion(page)).toHaveText(question)
    await nextQuestion(page)
  }
  await expect(page.getByRole('heading', { name: 'No more questions' })).toBeVisible()
})

test('curated practice with the switch off asks each selected question once', async ({ page }) => {
  await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }, { question: THIRD }])
  await openContent(page, scenario.id)

  await startSelectedPractice(page, [FIRST, THIRD], false) // shuffled, so the order is not fixed

  const seen: string[] = []
  for (const number of [1, 2]) {
    await expect(practiceProgress(page)).toHaveText(`Question ${number} of 2`)
    seen.push(await currentQuestion(page).innerText())
    await nextQuestion(page)
  }
  await expect(page.getByRole('heading', { name: 'No more questions' })).toBeVisible()
  expect(seen.sort()).toEqual([FIRST, THIRD])
})

test('grading records an attempt; Next records none', async ({ page }) => {
  const [first, second] = await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  const attemptRequests: string[] = []
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === '/api/attempts') attemptRequests.push(req.postData() ?? '')
  })
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST, SECOND], true)
  await expect(currentQuestion(page)).toHaveText(FIRST)

  await answerCurrent(page, true)

  // Grading stays on the same question and updates its track record.
  await expect(page.getByText('Correct — recorded')).toBeVisible()
  await expect(currentQuestion(page)).toHaveText(FIRST)
  await expect(page.getByText('Track record — 1 practiced')).toBeVisible()

  await nextQuestion(page)
  await expect(currentQuestion(page)).toHaveText(SECOND)
  await showAnswer(page)
  await expect(page.getByText('Only Correct / Incorrect records an attempt. Skipping with Next records nothing.')).toBeVisible()
  await nextQuestion(page)
  await expect(page.getByRole('heading', { name: 'No more questions' })).toBeVisible()

  expect(attemptRequests).toHaveLength(1)
  expect((await fetchQuestion(page.request, first!)).attempts.map((a) => a.correct)).toEqual([1])
  expect((await fetchQuestion(page.request, second!)).attempts).toEqual([])
})

test('end screen offers Practice again', async ({ page }) => {
  await seedQuestion(page.request, scenario, { question: FIRST })
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST], true)
  await showAnswer(page)
  await nextQuestion(page)

  await expect(page.getByRole('heading', { name: 'No more questions' })).toBeVisible()
  await expect(page.getByText("You've reached the end of the queue. Great session.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Return to content' })).toBeVisible()

  await practiceAgain(page)

  await expect(practiceProgress(page)).toHaveText('Question 1 of 1')
  await expect(currentQuestion(page)).toHaveText(FIRST)
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeVisible()
})

test('reload resumes at the same index', async ({ page }) => {
  await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }, { question: THIRD }])
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST, SECOND, THIRD], true)
  await expect(practiceProgress(page)).toHaveText('Question 1 of 3')
  await nextQuestion(page)
  await expect(practiceProgress(page)).toHaveText('Question 2 of 3')

  await visit(page, `/scenarios/${scenario.id}/practice`) // a full page load

  await expect(practiceProgress(page)).toHaveText('Question 2 of 3')
  await expect(currentQuestion(page)).toHaveText(SECOND)
})

test('random practice visits every question once', async ({ page }) => {
  const questions = [FIRST, SECOND, THIRD, 'Fourth: what is a symbol?']
  await seedQuestions(page.request, scenario, questions.map((question) => ({ question })))
  await openContent(page, scenario.id)

  await startRandomPractice(page)

  await expect(page).toHaveURL(`/scenarios/${scenario.id}/practice/random`)
  const seen: string[] = []
  for (let number = 1; number <= questions.length; number++) {
    await expect(practiceProgress(page)).toHaveText(`Question ${number} of ${questions.length}`)
    seen.push(await currentQuestion(page).innerText())
    await nextQuestion(page)
  }
  await expect(page.getByRole('heading', { name: 'No more questions' })).toBeVisible()
  expect(seen.sort()).toEqual([...questions].sort())
})

test('random practice on an empty bank returns to content', async ({ page }) => {
  await openContent(page, scenario.id)

  await startRandomPractice(page)

  await expect(page.getByText('No questions to practice')).toBeVisible()
  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
  await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible()
})

test('resuming practice after the current question was deleted skips to the next one', async ({ page }) => {
  const FOURTH = 'Fourth: what is a symbol?'
  const FIFTH = 'Fifth: what is a map?'
  const texts = [FIRST, SECOND, THIRD, FOURTH, FIFTH]
  const [, second, third, fourth, fifth] = await seedQuestions(
    page.request,
    scenario,
    texts.map((question) => ({ question })),
  )
  const practice = `/scenarios/${scenario.id}/practice`
  await openContent(page, scenario.id)
  await startSelectedPractice(page, texts, true)
  await expect(practiceProgress(page)).toHaveText('Question 1 of 5')
  await nextQuestion(page)
  await expect(currentQuestion(page)).toHaveText(SECOND)

  await test.step('the current one', async () => {
    await deleteQuestion(page.request, second!)
    await visit(page, practice)
    await expect(currentQuestion(page)).toHaveText(THIRD)
    await expect(practiceProgress(page)).toHaveText('Question 2 of 4')
  })

  await test.step('several in a row', async () => {
    await deleteQuestion(page.request, third!)
    await deleteQuestion(page.request, fourth!)
    await visit(page, practice)
    await expect(currentQuestion(page)).toHaveText(FIFTH)
    await expect(practiceProgress(page)).toHaveText('Question 2 of 2')
  })

  await test.step('the last one', async () => {
    await deleteQuestion(page.request, fifth!)
    await visit(page, practice)
    await expect(page.getByRole('heading', { name: 'No more questions' })).toBeVisible()
    await practiceAgain(page)
    await expect(practiceProgress(page)).toHaveText('Question 1 of 1')
    await expect(currentQuestion(page)).toHaveText(FIRST)
  })
})

test('a question deleted during a session is passed over', async ({ page }) => {
  const [, second] = await seedQuestions(page.request, scenario, [
    { question: FIRST },
    { question: SECOND },
    { question: THIRD },
  ])
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST, SECOND, THIRD], true)
  await expect(currentQuestion(page)).toHaveText(FIRST)

  await deleteQuestion(page.request, second!)
  await nextQuestion(page)

  await expect(currentQuestion(page)).toHaveText(THIRD)
  await expect(practiceProgress(page)).toHaveText('Question 2 of 2')
})

for (const mode of ['curated', 'random'] as const) {
  test(`${mode} practice whose questions were all deleted returns to content`, async ({ page }) => {
    const id = await seedQuestion(page.request, scenario, { question: FIRST })
    await openContent(page, scenario.id)
    if (mode === 'curated') await startSelectedPractice(page, [FIRST], true)
    else await startRandomPractice(page)
    await expect(currentQuestion(page)).toHaveText(FIRST)
    const url = page.url()

    await deleteQuestion(page.request, id)
    await visit(page, url)

    await expect(page.getByText('No questions to practice')).toBeVisible()
    await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
    await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible()
  })
}

test('resuming practice after the scenario was deleted lands on the scenario list', async ({ page }) => {
  await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST, SECOND], true)
  await expect(currentQuestion(page)).toHaveText(FIRST)

  await deleteScenario(page.request, scenario)

  for (const path of ['practice', 'practice/random']) {
    await visit(page, `/scenarios/${scenario.id}/${path}`)
    await expect(page).toHaveURL('/scenarios')
    await expect(page.getByRole('heading', { name: 'Create your first scenario' })).toBeVisible()
  }
})

test('a scenario deleted during a session leads to the scenario list', async ({ page }) => {
  await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST, SECOND], true)
  await expect(currentQuestion(page)).toHaveText(FIRST)

  await deleteScenario(page.request, scenario)
  await nextQuestion(page)

  await expect(page).toHaveURL('/scenarios')
  await expect(page.getByRole('heading', { name: 'Create your first scenario' })).toBeVisible()
})

test('random practice stays inside the current scenario', async ({ page }) => {
  const other = await createScenario(page.request, { ...FRONTEND_SCENARIO, name: 'Another' })
  const mine = [FIRST, SECOND]
  const theirs = ['Other: what is a mutex?', 'Other: what is a deadlock?', 'Other: what is a thread?']
  await seedQuestions(page.request, scenario, mine.map((question) => ({ question })))
  await seedQuestions(page.request, other, theirs.map((question) => ({ question })))

  /** Walks the whole queue and returns what was asked. */
  async function practiceAll(count: number) {
    const seen: string[] = []
    for (let number = 1; number <= count; number++) {
      await expect(practiceProgress(page)).toHaveText(`Question ${number} of ${count}`)
      seen.push(await currentQuestion(page).innerText())
      await nextQuestion(page)
    }
    await expect(page.getByRole('heading', { name: 'No more questions' })).toBeVisible()
    return seen.sort()
  }

  await openContent(page, scenario.id)
  await startRandomPractice(page)
  await expect(page).toHaveURL(`/scenarios/${scenario.id}/practice/random`)
  expect(await practiceAll(mine.length)).toEqual([...mine].sort())

  // The finished session of the first scenario is still stored.
  await chooseOption(page.getByRole('combobox', { name: 'Scenario' }), other.name)
  await expect(page).toHaveURL(`/scenarios/${other.id}/content`)
  await startRandomPractice(page)
  await expect(page).toHaveURL(`/scenarios/${other.id}/practice/random`)
  expect(await practiceAll(theirs.length)).toEqual([...theirs].sort())
})

test('a stored session of another scenario is not resumed', async ({ page }) => {
  const other = await createScenario(page.request, { ...FRONTEND_SCENARIO, name: 'Another' })
  await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST, SECOND], true)
  await nextQuestion(page)
  await expect(currentQuestion(page)).toHaveText(SECOND)

  await visit(page, `/scenarios/${other.id}/practice`)

  await expect(page).toHaveURL(`/scenarios/${other.id}/content`)
  await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible()
  await expect(page.getByRole('heading', { name: SECOND })).toHaveCount(0)

  // Looking elsewhere did not lose it.
  await visit(page, `/scenarios/${scenario.id}/practice`)
  await expect(practiceProgress(page)).toHaveText('Question 2 of 2')
  await expect(currentQuestion(page)).toHaveText(SECOND)
})

test('metadata stays blurred until clicked', async ({ page }) => {
  await seedQuestion(page.request, scenario, { question: FIRST, difficulty: 'hard', categories: ['CSS'] })
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST], true)

  const meta = page.getByRole('button', { name: 'Toggle question metadata visibility' })
  await expect(meta.locator('.meta-label')).toHaveText(['Difficulty', 'Importance', 'Category'])
  await expect(meta.locator('.badge')).toHaveText(['Hard', 'Mid', 'CSS'])
  await expect(meta).toHaveAttribute('aria-pressed', 'false')
  for (const badge of await meta.locator('.badge').all()) await expect(badge).toHaveCSS('filter', 'blur(5px)')

  await meta.click()

  await expect(meta).toHaveAttribute('aria-pressed', 'true')
  for (const badge of await meta.locator('.badge').all()) await expect(badge).toHaveCSS('filter', 'none')
})

test('an incomplete question can be graded and marked as mastered', async ({ page }) => {
  const id = await seedQuestion(page.request, scenario, { question: FIRST })
  await addAttribute(page.request, scenario, { name: 'Level', labels: ['Junior', 'Senior'], required: true })
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST], true)

  await answerCurrent(page, false)
  await expect(page.getByText('Incorrect — recorded')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Mark as mastered' }).setChecked(true, { force: true })

  await expect(page.getByText('Marked as mastered', { exact: true }).first()).toBeVisible()
  const stored = await fetchQuestion(page.request, id)
  expect(stored).toMatchObject({ incomplete: true, mastered: 1 })
  expect(stored.attempts.map((a) => a.correct)).toEqual([0])
})

test('a question that fails to load offers a retry', async ({ page }) => {
  await seedQuestion(page.request, scenario, { question: FIRST })
  await openContent(page, scenario.id)
  await page.route('**/api/questions/*', (route) => route.fulfill({ status: 500, json: {} }))
  await startSelectedPractice(page, [FIRST], true)
  await expect(page.getByRole('heading', { name: "Couldn't load this question" })).toBeVisible()

  await page.unroute('**/api/questions/*')
  await page.getByRole('button', { name: 'Try again' }).click()

  await expect(currentQuestion(page)).toHaveText(FIRST)
  await expect(practiceProgress(page)).toHaveText('Question 1 of 1')
})

test('Next and the mastered switch wait while an answer is being recorded', async ({ page }) => {
  await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST, SECOND], true)
  const attempt = await hold(page, 'POST', '/api/attempts')
  await showAnswer(page)

  await page.getByRole('button', { name: 'Correct', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Next question' })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: 'Mark as mastered' })).toBeDisabled()
  await attempt.release()
  await expect(page.getByText('Track record — 1 practiced')).toBeVisible()
  await expect(currentQuestion(page)).toHaveText(FIRST)
  await expect(page.getByRole('button', { name: 'Next question' })).toBeEnabled()
  await expect(page.getByRole('checkbox', { name: 'Mark as mastered' })).toBeEnabled()
})

test('a mastered response arriving after moving on leaves the current card alone', async ({ page }) => {
  const [first] = await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST, SECOND], true)
  await expect(currentQuestion(page)).toHaveText(FIRST)
  const update = await hold(page, 'PATCH', `/api/questions/${first}`)
  await page.getByRole('checkbox', { name: 'Mark as mastered' }).setChecked(true, { force: true })
  await nextQuestion(page)
  await expect(currentQuestion(page)).toHaveText(SECOND)

  await update.release()

  await expect(page.locator('.toast', { hasText: 'Marked as mastered' })).toBeVisible()
  await expect(currentQuestion(page)).toHaveText(SECOND)
  await expect(page.getByRole('checkbox', { name: 'Mark as mastered' })).not.toBeChecked()
})

test('a failed mastered request arriving after moving on does not reload the current card', async ({ page }) => {
  const [first] = await seedQuestions(page.request, scenario, [{ question: FIRST }, { question: SECOND }])
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST, SECOND], true)
  await expect(currentQuestion(page)).toHaveText(FIRST)
  const update = await hold(page, 'PATCH', `/api/questions/${first}`)
  await page.getByRole('checkbox', { name: 'Mark as mastered' }).setChecked(true, { force: true })
  await nextQuestion(page)
  await expect(currentQuestion(page)).toHaveText(SECOND)
  await showAnswer(page)

  await deleteQuestion(page.request, first!)
  await update.release()

  await expect(page.getByText('Could not update this question')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show answer' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Correct', exact: true })).toBeVisible()
  await expect(practiceProgress(page)).toHaveText('Question 2 of 2')
})

test('overlapping loads of a deleted question drop only that question', async ({ page }) => {
  const [first] = await seedQuestions(page.request, scenario, [
    { question: FIRST },
    { question: SECOND },
    { question: THIRD },
  ])
  await openContent(page, scenario.id)
  await startSelectedPractice(page, [FIRST, SECOND, THIRD], true)
  await expect(currentQuestion(page)).toHaveText(FIRST)
  const update = await hold(page, 'PATCH', `/api/questions/${first}`)
  const attempt = await hold(page, 'POST', '/api/attempts')
  const read = await hold(page, 'GET', `/api/questions/${first}`)
  await showAnswer(page)
  await page.getByRole('checkbox', { name: 'Mark as mastered' }).setChecked(true, { force: true })
  await page.getByRole('button', { name: 'Correct', exact: true }).click()

  // Both requests find the question gone, and each makes the session read it again.
  await deleteQuestion(page.request, first!)
  await update.release()
  await expect.poll(read.waiting).toBe(1)
  await attempt.release()
  await expect.poll(read.waiting).toBe(2)
  await read.release()

  await expect(currentQuestion(page)).toHaveText(SECOND)
  await expect(practiceProgress(page)).toHaveText('Question 1 of 2')
  await nextQuestion(page)
  await expect(currentQuestion(page)).toHaveText(THIRD)
  await expect(practiceProgress(page)).toHaveText('Question 2 of 2')
})
