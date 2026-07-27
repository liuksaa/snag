import test from 'node:test'
import assert from 'node:assert/strict'
import {adviseBeforeTrying, explain, looksLikeUrl, profileAdvice, siteName} from './links.mjs'

const CANNOT = 'Unable to extract data; please report this issue'

test('spots a profile or channel where a video was expected', () => {
  for (const url of [
    'https://www.instagram.com/sohanrajkumawat?igsh=cmExdHN6NWRxZXZ5',
    'https://tiktok.com/@someone',
    'https://www.youtube.com/@SomeChannel',
    'https://www.youtube.com/channel/UCabc123',
    'https://x.com/someuser',
  ]) {
    assert.ok(profileAdvice(url), url)
  }
})

test('leaves links that really are one video alone', () => {
  for (const url of [
    'https://www.instagram.com/reel/DbI8K9Bos7e/?igsh=abc',
    'https://www.instagram.com/p/DAbc123/',
    'https://www.tiktok.com/@someone/video/123',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://x.com/someuser/status/123',
  ]) {
    assert.equal(profileAdvice(url), undefined, url)
  }
})

// instagram serves one reel under both /reel/<id> and /<username>/reel/<id>
test('a profile-scoped instagram reel is still a video', () => {
  assert.equal(profileAdvice('https://www.instagram.com/nasa/reel/C1a2b3c4d5e/'), undefined)
  assert.equal(profileAdvice('https://www.instagram.com/nasa/p/C1a2b3c4d5e/'), undefined)
})

test('only rewrites the errors it has better words for', () => {
  assert.match(explain('https://instagram.com/nasa', CANNOT), /Instagram profile/)
  const throttled = 'HTTP Error 429: Too Many Requests'
  assert.equal(explain('https://instagram.com/nasa', throttled), throttled)
  assert.equal(explain('https://youtu.be/abc', CANNOT), CANNOT)
})

test('names the site behind a link', () => {
  assert.equal(siteName('https://youtu.be/abc'), 'YouTube')
  assert.equal(siteName('https://www.instagram.com/reel/x'), 'Instagram')
  assert.equal(siteName('https://example.org/v/1'), 'example.org')
})

test('rejects things that are not links', () => {
  assert.equal(looksLikeUrl('https://youtu.be/abc'), true)
  assert.equal(looksLikeUrl('just some words'), false)
  assert.equal(looksLikeUrl('file:///etc/passwd'), false)
})

test('says plainly that Threads is not supported, before any network call', () => {
  const url = 'https://www.threads.com/@oz.apps/post/Da8acJOiE7c?xmt=AQG0Qu8&source_surface=35'
  const advice = adviseBeforeTrying(url)
  assert.match(advice, /Threads is not supported/)
  assert.match(advice, /Instagram/) // offers the way round it
  assert.equal(adviseBeforeTrying('https://www.threads.net/@a/post/b'), advice)
  // and a real video link still passes straight through
  assert.equal(adviseBeforeTrying('https://youtu.be/dQw4w9WgXcQ'), undefined)
})
