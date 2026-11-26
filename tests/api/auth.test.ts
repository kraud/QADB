import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { users } from '../../db/schema'
import { verifyPassword } from '../../server/utils/password'
import { createApiTest, type ApiTest } from '../support/api-app'

const PASSWORD = 'a-long-enough-password'

let api: ApiTest

beforeEach(async () => {
  api = await createApiTest()
})

afterEach(async () => {
  await api.close()
})

const post = (url: string, body?: unknown) => api.as(null)('post', url, body)
const register = (username: string, password = PASSWORD) => post('/api/auth/register', { username, password })
const login = (username: string, password: string) => post('/api/auth/login', { username, password })
const storedUsers = () => api.db.select().from(users)

describe('register', () => {
  it('stores a hashed password and signs the new user in', async () => {
    const res = await register('  new_user  ')

    expect(res.status).toBe(200)
    expect(res.data).toEqual({ id: expect.any(String), username: 'new_user' })
    expect(res.session).toBe(res.data.id)
    const [stored] = await api.db.select().from(users).where(eq(users.id, res.data.id))
    expect(stored!.password_hash).not.toContain(PASSWORD)
    expect(await verifyPassword(stored!.password_hash, PASSWORD)).toBe(true)
    expect((await api.as(res.data)('get', '/api/scenarios')).status).toBe(200)
  })

  it('refuses a taken username without touching the account', async () => {
    await register('taken')
    const before = await storedUsers()

    const res = await register('taken', 'another-long-password')

    expect(res.status).toBe(409)
    expect(res.data.statusMessage).toBe('That username is already taken')
    expect(res.session).toBeUndefined()
    expect(await storedUsers()).toEqual(before)
  })

  it.each([
    ['a short username', 'ab', PASSWORD, 'username'],
    ['a long username', 'a'.repeat(33), PASSWORD, 'username'],
    ['a username with spaces', 'two words', PASSWORD, 'username'],
    ['a short password', 'fine_name', 'short', 'password'],
  ])('rejects %s', async (_name, username, password, field) => {
    const res = await register(username, password)

    expect(res.status).toBe(422)
    expect(res.data.data.map((issue: { path: string[] }) => issue.path[0])).toEqual([field])
    expect(await storedUsers()).toEqual([])
  })
})

describe('login', () => {
  it('signs the user in with the right password', async () => {
    const { data: user } = await register('returning')

    const res = await login(' returning ', PASSWORD)

    expect(res.status).toBe(200)
    expect(res.data).toEqual(user)
    expect(res.session).toBe(user.id)
  })

  it.each([
    ['a wrong password', 'returning', `${PASSWORD}-wrong`],
    ['an unknown user', 'nobody', PASSWORD],
  ])('answers %s with the same refusal and no session', async (_name, username, password) => {
    await register('returning')

    const res = await login(username, password)

    expect(res.status).toBe(401)
    expect(res.data.statusMessage).toBe('Invalid credentials')
    expect(res.session).toBeUndefined()
  })

  it.each([
    ['a blank username', { username: '  ', password: PASSWORD }],
    ['a missing password', { username: 'returning' }],
  ])('rejects %s', async (_name, body) => {
    expect((await post('/api/auth/login', body)).status).toBe(422)
  })
})

describe('session', () => {
  it('ends with log out', async () => {
    const { data: user } = await register('leaving')
    const request = api.as(user)

    const res = await request('post', '/api/auth/logout')

    expect(res).toMatchObject({ status: 200, data: { ok: true } })
    expect(res.session).toBe('')
    expect((await request('get', '/api/scenarios')).status).toBe(401)
  })

  it('does not count without both an id and a username', async () => {
    const incomplete = await api.createUser('')

    expect((await api.as(incomplete)('get', '/api/scenarios')).status).toBe(401)
  })
})
