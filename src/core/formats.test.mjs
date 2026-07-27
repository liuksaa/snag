import test from 'node:test'
import assert from 'node:assert/strict'
import {buildMenu, codecName, NEEDS_VLC, PLAYS_ANYWHERE, playsAnywhere, shortSide} from './formats.mjs'

const audio = {format_id: 'a', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128, filesize: 1_000_000}
const video = only => buildMenu({formats: only}).filter(e => e.kind === 'video')

test('recommends the sharpest tier that plays everywhere, not the sharpest tier', () => {
  const menu = video([
    audio,
    {vcodec: 'av01.0.12M.08', acodec: 'none', ext: 'mp4', width: 3840, height: 2160},
    {vcodec: 'avc1.640028', acodec: 'none', ext: 'mp4', width: 1920, height: 1080},
  ])
  const uhd = menu.find(e => e.resolution === 2160)
  const hd = menu.find(e => e.resolution === 1080)

  assert.equal(uhd.codec, 'AV1')
  assert.equal(uhd.compatibility, NEEDS_VLC)
  assert.equal(uhd.suggested, false)
  assert.equal(hd.codec, 'H.264')
  assert.equal(hd.compatibility, PLAYS_ANYWHERE)
  assert.equal(hd.suggested, true)
})

test('falls back to the sharpest tier when nothing plays natively', () => {
  const menu = video([
    audio,
    {vcodec: 'vp09.00.40.08', acodec: 'none', ext: 'webm', width: 1920, height: 1080},
    {vcodec: 'vp09.00.31.08', acodec: 'none', ext: 'webm', width: 1280, height: 720},
  ])
  assert.ok(menu.every(e => e.compatibility === NEEDS_VLC))
  assert.equal(menu.find(e => e.suggested).resolution, 1080)
})

test('a portrait reel is labelled by its short side', () => {
  const [entry] = video([audio, {vcodec: 'avc1.4d401f', acodec: 'none', ext: 'mp4', width: 1080, height: 1920}])
  assert.equal(entry.resolution, 1080) // not 1920
  assert.match(entry.args.join(' '), /height=1920/) // but selects the real height
})

test('a progressive stream with an unknown codec counts as the compatible one', () => {
  const [entry] = video([{vcodec: 'unknown', acodec: 'unknown', ext: 'mp4', width: 720, height: 1280, filesize: 2_000_000}])
  assert.equal(entry.codec, 'H.264')
  assert.equal(entry.compatibility, PLAYS_ANYWHERE)
})

// the row's label and its download target must describe one and the same stream
test('the selector targets the stream the row describes', () => {
  const [entry] = video([
    audio,
    {vcodec: 'avc1.4d401f', acodec: 'none', ext: 'mp4', width: 720, height: 1280, tbr: 2000},
    {vcodec: 'vp09.00.31.08', acodec: 'none', ext: 'webm', width: 720, height: 1440, tbr: 3000},
  ])
  assert.equal(entry.codec, 'H.264')
  assert.match(entry.args.join(' '), /height=1280/)
  assert.doesNotMatch(entry.args.join(' '), /height=1440/)
})

test('a video-only tier adds the audio track to its size, a muxed one does not', () => {
  const [dash] = video([audio, {vcodec: 'avc1', acodec: 'none', ext: 'mp4', width: 1280, height: 720, filesize: 5_000_000}])
  assert.equal(dash.size, 6_000_000)
  const [muxed] = video([audio, {vcodec: 'avc1', acodec: 'mp4a', ext: 'mp4', width: 1280, height: 720, filesize: 5_000_000}])
  assert.equal(muxed.size, 5_000_000)
})

test('audio-only is always offered last', () => {
  const menu = buildMenu({formats: [audio, {vcodec: 'avc1', acodec: 'none', width: 1280, height: 720}]})
  assert.equal(menu.at(-1).kind, 'audio')
  assert.deepEqual(menu.at(-1).args, ['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0'])
})

test('copes with a url that exposes no video at all', () => {
  const menu = buildMenu({formats: [audio]})
  assert.equal(menu.length, 2)
  assert.equal(menu[0].resolution, 0)
})

test('names the codecs it can recognise', () => {
  assert.equal(codecName('avc1.640028'), 'H.264')
  assert.equal(codecName('hev1.1.6'), 'H.265')
  assert.equal(codecName('vp09.00.40.08'), 'VP9')
  assert.equal(codecName('av01.0.12M.08'), 'AV1')
  assert.equal(codecName('weird'), '')
})

test('short side wins regardless of orientation', () => {
  assert.equal(shortSide({width: 1920, height: 1080}), 1080)
  assert.equal(shortSide({width: 1080, height: 1920}), 1080)
})

test('a silent video-only stream is not mistaken for a compatible file', () => {
  assert.equal(playsAnywhere({vcodec: 'unknown', acodec: 'none'}), false)
  assert.equal(playsAnywhere({vcodec: 'vp09.00.40.08', acodec: 'none'}), false)
  assert.equal(playsAnywhere({vcodec: 'avc1.4d', acodec: 'none'}), true)
})
