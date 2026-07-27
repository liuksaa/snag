import test from 'node:test'
import assert from 'node:assert/strict'
import {LANGUAGES, LANGUAGE_NAMES, detectLanguage, setLanguage, t} from './i18n.mjs'
import {charWidth, clip, width} from './paint.mjs'
import * as view from './views.mjs'

test('reads the language from the system, however it is spelled', () => {
  assert.equal(detectLanguage({LANG: 'ja_JP.UTF-8'}), 'ja')
  assert.equal(detectLanguage({LANG: 'pt_BR.UTF-8'}), 'pt')
  assert.equal(detectLanguage({LC_ALL: 'de_DE.UTF-8'}), 'de')
  assert.equal(detectLanguage({LANGUAGE: 'es'}), 'es')
  assert.equal(detectLanguage({SNAG_LANG: 'zh'}), 'zh', 'explicit override wins')
  assert.equal(detectLanguage({SNAG_LANG: 'zh', LANG: 'fr_FR.UTF-8'}), 'zh')
})

test('falls back to English rather than showing nothing', () => {
  assert.equal(detectLanguage({LANG: 'C'}), 'en')
  assert.equal(detectLanguage({LANG: 'xx_YY.UTF-8'}), 'en')
  assert.equal(detectLanguage({}), 'en')
})

test('every language is named in its own script and translates the core screens', () => {
  for (const code of LANGUAGES) {
    assert.ok(LANGUAGE_NAMES[code], `${code} has no display name`)
    setLanguage(code)
    for (const key of ['pasteLink', 'snagged', 'quit', 'playsAnywhere', 'audioOnly']) {
      assert.ok(t(key).length > 0, `${code}.${key} is empty`)
    }
  }
  setLanguage('en')
})

test('fills in placeholders', () => {
  setLanguage('en')
  assert.equal(t('part', {n: 1, total: 2}), 'part 1/2')
  assert.match(t('usingLogin', {browser: 'brave'}), /brave/)
  setLanguage('ja')
  assert.match(t('usingLogin', {browser: 'brave'}), /brave/, 'placeholder survives translation')
  setLanguage('en')
})

// terminals give CJK and emoji two columns; counting characters would centre
// every Japanese or Chinese title half a screen off
test('measures how many columns a string really occupies', () => {
  assert.equal(width('abc'), 3)
  assert.equal(width('日本語'), 6)
  assert.equal(width('中文'), 4)
  assert.equal(charWidth('a'), 1)
  assert.equal(charWidth('日'), 2)
  assert.equal(width('\x1b[31mred\x1b[0m'), 3, 'escape codes take no space')
})

test('clips by columns, so a wide title cannot overflow its line', () => {
  assert.ok(width(clip('日本語のとても長いタイトルです', 10)) <= 10)
  assert.equal(clip('short', 20), 'short')
})

test('the input frame stays aligned in every language', () => {
  const size = {cols: 74, rows: 30}
  for (const code of LANGUAGES) {
    setLanguage(code)
    const rows = view
      .home({input: '', notice: '', recent: []}, 6, size)
      .map(l => l.replace(/\x1b\[[0-9;]*m/g, '').trim())
      .filter(l => /^[╭│╰]/.test(l))
    const widths = rows.map(width)
    assert.equal(widths.length, 3, `${code}: expected three frame rows`)
    assert.ok(
      widths.every(w => w === widths[0]),
      `${code}: frame rows are ${widths.join(',')} columns wide`,
    )
  }
  setLanguage('en')
})

test('a language you pick is remembered, but a one-off override still wins', () => {
  const env = {LANG: 'en_US.UTF-8'}
  assert.equal(detectLanguage(env, undefined), 'en', 'no preference yet: follow the system')
  assert.equal(detectLanguage(env, 'ja'), 'ja', 'a saved choice beats the system locale')
  assert.equal(detectLanguage({...env, SNAG_LANG: 'fr'}, 'ja'), 'fr', 'SNAG_LANG beats both')
  assert.equal(detectLanguage(env, 'xx'), 'en', 'a nonsense saved value is ignored')
})

test('the language grid lines up whatever the scripts', () => {
  const options = LANGUAGES.map(code => ({code, name: LANGUAGE_NAMES[code]}))
  const rows = view
    .languages({options, cursor: 5}, 6, {cols: 74, rows: 34})
    .filter(l => / [a-z]{2}(\x1b|\s|$)/.test(l))
  const starts = rows.map(l => l.replace(/\x1b\[[0-9;]*m/g, '').search(/\S/))
  assert.ok(starts.every(s => s === starts[0]), `rows start at columns ${starts.join(',')}`)
})
