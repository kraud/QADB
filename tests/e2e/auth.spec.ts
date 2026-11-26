import { expect, test } from '@playwright/test'
import { register, signIn, signOut, visit } from '../flows/auth'
import { resetUserData } from '../support/reset'
import { createFrontendScenario } from '../support/scenario-fixture'
import { loadTestUser } from '../support/test-user'

const user = loadTestUser()
/** Where the test user lands: the content of its only scenario. */
let content: string

// Through the `request` fixture, which keeps its session cookie away from the browser.
test.beforeEach(async ({ request }) => {
  await resetUserData(request)
  content = `/scenarios/${(await createFrontendScenario(request)).id}/content`
})

test('register creates an account and lands on the scenario list', async ({ page }) => {
  const username = `new_${Date.now()}`

  await register(page, { username, password: 'a-long-enough-password' })

  await expect(page).toHaveURL('/scenarios')
  await expect(page.getByRole('heading', { name: 'Scenarios', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Create your first scenario' })).toBeVisible()
  await expect(page.getByText(username, { exact: true })).toBeVisible()
})

test('register rejects a taken username', async ({ page }) => {
  await register(page, user)

  await expect(page.getByText('That username is already taken')).toBeVisible()
  await expect(page).toHaveURL('/register')
})

test('register validates fields', async ({ page }) => {
  await visit(page, '/register')
  await page.getByLabel('Username').fill(`short_${Date.now()}`)
  await page.getByLabel('Password', { exact: true }).fill('short')
  await page.getByLabel('Confirm password').fill('different')
  await page.getByRole('button', { name: 'Create account' }).click()

  // "At least 8 characters" is also the helper text, so match the error element only.
  await expect(page.locator('.field-err', { hasText: 'At least 8 characters' })).toBeVisible()
  await expect(page.getByText("Passwords don't match.")).toBeVisible()
  await expect(page).toHaveURL('/register')
})

test('closed registration offers no sign-up', async ({ page }, testInfo) => {
  const { closedAppUrl } = testInfo.config.metadata as { closedAppUrl: string }

  await visit(page, `${closedAppUrl}/login`)
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Register' })).toHaveCount(0)

  await visit(page, `${closedAppUrl}/register`)
  await expect(page).toHaveURL(`${closedAppUrl}/login`)

  const refused = await page.request.post(`${closedAppUrl}/api/auth/register`, {
    data: { username: `new_${Date.now()}`, password: 'a-long-enough-password' },
  })
  expect(refused.status()).toBe(403)
})

test('open registration is offered on the login page', async ({ page }) => {
  await visit(page, '/login')
  await page.getByRole('link', { name: 'Register' }).click()

  await expect(page).toHaveURL('/register')
})

test('login with wrong password', async ({ page }) => {
  await signIn(page, { username: user.username, password: `${user.password}-wrong` })

  await expect(page.getByText('Invalid credentials')).toBeVisible()
  await expect(page).toHaveURL('/login')
})

test('login, then log out, then the content page redirects', async ({ page }) => {
  await signIn(page, user)
  await expect(page).toHaveURL(content)
  await expect(page.getByRole('heading', { name: 'Content' })).toBeVisible()

  await signOut(page)
  await expect(page).toHaveURL('/login')

  await page.goto(content)
  await expect(page).toHaveURL('/login?expired=1')
})

test('an expired session shows the notice', async ({ page, context }) => {
  const loaded = page.waitForResponse((res) => /\/api\/scenarios\/[^/]+\/questions/.test(res.url()) && res.ok())
  await signIn(page, user)
  await loaded

  await context.clearCookies()
  await page.getByRole('searchbox', { name: 'Search questions' }).fill('anything')

  await expect(page).toHaveURL('/login?expired=1')
  await expect(page.getByText('Your session expired — please log in again.')).toBeVisible()
})

test('theme toggle persists across reload', async ({ page }) => {
  const html = page.locator('html')
  await signIn(page, user)
  await expect(page).toHaveURL(content)
  await expect(html).toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
})
