// formats.mjs — turn yt-dlp's format list into a menu a human can choose from.
//
// The point of this module: Apple's players (QuickTime, Preview, Photos,
// Messages) decode H.264/H.265 only. yt-dlp's own preference order is the
// opposite — it ranks AV1 and VP9 above H.264 — so "best quality" routinely
// produces a file macOS opens as a black screen with sound. Every tier here is
// therefore labelled with the codec you will actually get, and the recommended
// pick is the sharpest one that plays everywhere.

import {bytes} from '../paint.mjs'
import {t} from '../i18n.mjs'

const MAX_TIERS = 8

/** Bias yt-dlp's own ranking toward the codecs Apple players can open. */
const PREFER_COMPATIBLE = ['-S', 'vcodec:h264,acodec:aac']

export const PLAYS_ANYWHERE = 'anywhere'
export const NEEDS_VLC = 'vlc'

const lower = s => (s ?? '').toLowerCase()

/** A stream carrying its own audio (progressive) vs a video-only DASH stream. */
const hasSound = f => Boolean(f.acodec && f.acodec !== 'none')

/**
 * Apple-decodable? A progressive stream whose codec yt-dlp reports as unknown
 * is H.264 in practice — that is exactly the ready-made file the web
 * "download this reel" sites hand out, and it is the most compatible option.
 */
export function playsAnywhere(f) {
  const v = lower(f.vcodec)
  if (!v || v === 'none' || v === 'unknown') return hasSound(f)
  return ['avc', 'h264', 'hev', 'hvc', 'h265'].some(p => v.startsWith(p))
}

export function codecName(vcodec) {
  const v = lower(vcodec)
  if (v.startsWith('avc') || v.startsWith('h264')) return 'H.264'
  if (v.startsWith('hev') || v.startsWith('hvc') || v.startsWith('h265')) return 'H.265'
  if (v.startsWith('vp09') || v.startsWith('vp9')) return 'VP9'
  if (v.startsWith('av01') || v.startsWith('av1')) return 'AV1'
  if (v.startsWith('vp08') || v.startsWith('vp8')) return 'VP8'
  return ''
}

/**
 * Conventional resolution = the short side, so a 1080x1920 phone video reads
 * "1080p" like it does everywhere else, not "1920p".
 */
export const shortSide = f => (f.width > 0 ? Math.min(f.width, f.height) : f.height)

/** Prefer mp4/H.264 among equals, then bitrate. */
function rank(f) {
  let score = f.tbr ?? 0
  if (lower(f.ext) === 'mp4') score += 10_000
  if (lower(f.vcodec).startsWith('avc')) score += 5_000
  return score
}

const sizeOf = f => f.filesize ?? f.filesize_approx ?? 0

/**
 * Build the menu. Each entry is
 * {kind, label, note, compatibility, resolution, codec, size, args}.
 */
export function buildMenu(info) {
  const all = info?.formats ?? []
  const menu = []

  const audioTracks = all.filter(f => hasSound(f) && (!f.vcodec || f.vcodec === 'none'))
  const bestAudio = [...audioTracks].sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0]
  const audioSize = sizeOf(bestAudio ?? {})

  const videos = all.filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
  const tiers = [...new Set(videos.map(shortSide))].sort((a, b) => b - a).slice(0, MAX_TIERS)

  // recommend the sharpest tier that plays everywhere; if none do, the sharpest
  const suggested = tiers.find(t => videos.some(f => shortSide(f) === t && playsAnywhere(f))) ?? tiers[0]

  for (const tier of tiers) {
    const candidates = videos.filter(f => shortSide(f) === tier)
    const compatible = candidates.find(playsAnywhere)
    // the row describes ONE stream, and the selector must target that same
    // stream — deriving them separately lets a row promise H.264 and deliver VP9
    const chosen = compatible ?? [...candidates].sort((a, b) => rank(b) - rank(a))[0]
    const height = chosen.height

    const size = sizeOf(chosen) + (hasSound(chosen) ? 0 : audioSize)
    menu.push({
      kind: 'video',
      resolution: tier,
      codec: compatible ? codecName(compatible.vcodec) || 'H.264' : codecName(chosen.vcodec) || 'VP9',
      compatibility: compatible ? PLAYS_ANYWHERE : NEEDS_VLC,
      size,
      badge: tier >= 2160 ? '4K' : tier >= 1440 ? '2K' : tier >= 1080 ? 'HD' : '',
      suggested: tier === suggested,
      args: [
        '-f',
        // a ready-made compatible file first, then a merge at the same height,
        // then anything at or below it
        `b[height=${height}][ext=mp4]/b[height=${height}]/bv*[height=${height}]+ba/bv*[height<=${height}]+ba/b`,
        ...PREFER_COMPATIBLE,
        '--merge-output-format',
        'mp4',
      ],
    })
  }

  if (menu.length === 0) {
    menu.push({
      kind: 'video',
      resolution: 0,
      codec: '',
      compatibility: PLAYS_ANYWHERE,
      size: 0,
      badge: '',
      suggested: true,
      args: ['-f', 'bv*+ba/b', ...PREFER_COMPATIBLE, '--merge-output-format', 'mp4'],
    })
  }

  menu.push({
    kind: 'audio',
    resolution: 0,
    codec: 'mp3',
    compatibility: PLAYS_ANYWHERE,
    size: audioSize,
    badge: '',
    suggested: false,
    args: ['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0'],
  })

  return menu
}

/** One menu row as display text (the view adds colour). */
export function describe(entry) {
  if (entry.kind === 'images') {
    return {left: t('images', {n: entry.count}), right: entry.count === 1 ? 'jpg' : `${entry.count} files`}
  }
  if (entry.kind === 'audio') return {left: t('audioOnly'), right: entry.size ? bytes(entry.size) : 'mp3'}
  if (!entry.resolution) return {left: t('bestAvailable'), right: ''}
  const badge = entry.badge ? ` ${entry.badge}` : ''
  return {
    left: `${entry.resolution}p${badge}`,
    right: [entry.codec, entry.size ? bytes(entry.size) : ''].filter(Boolean).join('  '),
  }
}
