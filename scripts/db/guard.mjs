// Keeps the database scripts away from remote databases unless asked for explicitly.

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

/**
 * Whether the database address points at this machine. Strict on purpose: anything the database
 * client might read differently from `URL` (user info, backslashes, whitespace) counts as remote.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isLocalUrl(url) {
  if (/[\s\\@]/.test(url)) return false
  try {
    const host = new URL(url).hostname.replace(/^\[(.*)\]$/, '$1')
    return LOCAL_HOSTS.has(host)
  } catch {
    return false
  }
}
