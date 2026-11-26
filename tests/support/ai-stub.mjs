// Stands in for the OpenCode chat completions endpoint: answers `**stub** <input>`.
import { createServer } from 'node:http'
import { text } from 'node:stream/consumers'

const port = Number(process.argv[2] ?? 8190)

createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  if (req.method !== 'POST') return send(200, { ok: true })

  try {
    const { messages } = JSON.parse(await text(req))
    const input = messages.findLast((m) => m.role === 'user').content
    send(200, { choices: [{ message: { role: 'assistant', content: `**stub** ${input}` } }] })
  } catch {
    send(400, { error: { message: 'stub: expected a chat completion request' } })
  }
}).listen(port, '127.0.0.1')
