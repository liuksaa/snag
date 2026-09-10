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
import {adviseBeforeTrying, explain, looksLikeUrl, siteName} from './core/links.mjs'
import {downloadGallery, haveGallery, probeGallery} from './core/gallery.mjs'
import {loadRecent, remember} from './core/recent.mjs'
import {LANGUAGES, LANGUAGE_NAMES, detectLanguage, language, setLanguage, t} from './i18n.mjs'
import {loadSettings, saveSetting} from './core/settings.mjs'
import {currentTheme, nextTheme, setTheme} from './paint.mjs'
import {replayLogo} from './logo.mjs'
import {readClipboard} from './core/clipboard.mjs'

const SAVE_TO = path.join(os.homedir(), 'Downloads')

// yt-dlp's way of saying "there is a post here, it just isn't video"
const NO_VIDEO = /no video formats found|no video could be found|unsupported url/i

const hintsFor = at =>
  ({
    home: [['↵', t('snag')], ['^C', t('quit')]],
    working: [['esc', t('cancel')], ['^C', t('quit')]],
    picker: [['↑↓', t('choose')], ['↵', t('snag')], ['esc', t('back')]],
    downloading: [['esc', t('cancel')]],
    finished: [['↵', t('another')], ['^C', t('quit')]],
    failed: [['↵', t('tryAgain')], ['^C', t('quit')]],
    languages: [['↑↓', t('choose')], ['↵', t('snag')], ['esc', t('back')]],
  })[at] ?? []

/** @param {{url?: string}} [opts] */
export async function start({url: initialUrl} = {}) {
  const screen = new Screen()
  const saved = loadSettings()
  setLanguage(detectLanguage(process.env, saved.language))
  setTheme(saved.theme ?? 'auto')

  const state = {
    at: 'home',
    input: '',
    url: '',
    notice: '',
    status: '',
    recent: loadRecent(),
    /** @type {import('./types.mjs').Choice[]} */
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
    options: LANGUAGES.map(code => ({code, name: LANGUAGE_NAMES[code]})),
    cameFrom: 'home',
    suggested: false,
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
      suggested: false,
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
    Object.assign(state, {url, site: siteName(url), status: t('lookingUp')})
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
          state.status = t('usingLogin', {browser: candidate})
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
      // "no video formats" is not a failure, it is a different kind of post:
      // an image carousel. yt-dlp cannot fetch those, gallery-dl can.
      if (NO_VIDEO.test(err?.message ?? '') && (await haveGallery())) {
        state.status = t('lookingForImages')
        screen.draw()

        // The images need the same login the video did. `browser` is only set
        // when a probe SUCCEEDED with cookies, and this path is reached after
        // they all failed — so it is usually still empty here, and asking
        // gallery-dl without cookies just gets refused. Walk the browsers the
        // same way the video path does.
        const candidates = browser ? [browser] : await browsersToTry()
        for (const candidate of candidates) {
          if (controller.signal.aborted) return
          try {
            const shots = await probeGallery(url, {browser: candidate, signal: controller.signal})
            if (controller.signal.aborted) return
            if (shots.length) {
              browser = candidate // the download reuses whichever one worked
              state.menu = [{kind: 'images', count: shots.length, suggested: true}]
              state.cursor = 0
              return go('picker')
            }
          } catch {
            // try the next browser; if none work, the original video error stands
          }
        }
      }
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

    if (choice.kind === 'images') {
      try {
        Object.assign(state, {parts: choice.count, total: 0})
        // a carousel gets its own folder, so five images do not scatter
        // themselves across Downloads
        const slug = (state.url.match(/\/(?:p|reel|tv)\/([^/?#]+)/)?.[1] ?? 'post').slice(0, 40)
        const into = path.join(SAVE_TO, `instagram-${slug}`)
        await downloadGallery(state.url, {
          outDir: into,
          browser,
          signal: controller.signal,
          onFile: (_path, n) => {
            Object.assign(state, {part: n - 1, done: n, total: choice.count})
            screen.draw()
          },
        })
        state.file = into
        state.recent = remember(state.url)
        celebrate()
        return go('finished')
      } catch (err) {
        if (controller.signal.aborted) return
        state.error = err?.message ?? String(err)
        return go('failed')
      }
    }

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

    let ffmpeg
    try {
      // one-time on a machine without ffmpeg; the status keeps it from looking stuck
      ffmpeg = await findFfmpeg(note => {
        state.stage = note
        screen.draw()
      }, controller.signal)
      state.stage = ''
    } catch (err) {
      if (controller.signal.aborted) return
      state.error = err?.message ?? String(err)
      return go('failed')
    }

    const base = {ytdlp, url: state.url, choice, outDir: SAVE_TO, browser, ffmpeg}

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
      ['-e', `display notification "${SAVE_TO.replace(/"/g, '')}" with title "snag" subtitle "✓ ${t('snagged')}"`],
      () => {},
    )
  }

  function submit(text) {
    const url = text.trim()
    if (!url) return
    if (!looksLikeUrl(url)) return home(t('notALink'))
    const advice = adviseBeforeTrying(url)
    if (advice) {
      state.input = ''
      state.notice = advice
      return screen.draw()
    }
    void inspect(url)
  }

  const onKey = key => {
    if (key === '\x14') {
      // ^t — auto, light, dark
      saveSetting('theme', nextTheme())
      replayLogo(screen.frame)
      return
    }
    if (key === '\x0c' && state.at !== 'languages') {
      // ^l opens the language list rather than cycling blindly through eleven
      state.cameFrom = state.at
      state.cursor = Math.max(0, state.options.findIndex(o => o.code === language()))
      return go('languages')
    }

    if (state.at === 'languages') {
      const last = state.options.length - 1
      if (key === KEY.up) state.cursor = state.cursor === 0 ? last : state.cursor - 1
      if (key === KEY.down) state.cursor = state.cursor === last ? 0 : state.cursor + 1
      if (key === KEY.left) state.cursor = Math.max(0, state.cursor - 1)
      if (key === KEY.right) state.cursor = Math.min(last, state.cursor + 1)
      if (key === KEY.enter) {
        // remembered, so it is still your language next time you open snag
        setLanguage(state.options[state.cursor].code)
        saveSetting('language', language())
        replayLogo(screen.frame)
        state.cursor = 0
        return go(state.cameFrom === 'languages' ? 'home' : state.cameFrom)
      }
      if (key === KEY.escape) {
        state.cursor = 0
        return go(state.cameFrom === 'languages' ? 'home' : state.cameFrom)
      }
      return
    }
    if (key === KEY.escape) {
      if (state.at === 'working' || state.at === 'downloading') return home()
      if (state.at !== 'home') return home()
      return
    }

    if (state.at === 'home') {
      if (key === KEY.enter) return submit(state.input)
      if (key === KEY.backspace) {
        state.input = [...state.input].slice(0, -1).join('')
        state.suggested = false
        state.notice = ''
        return
      }
      if (key === KEY.ctrlU) {
        state.input = ''
        return
      }
      // a bare number picks a recent link. This must also work when the field
      // holds an unmodified clipboard suggestion, or the list says "press its
      // number" while the number just types itself into the box.
      if ((!state.input || state.suggested) && /^[1-9]$/.test(key)) {
        const pick = state.recent[Number(key) - 1]
        if (pick) return submit(pick)
        return
      }
      if (key >= ' ' && !key.startsWith('\x1b')) {
        state.input += key
        state.suggested = false
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
    return [...body, '', '', hints([...hintsFor(state.at), ['^L', LANGUAGE_NAMES[language()]], ['^T', currentTheme()]], size.cols)]
  }, onKey)

  // launching with a url, or with one already on the clipboard, skips the typing
  if (initialUrl) submit(initialUrl)
  else {
    const clip = await readClipboard()
    if (clip && looksLikeUrl(clip)) {
      state.input = clip
      state.suggested = true // untouched, so number keys still reach the recent list
      screen.draw()
    }
  }
}
