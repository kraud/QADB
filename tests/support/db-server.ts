import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HOST = '127.0.0.1'
const STARTUP_TIMEOUT_MS = 15_000

/** Binds `port` (0 = any free one) and releases it. Rejects when the port is taken. */
function probePort(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(port, HOST, () => {
      const address = server.address()
      server.close(() => resolve(typeof address === 'object' && address ? address.port : port))
    })
  })
}

/** Starts a throwaway `sqld` on loopback with an empty database. `stop()` deletes its data. */
export async function startDbServer(port?: number): Promise<{ url: string; stop(): Promise<void> }> {
  // Probing first stops `/health` from being answered by someone else's server.
  const listenPort = await probePort(port ?? 0)
  const url = `http://${HOST}:${listenPort}`
  const dir = await mkdtemp(join(tmpdir(), 'qadb-db-'))
  const child = spawn('sqld', ['--no-welcome', '-d', dir, '--http-listen-addr', `${HOST}:${listenPort}`], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })

  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4000)
  })
  let failure: string | undefined
  const closed = new Promise<void>((resolve) => {
    child.once('error', (err) => {
      failure = err.message
      resolve()
    })
    child.once('close', (code, signal) => {
      failure ??= `exited with ${signal ?? code}`
      resolve()
    })
  })

  const killOnExit = () => child.kill('SIGKILL')
  process.once('exit', killOnExit)

  async function stop() {
    process.off('exit', killOnExit)
    if (failure === undefined) child.kill('SIGKILL') // the data is thrown away, no clean shutdown needed
    await closed
    await rm(dir, { recursive: true, force: true })
  }

  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (failure === undefined && Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) })
      if (res.ok) return { url, stop }
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  const reason = failure ?? `no healthy response within ${STARTUP_TIMEOUT_MS} ms`
  await stop()
  throw new Error(`sqld did not start on ${url}: ${reason}\n${stderr}`)
}
