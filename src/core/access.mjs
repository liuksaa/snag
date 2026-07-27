// access.mjs — getting into things that need a login, and explaining failures
// in words that tell you what to do next.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// Phrases that can only mean "you must be signed in".
const CERTAIN = ['cookies', 'log in', 'login', 'sign in', 'sign-in', 'authentication', 'private']

// Phrases sites also emit for removed or throttled content. Worth borrowing
// cookies for (Instagram's login wall looks exactly like this) but never worth
// telling someone with certainty that they are simply not logged in.
const MAYBE = ['empty media response', 'requested content is not available', 'rate-limit', 'rate limited']

// Deliberately in neither list: "requested format is not available" is a local
// format-selection failure (silent video, DRM, an ended livestream). No cookie
// can fix it, and treating it as a login wall sends people to log in for nothing.

const said = (err, phrases) => {
  const text = String(err?.message ?? err).toLowerCase()
  return phrases.some(p => text.includes(p))
}

/** Might signing in fix this? Gate for the cookie retry. */
export const mightNeedLogin = err => said(err, CERTAIN) || said(err, MAYBE)

/** Is a login definitely the problem? Decides how confidently we word it. */
export const definitelyNeedsLogin = err => said(err, CERTAIN)

const profileDirs = () => {
  const home = os.homedir()
  const support = path.join(home, 'Library', 'Application Support')
  const config = path.join(home, '.config')
  const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
  const roaming = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming')

  if (process.platform === 'darwin')
    return [
      ['chrome', path.join(support, 'Google', 'Chrome')],
      ['brave', path.join(support, 'BraveSoftware', 'Brave-Browser')],
      ['edge', path.join(support, 'Microsoft Edge')],
      ['chromium', path.join(support, 'Chromium')],
      ['vivaldi', path.join(support, 'Vivaldi')],
      ['firefox', path.join(support, 'Firefox')],
    ]
  if (process.platform === 'win32')
    return [
      ['chrome', path.join(local, 'Google', 'Chrome', 'User Data')],
      ['brave', path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')],
      ['edge', path.join(local, 'Microsoft', 'Edge', 'User Data')],
      ['chromium', path.join(local, 'Chromium', 'User Data')],
      ['firefox', path.join(roaming, 'Mozilla', 'Firefox')],
    ]
  return [
    ['chrome', path.join(config, 'google-chrome')],
    ['brave', path.join(config, 'BraveSoftware', 'Brave-Browser')],
    ['chromium', path.join(config, 'chromium')],
    ['edge', path.join(config, 'microsoft-edge')],
    ['firefox', path.join(home, '.mozilla', 'firefox')],
  ]
}

/**
 * Browsers worth trying, most-recently-used first — the one you actually browse
 * in is the one holding the session. SNAG_BROWSER overrides with a single
 * choice (e.g. "brave", or "chrome:Profile 1"). Safari is opt-in only: reading
 * its cookies needs Full Disk Access, which fails confusingly if chosen for you.
 */
export async function browsersToTry() {
  const pinned = process.env.SNAG_BROWSER?.trim()
  if (pinned) return [pinned]

  const found = []
  for (const [name, dir] of profileDirs()) {
    try {
      const stat = await fs.stat(dir)
      if (stat.isDirectory()) found.push({name, used: stat.mtimeMs})
    } catch {
      // not installed
    }
  }
  return found.sort((a, b) => b.used - a.used).map(b => b.name)
}

/** What to tell someone when even their cookies did not open it. */
export function loginAdvice(browser, certain) {
  const where = browser ? `in ${browser}` : 'in your browser'
  const pick = 'Use SNAG_BROWSER=chrome to pick another (brave, firefox, edge, safari).'
  return certain
    ? `This needs a login. Sign in to the site ${where}, then try again. ${pick}`
    : `Could not open this. It may need a login, be private, rate-limited, or removed. ` +
        `If it needs a login, sign in ${where} and try again. ${pick}`
}
