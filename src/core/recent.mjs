// recent.mjs — the handful of links the home screen offers to grab again.

import fs from 'node:fs'
import path from 'node:path'
import {HOME_DIR} from './engine.mjs'

const FILE = path.join(HOME_DIR, 'recent.json')

/** Kept deliberately small: exactly what the home screen shows and the number
 *  keys can reach. There is no way to select a sixth, so storing more is clutter. */
export const KEEP = 5

export function loadRecent() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed.filter(u => typeof u === 'string').slice(0, KEEP) : []
  } catch {
    return []
  }
}

/** Move `url` to the front, dedup, persist, return the new list. */
export function remember(url) {
  const next = [url, ...loadRecent().filter(u => u !== url)].slice(0, KEEP)
  try {
    fs.mkdirSync(path.dirname(FILE), {recursive: true})
    fs.writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`)
  } catch {
    // remembering is a courtesy, never a reason to fail a download
  }
  return next
}

/** Strip the scheme and any tracking query so a link fits on one line. */
export function tidyLink(url) {
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('?')[0]
}
