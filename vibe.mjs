#!/usr/bin/env node
// vibe.mjs — six front-page treatments for snag, side by side in your terminal.
// ← / → to switch, q to quit. No dependencies, all raw ANSI.

const out = s => process.stdout.write(s)
const ALT_ON = '\x1b[?1049h\x1b[?25l'
const ALT_OFF = '\x1b[?25h\x1b[?1049l'
const HOME = '\x1b[H'
const CLEAR = '\x1b[2J\x1b[H'
const RESET = '\x1b[0m'

const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`
const bg = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`
const hex = h => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const fgHex = h => fg(...hex(h))
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

const size = () => ({
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
})

// centre a string that contains ANSI codes, by its *visible* width
const visLen = s => s.replace(/\x1b\[[0-9;]*m/g, '').length
const pad = (s, cols) => ' '.repeat(Math.max(0, Math.floor((cols - visLen(s)) / 2))) + s

// ─────────────────────────────────────────────────────────── shared letterforms

// 5x7 pixel font, just what "snag" needs
const FONT = {
  s: ['01110', '10001', '10000', '01110', '00001', '10001', '01110'],
  n: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  a: ['00100', '01010', '10001', '10001', '11111', '10001', '10001'],
  g: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
}
// word as a pixel grid, with `gap` blank columns between letters
function wordPixels(word, gap = 1) {
  const rows = 7
  const grid = Array.from({length: rows}, () => [])
  for (const ch of word) {
    const glyph = FONT[ch]
    for (let y = 0; y < rows; y++) {
      for (const bit of glyph[y]) grid[y].push(bit === '1')
      for (let g = 0; g < gap; g++) grid[y].push(false)
    }
  }
  return grid
}

// scale a pixel grid up
function scale(grid, sx, sy) {
  const out = []
  for (const row of grid) {
    const line = []
    for (const cell of row) for (let i = 0; i < sx; i++) line.push(cell)
    for (let j = 0; j < sy; j++) out.push(line)
  }
  return out
}

// ── braille canvas: 2x4 dots per character cell, the highest resolution a
//    terminal can draw without image protocols
const BRAILLE_BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
]
function brailleRender(grid) {
  const h = grid.length
  const w = grid[0].length
  const lines = []
  for (let cy = 0; cy < Math.ceil(h / 4); cy++) {
    let line = ''
    for (let cx = 0; cx < Math.ceil(w / 2); cx++) {
      let bits = 0
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 4; dy++) {
          const x = cx * 2 + dx
          const y = cy * 4 + dy
          if (grid[y]?.[x]) bits |= BRAILLE_BITS[dx][dy]
        }
      }
      line += String.fromCharCode(0x2800 + bits)
    }
    lines.push(line)
  }
  return lines
}

// ANSI Shadow block letters (the current snag look)
const BLOCK = [
  '███████╗███╗   ██╗ █████╗  ██████╗ ',
  '██╔════╝████╗  ██║██╔══██╗██╔════╝ ',
  '███████╗██╔██╗ ██║███████║██║  ███╗',
  '╚════██║██║╚██╗██║██╔══██║██║   ██║',
  '███████║██║ ╚████║██║  ██║╚██████╔╝',
  '╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝ ',
]

// ─────────────────────────────────────────────────────────────────── treatments

const GRAD = ['#FF7A00', '#FF5C2E', '#FF3D6E', '#FF2D9A', '#E23AD0', '#B84AF0'].map(hex)
const gradAt = t => {
  const p = Math.max(0, Math.min(0.999, t)) * (GRAD.length - 1)
  const i = Math.floor(p)
  return mix(GRAD[i], GRAD[i + 1] ?? GRAD[i], p - i)
}

// 1 — AURORA: warm gradient blocks with a shimmer sweep (evolves today's look)
function aurora(f, {cols}) {
  const lines = []
  const sweep = ((f * 0.9) % 60) - 10
  for (let r = 0; r < BLOCK.length; r++) {
    let line = ''
    const chars = [...BLOCK[r]]
    chars.forEach((ch, c) => {
      if (ch === ' ') return (line += ' ')
      const d = Math.abs(c - (BLOCK.length - 1 - r) * 2 - sweep)
      const lit = d < 3
      const [R, G, B] = gradAt(c / chars.length)
      line += lit ? fg(...mix([R, G, B], [255, 255, 255], 0.55)) + ch : fg(R, G, B) + ch
    })
    lines.push(pad(line + RESET, cols))
  }
  lines.push('')
  lines.push(pad(fgHex('#8A8F98') + 'snag any video. paste. snag. done.' + RESET, cols))
  return lines
}

// 2 — PIXEL: braille dots, twice the resolution, technical and precise
function pixel(f, {cols}) {
  const grid = scale(wordPixels('snag', 1), 3, 2)
  const rows = brailleRender(grid)
  const lines = rows.map((row, i) => {
    let line = ''
    ;[...row].forEach((ch, c) => {
      const [R, G, B] = gradAt(c / row.length)
      line += fg(R, G, B) + ch
    })
    return pad(line + RESET, cols)
  })
  lines.push('')
  const bar = '─'.repeat(28)
  lines.push(pad(fgHex('#2E3238') + bar + RESET, cols))
  lines.push(pad(fgHex('#6E7681') + 'terminal video downloader' + RESET, cols))
  return lines
}

// 3 — NEON: hollow outline + bloom, cyan/magenta, night-city energy
function neon(f, {cols}) {
  const pulse = 0.55 + 0.45 * Math.sin(f / 9)
  const cyan = [0, 229, 255]
  const mag = [255, 45, 154]
  const grid = scale(wordPixels('snag', 2), 2, 1)
  const lines = []
  // bloom above
  lines.push(pad(fg(...mix([12, 14, 20], cyan, pulse * 0.25)) + '▁'.repeat(38) + RESET, cols))
  grid.forEach((row, y) => {
    let line = ''
    row.forEach((on, x) => {
      if (!on) return (line += ' ')
      const t = x / row.length
      const [R, G, B] = mix(cyan, mag, t)
      line += fg(...mix([R, G, B], [255, 255, 255], pulse * 0.35)) + '█'
    })
    lines.push(pad(line + RESET, cols))
  })
  lines.push(pad(fg(...mix([12, 14, 20], mag, pulse * 0.25)) + '▔'.repeat(38) + RESET, cols))
  lines.push('')
  lines.push(pad(fg(...mix(cyan, [120, 130, 150], 0.5)) + '▸ paste a link' + RESET, cols))
  return lines
}

// 4 — PAPER: editorial restraint. tiny wordmark, one rule, lots of air
function paper(f, {cols}) {
  const caret = f % 20 < 10 ? '▏' : ' '
  return [
    '',
    pad(fgHex('#E6E1D8') + '\x1b[1msnag\x1b[22m' + RESET, cols),
    '',
    pad(fgHex('#3A3733') + '─────────────────────────────────────' + RESET, cols),
    '',
    pad(fgHex('#8C857A') + 'any video, from the command line' + RESET, cols),
    '',
    '',
    pad(fgHex('#4A4640') + 'link ' + fgHex('#C86A3A') + caret + RESET, cols),
  ]
}

// 5 — CRT: amber phosphor, scanlines, a touch of jitter
function crt(f, {cols}) {
  const amber = [255, 176, 59]
  const jitter = Math.sin(f / 3) > 0.93 ? 1 : 0
  const lines = []
  BLOCK.forEach((row, i) => {
    const dim = i % 2 === 1 ? 0.45 : 1 // scanline
    const [R, G, B] = mix([20, 12, 4], amber, dim)
    lines.push(pad(' '.repeat(jitter) + fg(R, G, B) + row + RESET, cols))
  })
  lines.push('')
  lines.push(pad(fg(...mix([20, 12, 4], amber, 0.5)) + 'READY.' + RESET, cols))
  const bar = f % 24 < 12 ? '█' : ' '
  lines.push(pad(fg(...amber) + '> ' + bar + RESET, cols))
  return lines
}

// 6 — FLUX: a living plasma field the logo is knocked out of
function flux(f, {cols}) {
  const grid = scale(wordPixels('snag', 2), 2, 1)
  const w = 46
  const lines = []
  for (let y = 0; y < grid.length + 2; y++) {
    let line = ''
    for (let x = 0; x < w; x++) {
      const inLogo = grid[y - 1]?.[x - Math.floor((w - grid[0].length) / 2)]
      if (inLogo) {
        line += fgHex('#0D0D0D') + bg(...gradAt((x / w + f / 90) % 1)) + ' ' + RESET
      } else {
        const v =
          Math.sin(x / 5 + f / 14) * Math.sin(y / 3 - f / 19) * 0.5 + 0.5
        const c = mix([16, 16, 22], gradAt((v + f / 200) % 1), v * 0.30)
        line += fg(...c) + '·' + RESET
      }
    }
    lines.push(pad(line, cols))
  }
  lines.push('')
  lines.push(pad(fgHex('#7A7F88') + 'paste a link to begin' + RESET, cols))
  return lines
}

const DESIGNS = [
  ['AURORA', 'gradient blocks + shimmer sweep', aurora],
  ['PIXEL', 'braille dots — 2×4 subpixels per cell', pixel],
  ['NEON', 'hollow glow, cyan→magenta', neon],
  ['PAPER', 'editorial restraint, maximum air', paper],
  ['CRT', 'amber phosphor + scanlines', crt],
  ['FLUX', 'living plasma field, logo knocked out', flux],
]

// --all prints every treatment once, stacked, and exits (handy for previews)
if (process.argv.includes('--all')) {
  const dim = {cols: process.stdout.columns || 74, rows: 24}
  for (const [name, blurb, render] of DESIGNS) {
    out('\n' + pad(fgHex('#E6E1D8') + name + fgHex('#5A6068') + '  ' + blurb + RESET, dim.cols) + '\n\n')
    out(render(6, dim).join('\n') + '\n')
  }
  out('\n')
  process.exit(0)
}

let idx = 0
let frame = 0

function draw() {
  const dim = size()
  const [name, blurb, render] = DESIGNS[idx]
  const body = render(frame, dim)
  const topPad = Math.max(1, Math.floor((dim.rows - body.length - 6) / 2))

  let screen = HOME
  screen += '\n'.repeat(topPad)
  screen += body.map(l => l + '\x1b[K').join('\n')
  screen += '\n\n\n'
  screen += pad(
    fgHex('#5A6068') + `${idx + 1}/${DESIGNS.length}  ` + fgHex('#E6E1D8') + name +
      fgHex('#5A6068') + `  ·  ${blurb}` + RESET,
    dim.cols,
  ) + '\x1b[K\n'
  screen += pad(fgHex('#3E444C') + '← →  switch   ·   q  quit' + RESET, dim.cols) + '\x1b[K'
  screen += '\x1b[J'
  out(screen)
}

out(ALT_ON + CLEAR)
draw()

const timer = setInterval(() => {
  frame++
  draw()
}, 60)

process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdin.on('data', buf => {
  const k = buf.toString()
  if (k === 'q' || k === '\x03') {
    clearInterval(timer)
    out(ALT_OFF)
    process.exit(0)
  }
  if (k === '\x1b[C' || k === ' ') {
    idx = (idx + 1) % DESIGNS.length
    frame = 0
  }
  if (k === '\x1b[D') {
    idx = (idx - 1 + DESIGNS.length) % DESIGNS.length
    frame = 0
  }
})
process.on('exit', () => out(ALT_OFF))
