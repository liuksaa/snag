// engine.mjs — everything that talks to yt-dlp: locating the binary, probing a
// url for metadata, and running a download while reporting progress.

import {spawn} from 'node:child_process'
import {createWriteStream} from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

export const HOME_DIR = path.join(os.homedir(), '.snag')
const BIN_DIR = path.join(HOME_DIR, 'bin')
const RELEASES = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'

const assetName = () => {
  if (process.platform === 'win32') return 'yt-dlp.exe'
  if (process.platform === 'darwin') return 'yt-dlp_macos'
  return process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux'
}

/** Does `cmd --version` (or similar) succeed? Async so the UI never stalls. */
function works(cmd, args = ['--version']) {
  return new Promise(resolve => {
    let child
    try {
      child = spawn(cmd, args, {stdio: 'ignore', timeout: 10_000})
    } catch {
      return resolve(false)
    }
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
}

/** Run a command, collecting stdout. Rejects with yt-dlp's own error text. */
function run(cmd, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {signal})
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => (stdout += d))
    child.stderr.on('data', d => (stderr += d))
    child.on('error', reject)
    child.on('close', code =>
      code === 0 ? resolve(stdout) : reject(new Error(tidyError(stderr) || `yt-dlp exited ${code}`)),
    )
  })
}

/** Keep the last ERROR: line, minus yt-dlp's bracketed extractor prefix. */
export function tidyError(stderr) {
  const last = stderr
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('ERROR:'))
    .at(-1)
  return last ? last.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '') : ''
}

/** yt-dlp binary: prefer the user's own, else a cached copy, else fetch one. */
export async function findYtDlp(onStatus, signal) {
  if (await works('yt-dlp')) return 'yt-dlp'

  const local = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
  if (await works(local)) return local

  onStatus?.('first run: fetching yt-dlp…')
  await fs.mkdir(BIN_DIR, {recursive: true})
  const res = await fetch(`${RELEASES}/${assetName()}`, {signal})
  if (!res.ok || !res.body) throw new Error(`Could not download yt-dlp (${res.status}). Check your connection.`)
  const tmp = `${local}.part`
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp), {signal})
  await fs.chmod(tmp, 0o755)
  await fs.rename(tmp, local)
  return local
}

const FFMPEG_RELEASE = 'https://github.com/eugeneware/ffmpeg-static/releases/latest/download'

/**
 * ffmpeg is not optional: without it yt-dlp cannot join a separate video and
 * audio stream (so a 1080p grab lands as two unplayable files) and cannot make
 * an mp3 at all. Rather than making people install it first, fetch a static
 * build once, the same way we fetch yt-dlp. Returns a path to pass to
 * --ffmpeg-location, or undefined when the system already has one on PATH.
 */
export async function findFfmpeg(onStatus, signal) {
  if (await works('ffmpeg', ['-version'])) return undefined // yt-dlp will find it itself

  const local = path.join(BIN_DIR, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  if (await works(local, ['-version'])) return local

  await fs.mkdir(BIN_DIR, {recursive: true})
  const url = `${FFMPEG_RELEASE}/ffmpeg-${process.platform}-${process.arch}`
  const res = await fetch(url, {signal})
  if (!res.ok || !res.body) throw new Error(`Could not fetch ffmpeg (${res.status}). Install ffmpeg and try again.`)

  const expected = Number(res.headers.get('content-length')) || 0
  let got = 0
  let shown = -1
  const tmp = `${local}.part`
  const body = Readable.fromWeb(res.body)
  body.on('data', chunk => {
    got += chunk.length
    // only speak when the number changes, or a 45 MB fetch repaints thousands of times
    const pct = expected ? Math.round((got / expected) * 100) : -1
    if (pct === shown) return
    shown = pct
    onStatus?.(pct < 0 ? 'first run: fetching ffmpeg…' : `first run: fetching ffmpeg ${pct}%`)
  })
  await pipeline(body, createWriteStream(tmp), {signal})
  await fs.chmod(tmp, 0o755)
  await fs.rename(tmp, local)
  return local
}

/** Ask yt-dlp for everything it knows about a url. */
/**
 * @param {string} ytdlp
 * @param {string} url
 * @param {{signal?: AbortSignal, browser?: string}} [opts]
 */
export async function probe(ytdlp, url, {signal, browser} = {}) {
  const args = ['-J', '--no-playlist', '--no-warnings']
  if (browser) args.push('--cookies-from-browser', browser)
  args.push(url)

  const raw = await run(ytdlp, args, signal)
  let info
  try {
    info = JSON.parse(raw)
  } catch {
    throw new Error('yt-dlp returned something this version cannot read.')
  }
  // cache the metadata so the download can skip a second extraction
  const cache = path.join(os.tmpdir(), `snag-${process.pid}-${info.id ?? 'info'}.json`)
  await fs.writeFile(cache, raw)
  return {info, cache}
}

const TAG = 'SNAG|'
const TEMPLATE =
  `${TAG}%(progress.downloaded_bytes)s|%(progress.total_bytes)s|` +
  `%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`

const num = v => {
  if (!v || v === 'NA' || v === 'None') return undefined
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

let running

process.on('exit', () => running?.kill('SIGTERM'))

/**
 * Download one choice. `onProgress` fires with {done,total,speed,eta,part,parts};
 * `onStage` fires when yt-dlp switches to merging or extracting audio.
 * Resolves with the final file path.
 *
 * @param {import('../types.mjs').DownloadRequest} request
 * @param {Partial<import('../types.mjs').Report>} [report]
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
export function download({ytdlp, url, cache, choice, outDir, browser, ffmpeg}, {onProgress, onStage} = {}, signal) {
  const args = [
    ...(cache ? ['--load-info-json', cache] : [url]),
    // an images choice carries no format args — it never reaches yt-dlp, but the
    // type allows it here, so do not assume
    ...(choice.args ?? []),
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--no-quiet', // --print implies --quiet, which would hide progress
    '--progress',
    '--progress-template',
    `download:${TEMPLATE}`,
    '--print',
    'after_move:filepath',
    '--no-simulate',
    '-o',
    // The id is not decoration. Instagram gives a reel no title, so yt-dlp calls
    // every one of them "Video by <account>" — download five reels from the same
    // account and all five target the same filename, leaving you with one file
    // and no sign the others went anywhere. The id makes each name unique.
    path.join(outDir, '%(title).70s [%(id)s].%(ext)s'),
  ]
  if (browser) args.push('--cookies-from-browser', browser)
  if (ffmpeg) args.push('--ffmpeg-location', ffmpeg)

  return new Promise((resolve, reject) => {
    const child = spawn(ytdlp, args, {signal})
    running = child

    let stderr = ''
    let filepath = ''
    let tail = ''
    let part = 0
    let parts = 1
    let last = 0
    const written = [] // so a cancel can clean up after itself

    child.stdout.on('data', chunk => {
      tail += chunk
      const lines = tail.split('\n')
      tail = lines.pop() ?? ''

      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue

        if (line.startsWith(TAG)) {
          const [done, total, estimate, speed, eta] = line.slice(TAG.length).split('|')
          const doneBytes = num(done) ?? 0
          if (doneBytes < last) part++ // byte count reset = next file in the merge
          last = doneBytes
          onProgress?.({
            done: doneBytes,
            total: num(total) ?? num(estimate),
            speed: num(speed),
            eta: num(eta),
            part,
            parts,
          })
        } else if (line.includes('Downloading 1 format(s):')) {
          // "…: Downloading 1 format(s): 137+140" — one id per file
          parts = (line.split('format(s):')[1] ?? '').trim().split('+').length
        } else if (line.startsWith('[download] Destination: ')) {
          written.push(line.slice('[download] Destination: '.length))
        } else if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) {
          const target =
            /Merging formats into "(.+)"/.exec(line)?.[1] ?? /Destination: (.+)$/.exec(line)?.[1]
          if (target) written.push(target)
          onStage?.(line.includes('[Merger]') ? 'merging' : 'extracting')
        } else if (path.isAbsolute(line)) {
          filepath = line
        }
      }
    })

    child.stderr.on('data', d => (stderr += d))
    child.on('error', reject)
    child.on('close', code => {
      running = undefined
      if (signal?.aborted) {
        void Promise.allSettled(
          written.flatMap(f => [f, `${f}.part`, `${f}.ytdl`]).map(f => fs.rm(f, {force: true})),
        )
        return reject(new Error('Cancelled.'))
      }
      if (code === 0 && filepath) return resolve(filepath)
      reject(new Error(tidyError(stderr) || `Download failed (exit ${code}).`))
    })
  })
}
