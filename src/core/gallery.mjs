// gallery.mjs — the other half of "download this post".
//
// yt-dlp only knows about video. Paste an Instagram carousel of photographs at
// it and you get "No video formats found", which is true and useless: there is
// plenty there, just not the kind of thing it fetches.
//
// gallery-dl is the same idea for images, and takes the same browser cookies,
// so a post you can see while signed in is a post it can fetch.

import {spawn} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

/** gallery-dl is a Python module, so it is run through the interpreter. */
const RUN = ['python3', '-m', 'gallery_dl']

/** @param {string[]} args @param {{signal?: AbortSignal}} [opts] */
function run(args, {signal} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(RUN[0], [...RUN.slice(1), ...args], {signal})
    let out = ''
    let err = ''
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (err += d))
    child.on('error', reject)
    child.on('close', code =>
      code === 0 ? resolve(out) : reject(new Error(tidy(err) || `gallery-dl exited ${code}`)),
    )
  })
}

/** Is gallery-dl available at all? Its absence is a missing feature, not a crash. */
export async function haveGallery() {
  try {
    await run(['--version'])
    return true
  } catch {
    return false
  }
}

/**
 * List what a post holds without downloading it. Returns the media urls, which
 * is also how we learn how many there are.
 *
 * @param {string} url
 * @param {{browser?: string, signal?: AbortSignal}} [opts]
 * @returns {Promise<string[]>}
 */
export async function probeGallery(url, {browser, signal} = {}) {
  const args = ['--quiet', '-g']
  if (browser) args.push('--cookies-from-browser', browser)
  args.push(url)

  const out = await run(args, {signal})
  return out
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('http'))
}

/**
 * Fetch every item into its own folder under outDir, named after the post, so a
 * five-image carousel does not scatter five files across Downloads.
 *
 * @param {string} url
 * @param {{outDir: string, browser?: string, signal?: AbortSignal,
 *          onFile?: (path: string, n: number) => void}} opts
 * @returns {Promise<string[]>}
 */
export async function downloadGallery(url, {outDir, browser, signal, onFile}) {
  const args = [
    '--quiet',
    // -D is the exact folder, so a post lands in one predictable place rather
    // than under gallery-dl's own site/account tree
    '-D',
    outDir,
    // NOTE the capital P. Lowercase --print writes the format INSTEAD of
    // downloading, which looks exactly like a successful run that wrote
    // nothing. --Print prints and downloads.
    '--Print',
    '{_path}',
  ]
  if (browser) args.push('--cookies-from-browser', browser)
  args.push(url)

  const child = spawn(RUN[0], [...RUN.slice(1), ...args], {signal})
  const written = []
  let err = ''
  let buffer = ''

  const take = line => {
    const path = line.trim()
    // the first line is the folder itself, and metadata sidecars are not media
    if (!path || path.endsWith('/') || path.endsWith('.json')) return
    written.push(path)
    onFile?.(path, written.length)
  }

  child.stdout.on('data', chunk => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(take)
  })
  child.stderr.on('data', d => (err += d))

  await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => {
      // the last path arrives without a trailing newline, so it sits in the
      // buffer unread — drop it and the count is short by one
      take(buffer)
      buffer = ''
      code === 0 ? resolve() : reject(new Error(tidy(err) || `gallery-dl exited ${code}`))
    })
  }))

  // The printed lines drive the progress counter, but they are not the record
  // of what landed: the first line is the folder rather than a file, so
  // counting them undercounts by one. The folder itself is the truth.
  try {
    const names = await fs.readdir(outDir)
    const files = names
      .filter(n => !n.startsWith('.') && !n.endsWith('.json'))
      .sort()
      .map(n => path.join(outDir, n))
    if (files.length) return files
  } catch {
    // no folder means nothing was written; fall back to what was printed
  }
  return written
}

/** gallery-dl prefixes its errors; keep the sentence, drop the machinery. */
function tidy(stderr) {
  const line = stderr
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('['))
    .at(-1)
  return line ? line.replace(/^\w*Error:\s*/, '') : ''
}
