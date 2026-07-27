// screen.mjs — owns the terminal: alternate buffer, raw input, and the redraw
// loop. Views stay pure (state in, array-of-lines out); this is the only place
// that talks to stdout.

import {RESET} from './paint.mjs'

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
  #onKey = () => {}
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
    process.stdin.on('data', k => {
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
    // Overwrite in place rather than clearing first, so there is no flicker.
    // Every row we pass over must erase itself: a bare newline moves the cursor
    // without wiping the row, so when a taller screen replaces a shorter one the
    // old rows survive above the new content as stray lines.
    let buf = '\x1b[H'
    buf += '\x1b[K\n'.repeat(top)
    buf += lines.map(l => l + '\x1b[K').join('\n')
    buf += RESET + '\x1b[J'
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
