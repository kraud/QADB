import { expect, test } from '@playwright/test'
import { visit } from '../flows/auth'
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
import { fetchQuestion, resetUserData, seedQuestion, seedQuestions } from '../support/reset'

const FIRST = 'First: what is a promise?'
const SECOND = 'Second: what is a generator?'
const THIRD = 'Third: what is a proxy?'

test.beforeEach(async ({ page }) => {
  await resetUserData(page.request)
})

test('curated practice follows table order when the switch is on', async ({ page }) => {
  await seedQuestions(page.request, [
    { question: FIRST, difficulty: 'hard' },
    { question: SECOND, difficulty: 'easy' },
    { question: THIRD, difficulty: 'medium' },
  ])
  await openContent(page)
  await sortBy(page, 'Difficulty')
  await expect(listedQuestions(page)).toHaveText([SECOND, THIRD, FIRST])

  // Picked in neither table nor creation order.
  await startSelectedPractice(page, [FIRST, SECOND, THIRD], true)

  await expect(page).toHaveURL('/practice')
  await expect(page.getByText('Practice — 3 questions selected')).toBeVisible()
  for (const [index, question] of [SECOND, THIRD, FIRST].entries()) {
    await expect(practiceProgress(page)).toHaveText(`Question ${index + 1} of 3`)
    await expect(currentQuestion(page)).toHaveText(question)
    await nextQuestion(page)
  }
  await expect(page.getByRole('heading', { name: 'No more questions' })).toBeVisible()
})

test('grading records an attempt; Next records none', async ({ page }) => {
  const [first, second] = await seedQuestions(page.request, [{ question: FIRST }, { question: SECOND }])
  const attemptRequests: string[] = []
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === '/api/attempts') attemptRequests.push(req.postData() ?? '')
  })
  await openContent(page)
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
  await seedQuestion(page.request, { question: FIRST })
  await openContent(page)
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
  await seedQuestions(page.request, [{ question: FIRST }, { question: SECOND }, { question: THIRD }])
  await openContent(page)
  await startSelectedPractice(page, [FIRST, SECOND, THIRD], true)
  await expect(practiceProgress(page)).toHaveText('Question 1 of 3')
  await nextQuestion(page)
  await expect(practiceProgress(page)).toHaveText('Question 2 of 3')

  // Known app bug, not fixed yet: a full page load loses the practice session. `AppHeader` creates the
  // practice store during SSR, so on the client Pinia overwrites what `hydrate()` read from
  // sessionStorage with the server's empty state, which is then saved. /practice goes to /content.
  // Marked here, so a failure in the steps above still fails the run.
  test.fail()

  await visit(page, '/practice') // a full page load

  await expect(practiceProgress(page)).toHaveText('Question 2 of 3')
  await expect(currentQuestion(page)).toHaveText(SECOND)
})

test('random practice visits every question once', async ({ page }) => {
  const questions = [FIRST, SECOND, THIRD, 'Fourth: what is a symbol?']
  await seedQuestions(page.request, questions.map((question) => ({ question })))
  await openContent(page)

  await startRandomPractice(page)

  await expect(page).toHaveURL('/practice/random')
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
  await openContent(page)

  await startRandomPractice(page)

  await expect(page.getByText('No questions to practice')).toBeVisible()
  await expect(page).toHaveURL('/content')
  await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible()
})
