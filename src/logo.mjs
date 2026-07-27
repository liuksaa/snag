// logo.mjs — the AURORA wordmark: gradient block letters with a shimmer that
// leans as it climbs, so the light reads as travelling across a surface.

import {RESET, aurora, blend, centre, ink, rgb, SHADE} from './paint.mjs'

// Drawn from a solid 5x7 face rather than a figlet "shadow" font: those spell
// their drop shadow with ╗╝║═, which at terminal contrast reads as stray lines
// around the letters instead of depth. Solid blocks only.
const FACE = {
  s: ['01110', '10001', '10000', '01110', '00001', '10001', '01110'],
  n: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  a: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  g: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
}
const WIDE = 2 // cells per pixel — terminal cells are tall, so 2 reads square
const SPACE = 1 // pixel columns between letters

const ART = (() => {
  const rows = []
  for (let y = 0; y < 7; y++) {
    let line = ''
    for (const letter of 'snag') {
      for (const bit of FACE[letter][y]) line += (bit === '1' ? '█' : ' ').repeat(WIDE)
      line += ' '.repeat(SPACE * WIDE)
    }
    rows.push(line.slice(0, -SPACE * WIDE)) // drop the trailing letter gap
  }
  return rows
})()

const ROWS = ART.length
const COLS = ART[0].length

const LEAN = 2 // columns of lean per row — the beam slants like /
const HALF = 2.6 // beam half-width, in columns
const PERIOD = 132 // frames between sweeps
const TRAVEL = 46 // frames the sweep takes to cross

const ease = t => 1 - (1 - t) ** 3

/**
 * @param {number} frame
 * @param {number} cols terminal width, for centring
 * @param {boolean} animate false renders the resting state (non-TTY, tests)
 */
export function logo(frame, cols, animate = true) {
  const phase = animate ? frame % PERIOD : PERIOD - 1
  const sweeping = phase < TRAVEL
  // beam position runs off-screen at both ends so it enters and exits cleanly
  const beam = sweeping ? -LEAN * ROWS - HALF + ease(phase / TRAVEL) * (COLS + LEAN * ROWS + HALF * 2) : null

  return ART.map((row, y) => {
    let line = ''
    let held = null // current colour, so we emit one escape per run of cells
    ;[...row].forEach((ch, x) => {
      if (ch === ' ') {
        line += ' '
        held = null
        return
      }
      let colour = aurora(x / COLS)
      if (beam !== null) {
        const d = Math.abs(x - (ROWS - 1 - y) * LEAN - beam)
        if (d < HALF) colour = blend(colour, [255, 255, 255], (1 - d / HALF) * 0.6)
      }
      const key = colour.join(',')
      if (key !== held) {
        line += rgb(...colour)
        held = key
      }
      line += ch
    })
    return centre(line + RESET, cols)
  })
}

// Sites named here must actually work — yt-dlp has no Threads extractor, so
// listing it (as the tool this grew out of did) promised something it cannot do.
export const tagline = cols => [
  centre(ink(SHADE.text) + 'snag any video. paste. snag. done.' + RESET, cols),
  centre(ink(SHADE.faint) + 'youtube · instagram · x · tiktok · reddit · +1700 more' + RESET, cols),
]
