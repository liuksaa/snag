// main.mjs — the state machine. Owns what screen is up, what keys mean there,
// and the two flows that touch the network (probe, then download).

import os from 'node:os'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {Screen, KEY} from './screen.mjs'
import * as view from './views.mjs'
import {hints} from './views.mjs'
import {download, findFfmpeg, findYtDlp, probe} from './core/engine.mjs'
import {buildMenu} from './core/formats.mjs'
import {browsersToTry, definitelyNeedsLogin, loginAdvice, mightNeedLogin} from './core/access.mjs'
import {explain, looksLikeUrl, profileAdvice, siteName} from './core/links.mjs'
import {loadRecent, remember} from './core/recent.mjs'
import {readClipboard} from './core/clipboard.mjs'

const SAVE_TO = path.join(os.homedir(), 'Downloads')

const HINTS = {
  home: [['↵', 'snag'], ['^c', 'quit']],
  working: [['esc', 'cancel'], ['^c', 'quit']],
  picker: [['↑↓', 'choose'], ['↵', 'snag'], ['esc', 'back']],
  downloading: [['esc', 'cancel']],
  finished: [['↵', 'another'], ['^c', 'quit']],
  failed: [['↵', 'try again'], ['^c', 'quit']],
}

export async function start({url: initialUrl} = {}) {
  const screen = new Screen()

  const state = {
    at: 'home',
    input: '',
    url: '',
    notice: '',
    status: '',
    recent: loadRecent(),
    menu: [],
    cursor: 0,
    title: '',
    site: '',
    duration: 0,
    done: 0,
    total: 0,
    speed: 0,
    eta: 0,
    part: 0,
    parts: 1,
    stage: '',
    file: '',
    error: '',
  }

  let ytdlp = ''
  let cache
  let browser // set once cookies were needed, so the download reuses them
  let abort

  const go = to => {
    state.at = to
    screen.draw()
  }

  const home = (notice = '') => {
    abort?.abort()
    abort = undefined
    Object.assign(state, {
      at: 'home',
      input: '',
      url: '',
      notice,
      menu: [],
      cursor: 0,
      title: '',
      site: '',
      duration: 0,
      done: 0,
      total: 0,
      speed: 0,
      eta: 0,
      part: 0,
      parts: 1,
      stage: '',
      error: '',
      recent: loadRecent(),
    })
    screen.draw()
  }

  /** Look the url up, retrying with browser cookies if it turns out to be walled. */
  async function inspect(url) {
    const controller = new AbortController()
    abort = controller
    Object.assign(state, {url, site: siteName(url), status: 'looking it up…'})
    go('working')

    try {
      ytdlp ||= await findYtDlp(s => {
        state.status = s
        screen.draw()
      }, controller.signal)
      if (controller.signal.aborted) return

      let result
      try {
        result = await probe(ytdlp, url, {signal: controller.signal})
        browser = undefined
      } catch (err) {
        if (controller.signal.aborted) return
        if (!mightNeedLogin(err)) throw err

        const certain = definitelyNeedsLogin(err)
        const options = await browsersToTry()
        if (!options.length) throw new Error(loginAdvice(undefined, certain))

        result = undefined
        for (const candidate of options) {
          state.status = `using your ${candidate} login…`
          screen.draw()
          try {
            result = await probe(ytdlp, url, {signal: controller.signal, browser: candidate})
            browser = candidate
            break
          } catch (retry) {
            if (controller.signal.aborted) return
            if (!mightNeedLogin(retry)) throw retry
          }
        }
        if (!result) throw new Error(loginAdvice(options[0], certain))
      }

      if (controller.signal.aborted) return
      cache = result.cache
      state.title = result.info.title ?? ''
      state.duration = result.info.duration ?? 0
      state.menu = buildMenu(result.info)
      state.cursor = Math.max(0, state.menu.findIndex(m => m.suggested))
      go('picker')
    } catch (err) {
      if (controller.signal.aborted) return
      state.error = explain(url, err?.message ?? String(err))
      go('failed')
    }
  }

  /** Fetch the chosen format, with the same cookie fallback if the media is walled. */
  async function fetchChoice(choice) {
    const controller = new AbortController()
    abort = controller
    Object.assign(state, {done: 0, total: 0, speed: 0, eta: 0, part: 0, parts: 1, stage: ''})
    go('downloading')

    const report = {
      onProgress: p => {
        Object.assign(state, p, {stage: ''})
        screen.draw()
      },
      onStage: s => {
        state.stage = s
        screen.draw()
      },
    }

    const base = {
      ytdlp,
      url: state.url,
      choice,
      outDir: SAVE_TO,
      browser,
      ffmpeg: await findFfmpeg(),
    }

    try {
      let file
      try {
        file = await download({...base, cache}, report, controller.signal)
      } catch (err) {
        if (controller.signal.aborted) throw err
        state.stage = ''
        if (mightNeedLogin(err) && !browser) {
          const certain = definitelyNeedsLogin(err)
          const options = await browsersToTry()
          if (!options.length) throw new Error(loginAdvice(undefined, certain))
          file = undefined
          for (const candidate of options) {
            try {
              file = await download({...base, browser: candidate}, report, controller.signal)
              browser = candidate
              break
            } catch (retry) {
              if (controller.signal.aborted) throw retry
              if (!mightNeedLogin(retry)) throw retry
            }
          }
          if (!file) throw new Error(loginAdvice(options[0], certain))
        } else {
          // cached media urls expire — a fresh extraction usually fixes it
          file = await download(base, report, controller.signal)
        }
      }
      state.file = file
      state.recent = remember(state.url)
      celebrate()
      go('finished')
    } catch (err) {
      if (controller.signal.aborted) return
      state.error = explain(state.url, err?.message ?? String(err))
      go('failed')
    }
  }

  function celebrate() {
    process.stdout.write('\x07')
    if (process.platform !== 'darwin') return
    execFile(
      'osascript',
      ['-e', 'display notification "Saved to Downloads" with title "snag" subtitle "✓ snagged"'],
      () => {},
    )
  }

  function submit(text) {
    const url = text.trim()
    if (!url) return
    if (!looksLikeUrl(url)) return home('That does not look like a link. Paste a full url.')
    const advice = profileAdvice(url)
    if (advice) {
      state.input = ''
      state.notice = advice
      return screen.draw()
    }
    void inspect(url)
  }

  const onKey = key => {
    if (key === KEY.escape) {
      if (state.at === 'working' || state.at === 'downloading') return home()
      if (state.at !== 'home') return home()
      return
    }

    if (state.at === 'home') {
      if (key === KEY.enter) return submit(state.input)
      if (key === KEY.backspace) {
        state.input = [...state.input].slice(0, -1).join('')
        state.notice = ''
        return
      }
      if (key === KEY.ctrlU) {
        state.input = ''
        return
      }
      // a bare number picks a recent link, but only when nothing is typed
      if (!state.input && /^[1-9]$/.test(key)) {
        const pick = state.recent[Number(key) - 1]
        if (pick) return submit(pick)
        return
      }
      if (key >= ' ' && !key.startsWith('\x1b')) {
        state.input += key
        state.notice = ''
        // a pasted url is unambiguous — go straight in
        if (key.length > 8 && looksLikeUrl(state.input)) submit(state.input)
      }
      return
    }

    if (state.at === 'picker') {
      if (key === KEY.up) state.cursor = (state.cursor - 1 + state.menu.length) % state.menu.length
      if (key === KEY.down) state.cursor = (state.cursor + 1) % state.menu.length
      if (key === KEY.enter) void fetchChoice(state.menu[state.cursor])
      return
    }

    if ((state.at === 'finished' || state.at === 'failed') && key === KEY.enter) home()
  }

  screen.open((frame, size) => {
    const body = view[state.at === 'home' ? 'home' : state.at](state, frame, size)
    return [...body, '', '', hints(HINTS[state.at] ?? [], size.cols)]
  }, onKey)

  // launching with a url, or with one already on the clipboard, skips the typing
  if (initialUrl) submit(initialUrl)
  else {
    const clip = await readClipboard()
    if (clip && looksLikeUrl(clip)) {
      state.input = clip
      screen.draw()
    }
  }
}
