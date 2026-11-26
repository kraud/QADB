import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_URL, createApiTest, type ApiTest } from '../support/api-app'

let api: ApiTest
let request: ReturnType<ApiTest['as']>
/** Stands in for the AI service. */
const service = vi.fn()

beforeEach(async () => {
  api = await createApiTest()
  request = api.as(await api.createUser('formatter'))
  service.mockReset()
  vi.stubGlobal('$fetch', service)
  configureKey('configured-key')
})

afterEach(async () => {
  await api.close()
})

function configureKey(opencodeApiKey: string) {
  vi.stubGlobal('useRuntimeConfig', () => ({ opencodeApiKey, opencodeUrl: AI_URL }))
}

const format = (content: unknown) => request('post', '/api/format-answer', { content })
const reply = (content: unknown) => ({ choices: [{ message: { content } }] })

describe('POST /api/format-answer', () => {
  it("sends the answer to the configured service and returns the reply's text", async () => {
    service.mockResolvedValue(reply('**formatted**'))

    const res = await format('  plain answer  ')

    expect(res).toMatchObject({ status: 200, data: { content: '**formatted**' } })
    expect(service).toHaveBeenCalledOnce()
    const [url, options] = service.mock.calls[0]!
    expect(url).toBe(AI_URL)
    expect(options.method).toBe('POST')
    expect(options.headers.authorization).toBe('Bearer configured-key')
    expect(options.body.messages).toEqual([
      { role: 'system', content: expect.stringContaining('Markdown formatter') },
      { role: 'user', content: 'plain answer' },
    ])
  })

  it('takes the key from OPENCODE_API_KEY when the configuration has none', async () => {
    configureKey('')
    vi.stubEnv('OPENCODE_API_KEY', 'key-from-env')
    service.mockResolvedValue(reply('done'))

    expect((await format('text')).status).toBe(200)

    expect(service.mock.calls[0]![1].headers.authorization).toBe('Bearer key-from-env')
  })

  it('needs a session', async () => {
    const res = await api.as(null)('post', '/api/format-answer', { content: 'text' })

    expect(res.status).toBe(401)
    expect(service).not.toHaveBeenCalled()
  })

  it.each([
    ['blank', '   '],
    ['too long', 'a'.repeat(20_001)],
    ['not text', 42],
  ])('rejects content that is %s', async (_name, content) => {
    expect((await format(content)).status).toBe(422)
    expect(service).not.toHaveBeenCalled()
  })

  it('says so when no key is configured', async () => {
    configureKey('')

    const res = await format('text')

    expect(res.status).toBe(503)
    expect(res.data.statusMessage).toContain('OPENCODE_API_KEY')
    expect(service).not.toHaveBeenCalled()
  })

  it.each([
    ["the service's own message", { data: { error: { message: 'Out of tokens' } } }, 'Out of tokens'],
    ['a general message for a network failure', new Error('socket hang up'), 'Could not reach the formatting service.'],
    ['a general message for an empty error body', { data: {} }, 'Could not reach the formatting service.'],
    ['a general message for an odd error', { data: { error: { message: 7 } } }, 'Could not reach the formatting service.'],
    ['a general message for a thrown string', 'boom', 'Could not reach the formatting service.'],
    ['a general message for a textless error', { data: { error: 'no' } }, 'Could not reach the formatting service.'],
  ])('reports a failed request with %s', async (_name, failure, message) => {
    service.mockRejectedValue(failure)

    const res = await format('text')

    expect(res.status).toBe(502)
    expect(res.data.statusMessage).toBe(message)
  })

  it.each([
    ['nothing', undefined],
    ['no choices', { choices: [] }],
    ['a choice without a message', { choices: [{}] }],
    ['a non-text content', reply(null)],
    ['blank text', reply('  \n ')],
  ])('treats a reply with %s as no result', async (_name, response) => {
    service.mockResolvedValue(response)

    const res = await format('text')

    expect(res.status).toBe(502)
    expect(res.data.statusMessage).toBe('The model returned no formatted text.')
  })
})
