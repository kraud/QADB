// Page-driving steps for curated and random practice.
import type { Locator, Page } from '@playwright/test'
import { selectQuestion } from './questions'

/** Selects rows on the question list (already open) and starts practicing them. */
export async function startSelectedPractice(page: Page, texts: string[], followOrder: boolean) {
  for (const text of texts) await selectQuestion(page, text)
  await page.getByRole('checkbox', { name: 'Follow current sort/order' }).setChecked(followOrder, { force: true })
  await page.getByRole('button', { name: 'Start practice' }).click()
}

/** Starts random practice from the header. */
export async function startRandomPractice(page: Page) {
  await page.getByRole('link', { name: 'Random practice' }).click()
}

/** The text of the question being practiced. */
export function currentQuestion(page: Page): Locator {
  return page.getByRole('heading', { level: 1 })
}

/** "Question 1 of 3"; shown once the question has loaded. */
export function practiceProgress(page: Page): Locator {
  return page.locator('.practice-progress .count')
}

export async function showAnswer(page: Page) {
  await page.getByRole('button', { name: 'Show answer' }).click()
}

/** Reveals the answer if needed, grades it, and waits until the question has reloaded. */
export async function answerCurrent(page: Page, correct: boolean) {
  const reveal = page.getByRole('button', { name: 'Show answer' })
  const grade = page.getByRole('button', { name: correct ? 'Correct' : 'Incorrect', exact: true })
  await reveal.or(grade).first().waitFor()
  if (await reveal.isVisible()) await reveal.click()

  const recorded = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/attempts')
  const reloaded = page.waitForResponse(
    (res) => res.request().method() === 'GET' && /^\/api\/questions\/[^/]+$/.test(new URL(res.url()).pathname),
  )
  await Promise.all([recorded, reloaded, grade.click()])
}

/** Moves on without grading. Works for both "Next question" and "Next random question". */
export async function nextQuestion(page: Page) {
  await page.getByRole('button', { name: /^Next (random )?question$/ }).click()
}

export async function practiceAgain(page: Page) {
  await page.getByRole('button', { name: 'Practice again' }).click()
}
