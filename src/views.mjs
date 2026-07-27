// views.mjs — each screen as a pure function: state in, lines out. No I/O here,
// which keeps every screen trivially previewable and testable.

import {BOLD, RESET, UNBOLD, centre, clip, clock, ink, inkBg, bytes, padTo, rate, SHADE, aurora, rgb, width} from './paint.mjs'
import {logo, tagline} from './logo.mjs'
import {describe, NEEDS_VLC} from './core/formats.mjs'
import {t} from './i18n.mjs'
import {tidyLink} from './core/recent.mjs'

const BOX = Math.min(64, 60)
const blank = () => ''

const shell = (frame, size, body, animate = true) => [
  ...logo(frame, size.cols, animate),
  blank(),
  ...tagline(size.cols),
  blank(),
  ...body,
]

/**
 * A rounded input frame with the snag button sitting in its right edge.
 * Every row is exactly BOX visible columns, so the three lines stack flush.
 */
function field(text, caret, cols) {
  const inner = BOX - 2 // what sits between the │ walls
  const label = ` ${t('pasteLink')} `
  const button = ` ${t('snag')} `
  // between the walls: leading space + text + caret + gap + button
  const room = inner - 2 - width(button)

  const shown = clip(text || 'https://…', room)
  const gap = Math.max(0, room - width(shown))

  const rule = ink(SHADE.rule)
  const top = rule + '╭' + ink(SHADE.faint) + label + rule + '─'.repeat(Math.max(0, inner - width(label))) + '╮'
  const body =
    rule +
    '│ ' +
    (text ? ink(SHADE.bright) : ink(SHADE.faint)) +
    shown +
    ink(SHADE.bright) +
    caret +
    ' '.repeat(gap) +
    (text ? inkBg('#FF6B00') + ink('#12100E') + BOLD : ink(SHADE.faint)) +
    button +
    RESET +
    rule +
    '│'
  const bottom = rule + '╰' + '─'.repeat(inner) + '╯'

  return [centre(top + RESET, cols), centre(body + RESET, cols), centre(bottom + RESET, cols)]
}

export function home(state, frame, size) {
  const caret = frame % 16 < 8 ? '▏' : ' '
  const body = [...field(state.input, caret, size.cols)]

  if (state.notice) {
    body.push(blank(), centre(ink(SHADE.soft) + state.notice + RESET, size.cols))
  } else if (state.recent.length) {
    body.push(blank(), centre(ink(SHADE.faint) + t('recent') + RESET, size.cols))
    const LINK = 46
    const indent = ' '.repeat(Math.max(0, Math.floor((size.cols - (LINK + 3)) / 2)))
    state.recent.forEach((url, i) => {
      body.push(indent + rgb(...aurora(i / 4)) + (i + 1) + ink(SHADE.faint) + '  ' + clip(tidyLink(url), LINK) + RESET)
    })
  }
  return shell(frame, size, body)
}

export function working(state, frame, size) {
  const spin = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'][frame % 10]
  return shell(frame, size, [
    centre(rgb(...aurora(0.3)) + spin + ' ' + ink(SHADE.text) + state.status + RESET, size.cols),
    blank(),
    centre(ink(SHADE.faint) + clip(tidyLink(state.url), 52) + RESET, size.cols),
  ])
}

export function picker(state, frame, size) {
  const rows = []
  if (state.title) {
    rows.push(centre(ink(SHADE.bright) + clip(state.title, 54) + RESET, size.cols))
    const meta = [state.site, state.duration ? clock(state.duration) : ''].filter(Boolean).join('  ·  ')
    rows.push(centre(ink(SHADE.faint) + meta + RESET, size.cols))
    rows.push(blank())
  }

  // one shared indent for every row, so the list reads as a block and nothing
  // shifts as the cursor moves or labels change length
  const NAME = 12
  const DETAIL = 17
  const rowWidth = 2 + NAME + DETAIL + 16
  const indent = ' '.repeat(Math.max(0, Math.floor((size.cols - rowWidth) / 2)))

  state.menu.forEach((entry, i) => {
    const on = i === state.cursor
    const {left, right} = describe(entry)
    const mark = on ? rgb(...aurora(0.15)) + '❯ ' : '  '
    const name = (on ? ink(SHADE.bright) + BOLD : ink(SHADE.text)) + padTo(left, NAME) + UNBOLD
    const detail = ink(SHADE.faint) + padTo(right, DETAIL)
    const flag =
      entry.compatibility === NEEDS_VLC
        ? ink('#8A6FB0') + t('needsVlc')
        : entry.suggested
          ? rgb(...aurora(0.05)) + '★ ' + t('playsAnywhere')
          : ''
    rows.push(indent + mark + name + detail + flag + RESET)
  })

  return shell(frame, size, rows)
}

export function downloading(state, frame, size) {
  const width = 34
  const pct = state.total ? Math.min(1, state.done / state.total) : 0
  const filled = Math.round(pct * width)

  let bar = ''
  for (let i = 0; i < width; i++) {
    if (i < filled) bar += rgb(...aurora(i / width)) + '█'
    else if (i === filled) bar += ink(SHADE.rule) + '▌'
    else bar += ink(SHADE.rule) + '░'
  }

  const stat = state.total
    ? t('ofSize', {done: bytes(state.done), total: bytes(state.total)})
    : state.done
      ? bytes(state.done)
      : ''
  const parts = state.parts > 1 ? t('part', {n: state.part + 1, total: state.parts}) + '   ' : ''
  const line = [parts + stat, rate(state.speed), state.eta ? t('timeLeft', {time: clock(state.eta)}) : '']
    .filter(Boolean)
    .join('   ')

  // known stages get friendlier words; anything else (a one-time tool fetch)
  // is already human-readable and shown as-is
  const STAGES = {merging: t('merging'), extracting: t('extracting')}
  const label = state.stage ? (STAGES[state.stage] ?? state.stage) : ''

  return shell(frame, size, [
    centre(ink(SHADE.text) + clip(state.title || tidyLink(state.url), 52) + RESET, size.cols),
    blank(),
    centre(bar + RESET + '  ' + rgb(...aurora(0.1)) + `${Math.round(pct * 100)}%`.padStart(4) + RESET, size.cols),
    blank(),
    centre(ink(SHADE.faint) + (label || line) + RESET, size.cols),
  ])
}

export function finished(state, frame, size) {
  return shell(frame, size, [
    centre(ink(SHADE.ok) + BOLD + '✓ ' + t('snagged') + UNBOLD + RESET, size.cols),
    blank(),
    centre(ink(SHADE.text) + clip(state.file.replace(process.env.HOME ?? '', '~'), 56) + RESET, size.cols),
    blank(),
    centre(ink(SHADE.faint) + t('pressForAnother') + RESET, size.cols),
  ])
}

export function failed(state, frame, size) {
  const room = Math.min(58, size.cols - 6)
  return shell(frame, size, [
    centre(ink('#FF6B6B') + '✗' + RESET, size.cols),
    blank(),
    ...wrap(String(state.error), room).map(l => centre(ink(SHADE.text) + l + RESET, size.cols)),
  ])
}

/**
 * Wrap to `room` columns. A url has no spaces to break at, so anything longer
 * than a line is cut mid-token rather than allowed to run off the screen.
 */
function wrap(text, room) {
  const lines = []
  let line = ''
  const flush = () => {
    if (line) lines.push(line)
    line = ''
  }
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (width(word) > room) {
      flush()
      lines.push([...word].slice(0, room).join(''))
      word = [...word].slice(room).join('')
    }
    if (width(line) + width(word) + (line ? 1 : 0) > room) flush()
    line += (line ? ' ' : '') + word
  }
  flush()
  return lines.length ? lines : ['']
}

/**
 * Choosing a language. Each option is written in its own script, because
 * someone looking for their language is looking for the word they know, not
 * its English name.
 */
export function languages(state, frame, size) {
  const COL = 20
  const perRow = Math.max(1, Math.min(3, Math.floor((size.cols - 8) / COL)))
  // one indent for the whole grid, so the columns line up instead of each row
  // centring itself to a different width
  const indent = ' '.repeat(Math.max(0, Math.floor((size.cols - perRow * COL) / 2)))
  const rows = []

  for (let i = 0; i < state.options.length; i += perRow) {
    let line = indent
    state.options.slice(i, i + perRow).forEach((option, j) => {
      const on = i + j === state.cursor
      const mark = on ? rgb(...aurora(0.15)) + '❯ ' : '  '
      const name = on ? ink(SHADE.bright) + BOLD + option.name + UNBOLD : ink(SHADE.text) + option.name
      const cell = `${option.name} ${option.code}`
      line += mark + name + ink(SHADE.faint) + ' ' + option.code + RESET
      line += ' '.repeat(Math.max(1, COL - width(cell) - 2))
    })
    rows.push(line.trimEnd())
  }

  return shell(frame, size, [centre(ink(SHADE.faint) + t('language') + RESET, size.cols), blank(), ...rows])
}

/** The footer hint strip, rendered by main for whatever screen is up. */
export function hints(pairs, cols) {
  const text = pairs
    .map(([key, what]) => ink(SHADE.text) + key + ink(SHADE.faint) + ' ' + what)
    .join(ink(SHADE.rule) + '   ·   ')
  return centre(text + RESET, cols)
}
