// links.mjs — reading a pasted url: which site it is, whether it points at one
// video, and how to say so when it doesn't.

const SITES = [
  [['youtube.com', 'youtu.be', 'music.youtube.com'], 'YouTube'],
  [['instagram.com'], 'Instagram'],
  [['x.com', 'twitter.com'], 'X'],
  [['tiktok.com'], 'TikTok'],
  [['threads.net', 'threads.com'], 'Threads'],
  [['facebook.com', 'fb.watch'], 'Facebook'],
  [['vimeo.com'], 'Vimeo'],
  [['twitch.tv'], 'Twitch'],
  [['reddit.com'], 'Reddit'],
]

const parse = url => {
  try {
    return new URL(url.trim())
  } catch {
    return null
  }
}

export function looksLikeUrl(input) {
  const u = parse(input)
  return Boolean(u) && (u.protocol === 'http:' || u.protocol === 'https:')
}

export function siteName(url) {
  const u = parse(url)
  if (!u) return ''
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  for (const [hosts, name] of SITES) {
    if (hosts.some(h => host === h || host.endsWith(`.${h}`))) return name
  }
  return host
}

// Instagram serves one reel under BOTH /reel/<id> and /<username>/reel/<id>, so
// a video marker counts wherever it appears in the path.
const IG_VIDEO = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'share'])

/**
 * If the url is a profile/channel rather than a single video, return advice.
 * Otherwise undefined.
 */
export function profileAdvice(url) {
  const u = parse(url)
  if (!u) return undefined
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const parts = u.pathname.split('/').filter(Boolean)
  const first = parts[0]?.toLowerCase()
  if (!first) return undefined
  const holds = name => parts.some(p => p.toLowerCase() === name)

  const is = h => host === h || host.endsWith(`.${h}`)

  if (is('instagram.com') && !parts.some(p => IG_VIDEO.has(p.toLowerCase())))
    return 'That is an Instagram profile, not a video. Open the reel or post you want, tap Share → Copy link, and paste that.'

  if (is('tiktok.com') && first.startsWith('@') && !holds('video'))
    return 'That is a TikTok profile, not a video. Open the video itself and copy its link.'

  if (is('youtube.com') && (first.startsWith('@') || ['channel', 'c', 'user'].includes(first)))
    return 'That is a YouTube channel, not a video. Open a video and paste its link.'

  if ((is('x.com') || is('twitter.com')) && parts.length === 1)
    return 'That is an X profile, not a post. Open the post with the video and copy its link.'

  return undefined
}

// yt-dlp's opaque "I could not find a video here" family
const CANNOT_EXTRACT = /unable to extract|unsupported url|no video|did not get any data/i

/** Replace an unhelpful extractor error with advice, when we have better. */
export function explain(url, message) {
  if (CANNOT_EXTRACT.test(message)) return profileAdvice(url) ?? message
  return message
}
