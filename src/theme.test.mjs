import test from 'node:test'
import assert from 'node:assert/strict'
import {SHADE, THEMES, currentTheme, ink, nextTheme, setTheme} from './paint.mjs'

test('offers auto, light and dark, starting from auto', () => {
  assert.deepEqual(THEMES, ['auto', 'light', 'dark'])
  setTheme('auto')
  assert.equal(currentTheme(), 'auto')
})

test('each theme actually repaints the shared palette', () => {
  setTheme('dark')
  const dark = {...SHADE}
  setTheme('light')
  assert.notDeepEqual({...SHADE}, dark, 'light must differ from dark')
  // light text has to be dark ink, or it vanishes on a white terminal
  assert.ok(SHADE.text.startsWith('#'))
  assert.ok(Number.parseInt(SHADE.text.slice(1), 16) < 0x808080, 'light theme needs dark text')
  setTheme('auto')
})

test('auto borrows the terminal colours instead of guessing', () => {
  setTheme('auto')
  assert.equal(SHADE.text, '', 'no colour set means the terminal decides')
  assert.equal(ink(SHADE.text), '', 'and nothing is emitted')
  assert.ok(SHADE.faint.startsWith('\x1b'), 'dimmed text uses a plain ANSI code, which any theme handles')
})

test('cycles through every theme and back', () => {
  setTheme('auto')
  const seen = [currentTheme(), nextTheme(), nextTheme(), nextTheme()]
  assert.deepEqual(seen, ['auto', 'light', 'dark', 'auto'])
})

test('ignores a theme it does not have', () => {
  setTheme('dark')
  setTheme('neon')
  assert.equal(currentTheme(), 'dark')
  setTheme('auto')
})
