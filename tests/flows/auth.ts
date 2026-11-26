import type { Page } from '@playwright/test'

export interface Credentials {
  username: string
  password: string
}

/** Opens a page and waits for hydration; input typed into the server-rendered HTML would be lost. */
export async function visit(page: Page, path: string) {
  await page.goto(path)
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt') as
      | (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } })
      | null
    return root?.__vue_app__?.$nuxt?.isHydrating === false
  })
}

/** Submits the login form. The caller asserts the outcome. */
export async function signIn(page: Page, user: Credentials) {
  await visit(page, '/login')
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

/** Submits the registration form. The caller asserts the outcome. */
export async function register(page: Page, user: Credentials) {
  await visit(page, '/register')
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByLabel('Confirm password').fill(user.password)
  await page.getByRole('button', { name: 'Create account' }).click()
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click()
}
