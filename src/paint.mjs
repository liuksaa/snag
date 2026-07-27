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
export const ink = h => rgb(...toRgb(h))
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

/** The quiet palette everything non-accent uses. */
export const SHADE = {
  bright: '#EDEAE4',
  text: '#C8C5BF',
  soft: '#8A8F98',
  faint: '#5A6068',
  rule: '#2E3238',
  ok: '#4ADE80',
}

/** Visible width, ignoring escape codes — needed for any centring. */
export const width = s => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length

/** Centre a (possibly coloured) string in `cols`. */
export const centre = (s, cols) => ' '.repeat(Math.max(0, Math.floor((cols - width(s)) / 2))) + s

/** Truncate to `max` visible chars, ending in an ellipsis. */
export function clip(s, max) {
  const chars = [...s]
  return chars.length <= max ? s : chars.slice(0, Math.max(0, max - 1)).join('') + '…'
}

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
