import { expect, test } from '@playwright/test'
import { register, signIn, signOut, visit } from '../flows/auth'
import { loadTestUser } from '../support/test-user'

const user = loadTestUser()

test('register creates an account and lands on /content', async ({ page }) => {
  const username = `new_${Date.now()}`

  await register(page, { username, password: 'a-long-enough-password' })

  await expect(page).toHaveURL('/content')
  await expect(page.getByRole('heading', { name: 'Content' })).toBeVisible()
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

test('login with wrong password', async ({ page }) => {
  await signIn(page, { username: user.username, password: `${user.password}-wrong` })

  await expect(page.getByText('Invalid credentials')).toBeVisible()
  await expect(page).toHaveURL('/login')
})

test('login, then log out, then /content redirects', async ({ page }) => {
  await signIn(page, user)
  await expect(page).toHaveURL('/content')

  await signOut(page)
  await expect(page).toHaveURL('/login')

  await page.goto('/content')
  await expect(page).toHaveURL('/login?expired=1')
})

test('an expired session shows the notice', async ({ page, context }) => {
  const loaded = page.waitForResponse((res) => res.url().includes('/api/questions') && res.ok())
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
  await expect(page).toHaveURL('/content')
  await expect(html).toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
})
