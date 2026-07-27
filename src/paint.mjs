// paint.mjs — colour, gradient, and text helpers. Everything the UI draws with.

export const ESC = '\x1b['
export const RESET = `${ESC}0m`
export const BOLD = `${ESC}1m`
export const DIM = `${ESC}2m`
export const UNBOLD = `${ESC}22m`

export const rgb = (r, g, b) => `${ESC}38;2;${r};${g};${b}m`
export const rgbBg = (r, g, b) => `${ESC}48;2;${r};${g};${b}m`

export const toRgb = h => {
  const n = Number.parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/**
 * Paint with a palette value. A hex string is an exact colour; a raw escape is
 * passed through (the auto theme uses those to borrow the terminal's own
 * colours); empty means "whatever the terminal already uses".
 */
export const ink = c => (!c ? '' : c.startsWith('#') ? rgb(...toRgb(c)) : c)
export const inkBg = h => rgbBg(...toRgb(h))
export const blend = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

/** snag's signature ramp: ember orange through magenta into violet. */
export const AURORA = ['#FF7A00', '#FF5C2E', '#FF3D6E', '#FF2D9A', '#E23AD0', '#B84AF0'].map(toRgb)

/** Sample the ramp at 0..1. */
export function aurora(t) {
  const p = Math.min(0.9999, Math.max(0, t)) * (AURORA.length - 1)
  const i = Math.floor(p)
  return blend(AURORA[i], AURORA[i + 1] ?? AURORA[i], p - i)
}

// The aurora ramp is the brand and never changes. Everything else adapts, so
// snag is legible on a light terminal as well as a dark one.
const PALETTES = {
  // borrow the terminal's own foreground: correct on any theme, including ones
  // neither "light" nor "dark" describes properly
  // `page` paints the whole screen. auto leaves it alone so snag sits on the
  // terminal's own background; light and dark take the surface over completely.
  auto: {page: '', bright: '', text: '', soft: '\x1b[90m', faint: '\x1b[90m', rule: '\x1b[90m', ok: '\x1b[32m'},
  light: {page: '#FFFFFF', bright: '#111316', text: '#2B2F35', soft: '#585E66', faint: '#8992A0', rule: '#D6DBE2', ok: '#15803D'},
  dark: {page: '#14161A', bright: '#EDEAE4', text: '#C8C5BF', soft: '#8A8F98', faint: '#5A6068', rule: '#2E3238', ok: '#4ADE80'},
}

export const THEMES = Object.keys(PALETTES)

/**
 * Mutated in place rather than replaced, because every view reads SHADE.x at
 * render time — so changing theme repaints without rewiring anything.
 */
export const SHADE = {...PALETTES.auto}

let theme = 'auto'
export const currentTheme = () => theme
export function setTheme(name) {
  if (!PALETTES[name]) return theme
  theme = name
  Object.assign(SHADE, PALETTES[name])
  return theme
}
export const nextTheme = () => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])

// How many terminal columns a character occupies. Most take one, but CJK and
// emoji take two, and combining marks take none — so a Japanese video title
// counted by character length would be centred half a screen off.
const WIDE = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3],
  [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60],
  [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff], [0x20000, 0x3fffd],
]
const ZERO = [[0x0300, 0x036f], [0x200b, 0x200f], [0xfe00, 0xfe0f], [0xfeff, 0xfeff]]
const inRanges = (code, ranges) => ranges.some(([lo, hi]) => code >= lo && code <= hi)

export function charWidth(ch) {
  const code = ch.codePointAt(0)
  if (code < 0x0300) return 1 // fast path: plain latin
  if (inRanges(code, ZERO)) return 0
  return inRanges(code, WIDE) ? 2 : 1
}

const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '')

/** Columns a string occupies once drawn, ignoring escape codes. */
export const width = s => [...strip(s)].reduce((n, ch) => n + charWidth(ch), 0)

/** Centre a (possibly coloured) string in `cols`. */
export const centre = (s, cols) => ' '.repeat(Math.max(0, Math.floor((cols - width(s)) / 2))) + s

/** Truncate to `max` COLUMNS (not characters), ending in an ellipsis. */
export function clip(s, max) {
  if (width(s) <= max) return s
  let out = ''
  let used = 0
  for (const ch of s) {
    const w = charWidth(ch)
    if (used + w > max - 1) break
    out += ch
    used += w
  }
  return out + '…'
}

/** Pad to `cols` COLUMNS, so columns line up whatever the script. */
export const padTo = (s, cols) => s + ' '.repeat(Math.max(0, cols - width(s)))

/** Paint each character along the aurora ramp, left to right. */
export function gradient(text, from = 0, to = 1) {
  const chars = [...text]
  return (
    chars
      .map((ch, i) => {
        if (ch === ' ') return ' '
        const t = from + ((to - from) * i) / Math.max(1, chars.length - 1)
        return rgb(...aurora(t)) + ch
      })
      .join('') + RESET
  )
}

/** Human byte sizes, binary units (what the OS reports). */
export function bytes(n) {
  if (!n || n <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v >= 100 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`
}

/** Seconds as m:ss / h:mm:ss. */
export function clock(total) {
  if (!Number.isFinite(total) || total < 0) return ''
  const s = Math.floor(total % 60)
  const m = Math.floor((total / 60) % 60)
  const h = Math.floor(total / 3600)
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export const rate = b => (b > 0 ? `${bytes(b)}/s` : '')
