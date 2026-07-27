// settings.mjs — the few preferences worth remembering between runs.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const FILE = path.join(os.homedir(), '.snag', 'settings.json')

export function loadSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Merge one preference in and persist. Failing to save is never fatal. */
export function saveSetting(key, value) {
  const next = {...loadSettings(), [key]: value}
  try {
    fs.mkdirSync(path.dirname(FILE), {recursive: true})
    fs.writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`)
  } catch {
    // a preference that will not stick is better than a crash
  }
  return next
}
