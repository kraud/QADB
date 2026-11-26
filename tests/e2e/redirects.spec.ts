// Addresses from before scenarios, which may be bookmarked.
import { expect, test } from '@playwright/test'
import type { Scenario } from '../../shared/scenario/types'
import { signIn, visit } from '../flows/auth'
import { resetUserData, seedQuestion } from '../support/reset'
import { createFrontendScenario } from '../support/scenario-fixture'
import { loadTestUser } from '../support/test-user'

const QUESTION = 'What is hoisting?'
const NOT_FOUND = "This page doesn't exist."

test.describe('signed in', () => {
  let scenario: Scenario
  let id: string

  test.beforeEach(async ({ page }) => {
    await resetUserData(page.request)
    scenario = await createFrontendScenario(page.request)
    id = await seedQuestion(page.request, scenario, { question: QUESTION })
  })

  for (const path of ['/content', '/practice', '/practice/random']) {
    test(`${path} leads home`, async ({ page }) => {
      await visit(page, path)

      await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
      await expect(page.getByRole('heading', { name: 'Content' })).toBeVisible()
    })
  }

  test('an old question address leads to the question in its scenario', async ({ page }) => {
    await visit(page, `/questions/${id}`)

    await expect(page).toHaveURL(`/scenarios/${scenario.id}/questions/${id}`)
    await expect(page.getByRole('heading', { name: QUESTION })).toBeVisible()
  })

  test('an old address of no question shows the 404 page', async ({ page }) => {
    const response = await page.goto('/questions/unknown')

    expect(response!.status()).toBe(404)
    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible()
    await expect(page).toHaveURL('/questions/unknown')
  })

  test("an old address of someone else's question shows the 404 page", async ({ page, request }) => {
    // Through the `request` fixture, which keeps its session cookie away from the browser.
    const credentials = { username: `other_${Date.now()}`, password: 'a-long-enough-password' }
    expect((await request.post('/api/auth/register', { data: credentials })).ok()).toBe(true)
    const theirs = await seedQuestion(request, await createFrontendScenario(request), { question: 'Theirs' })

    const response = await page.goto(`/questions/${theirs}`)

    expect(response!.status()).toBe(404)
    await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible()
    await expect(page.getByText('Theirs')).toHaveCount(0)
  })
})

test('signed out, the old addresses lead to the login screen, then home', async ({ page, request }) => {
  await resetUserData(request)
  const scenario = await createFrontendScenario(request)
  const id = await seedQuestion(request, scenario, { question: QUESTION })

  for (const path of ['/content', '/practice', '/practice/random', `/questions/${id}`]) {
    await visit(page, path)
    await expect(page, path).toHaveURL('/login?expired=1')
  }

  await signIn(page, loadTestUser())
  await expect(page).toHaveURL(`/scenarios/${scenario.id}/content`)
})
