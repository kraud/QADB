/**
 * Copies the native libsql binding into the production output.
 *
 * `libsql` (a dependency of `@libsql/client`) loads its platform binary via a
 * dynamic `require('@libsql/<platform>-<arch>')` that Nitro's module tracer
 * cannot follow, so the binding is missing from `.output/server/node_modules`
 * and the deployed server crashes at startup. This script copies it after
 * `nuxt build`; Vercel runs `postbuild` automatically.
 */
import { cpSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const TARGETS = {
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
  'linux-x64': 'linux-x64-gnu',
  'linux-arm64': 'linux-arm64-gnu',
  'win32-x64': 'win32-x64-msvc',
}

const require = createRequire(import.meta.url)
const target = TARGETS[`${process.platform}-${process.arch}`]

if (!target) {
  console.warn(`[qadb] no libsql binding mapping for ${process.platform}-${process.arch}; skipping`)
  process.exit(0)
}

try {
  const pkgPath = require.resolve(`@libsql/${target}/package.json`)
  const src = dirname(pkgPath)
  const dest = join(process.cwd(), '.output', 'server', 'node_modules', '@libsql', target)
  cpSync(src, dest, { recursive: true })
  console.log(`[qadb] copied libsql binding ${target} -> ${dest}`)
} catch (err) {
  // The platform package is installed by pnpm as libsql's optional dependency;
  // a missing one just means this platform isn't a deploy target.
  console.warn(`[qadb] could not copy libsql binding ${target}: ${err.message}`)
}
