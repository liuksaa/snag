#!/usr/bin/env node
// keys.mjs — shows what your terminal actually sends for each key you press.
// Useful when a shortcut "does nothing": some terminals swallow keys before an
// app ever sees them. Press keys, then ^c to stop.

const NAMES = {
  '\x0c': 'Ctrl+L',
  '\x14': 'Ctrl+T',
  '\r': 'Enter',
  '\x1b': 'Escape',
  '\x7f': 'Backspace',
  '\t': 'Tab',
  '\x1b[A': 'Up',
  '\x1b[B': 'Down',
  '\x1b[C': 'Right',
  '\x1b[D': 'Left',
}

const codes = s => [...s].map(c => '0x' + c.codePointAt(0).toString(16).padStart(2, '0')).join(' ')

console.log('Press any key and I will show what arrived. Ctrl+C to stop.\n')
console.log('Try these in particular:  Ctrl+L   Ctrl+T   1   Enter\n')

process.stdin.setRawMode(true)
process.stdin.resume()
process.stdin.setEncoding('utf8')

process.stdin.on('data', key => {
  if (key === '\x03') {
    console.log('\nDone.')
    process.stdin.setRawMode(false)
    process.exit(0)
  }
  const named = NAMES[key]
  const printable = key >= ' ' && key <= '~' ? `"${key}"` : ''
  console.log(`  received: ${codes(key).padEnd(20)} ${named ?? printable ?? ''}`)
})
