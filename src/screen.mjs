// screen.mjs — owns the terminal: alternate buffer, raw input, and the redraw
// loop. Views stay pure (state in, array-of-lines out); this is the only place
// that talks to stdout.

import {RESET, SHADE, inkBg, width} from './paint.mjs'

const out = s => process.stdout.write(s)

export const KEY = {
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  enter: '\r',
  escape: '\x1b',
  backspace: '\x7f',
  ctrlC: '\x03',
  ctrlU: '\x15',
  tab: '\t',
}

export class Screen {
  #timer
  /** @type {(key: string) => void} */
  #onKey = () => {}
  /** @type {(frame: number, size: import('./types.mjs').Size) => string[]} */
  #render = () => []
  #frame = 0
  #closed = false

  get size() {
    return {
      cols: Math.max(40, process.stdout.columns || 80),
      rows: Math.max(12, process.stdout.rows || 24),
    }
  }

  get frame() {
    return this.#frame
  }

  /** Take over the terminal. `render(frame, size)` returns lines to draw. */
  open(render, onKey) {
    this.#render = render
    this.#onKey = onKey
    out('\x1b[?1049h\x1b[?25l') // alternate buffer, hide cursor
    process.stdin.setRawMode?.(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', raw => {
      const k = String(raw)
      if (k === KEY.ctrlC) return this.close(0)
      this.#onKey(k)
      this.draw()
    })
    process.stdout.on('resize', () => this.draw())
    process.on('exit', () => this.#restore())
    this.draw()
    // a slow tick is enough for a shimmer; views that need more ask for it
    this.#timer = setInterval(() => {
      this.#frame++
      this.draw()
    }, 70)
  }

  draw() {
    if (this.#closed) return
    const size = this.size
    const lines = this.#render(this.#frame, size)
    const top = Math.max(0, Math.floor((size.rows - lines.length) / 2))
    // A theme paints the whole surface, not just the text: the background is set
    // before every erase, because \x1b[K and \x1b[J clear using the colour that
    // is active at the time. The auto theme sets none and keeps the terminal's.
    const page = SHADE.page ? inkBg(SHADE.page) : ''

    // Every row is addressed explicitly and erased from column 1, rather than
    // walking down with newlines. In raw mode a newline is not guaranteed to
    // return the cursor to the left margin, so a row erased from wherever the
    // cursor happened to sit left its left-hand side unpainted — which showed
    // up as stripes down the side of a themed screen.
    //
    // Overwriting in place (rather than clearing the screen first) is what
    // keeps the redraw flicker-free.
    let buf = ''
    for (let row = 0; row < size.rows; row++) {
      const line = lines[row - top] ?? ''
      // views end, and sometimes interrupt, their lines with a full reset,
      // which drops the background along with the colour
      const body = page ? line.replaceAll(RESET, RESET + page) : line

      buf += `\x1b[${row + 1};1H` + page + body
      if (page) {
        // Fill the rest of the row with real spaces rather than an erase.
        // Erasing is meant to use the active background, but not every terminal
        // honours that, which leaves the untouched part of a row showing through
        // in the terminal's own colour — the stripes down a themed screen.
        // Spaces are ordinary characters, so they are painted everywhere.
        buf += ' '.repeat(Math.max(0, size.cols - width(body)))
      } else {
        buf += '\x1b[K'
      }
    }
    buf += RESET
    out(buf)
  }

  #restore() {
    out('\x1b[?25h\x1b[?1049l' + RESET)
  }

  close(code = 0) {
    if (this.#closed) return
    this.#closed = true
    clearInterval(this.#timer)
    process.stdin.setRawMode?.(false)
    this.#restore()
    process.exit(code)
  }
}
