import { z } from 'zod'

const bodySchema = z.object({
  content: z.string().trim().min(1).max(20000),
})

// OpenCode Go subscription model (monthly token allowance — no Zen credits
// consumed). Served by the Go plan endpoint, not the Zen credits endpoint.
// `reasoning_effort: "low"` is required: these reasoning models otherwise
// stochastically burn the whole max_tokens budget on reasoning and return
// empty content (finish_reason "length").
// const MODEL = 'deepseek-v4-flash'
const MODEL = 'mimo-v2.5'

function isCompletionResponse(value: unknown): value is { choices: { message: { content: string } }[] } {
  if (!value || typeof value !== 'object') return false
  const choices = (value as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return false
  const message = (choices[0] as { message?: unknown } | null)?.message
  if (!message || typeof message !== 'object') return false
  return typeof (message as { content?: unknown }).content === 'string'
}

function upstreamErrorMessage(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const data = (err as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return undefined
  const error = (data as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return undefined
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : undefined
}

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: parsed.error.issues })
  }
  const config = useRuntimeConfig()
  const apiKey = config.opencodeApiKey || process.env.OPENCODE_API_KEY || undefined

  if (!apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'OpenCode API key is not configured. Set OPENCODE_API_KEY in .env and restart.',
    })
  }

  const system =
    "You are a Markdown formatter. Add Markdown formatting (headings, lists, bold, inline code, code fences, links) to the user's content. " +
    'Do NOT change, add, remove, reorder, or translate any wording — every word (including conjunctions like "and" or "or") must appear exactly once in its original form, with its original capitalization. ' +
    'Do NOT wrap the whole answer in a code block. ' +
    'Output ONLY the reformatted Markdown and nothing else — no preamble, no explanation.'
  const user = parsed.data.content

  let formatted: string | undefined
  try {
    const res: unknown = await $fetch('https://opencode.ai/zen/go/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: {
        model: MODEL,
        max_tokens: 8000,
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      timeout: 120000,
    })
    if (isCompletionResponse(res)) formatted = res.choices[0]?.message?.content
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: upstreamErrorMessage(err) ?? 'Could not reach the formatting service.',
    })
  }

  if (!formatted || !formatted.trim()) {
    throw createError({ statusCode: 502, statusMessage: 'The model returned no formatted text.' })
  }
  return { content: formatted }
})
