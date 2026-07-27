// types.mjs — the shapes that travel between modules, written once here so the
// checker (and your editor) know what they are. Nothing is exported at runtime:
// this file exists purely to be referenced from JSDoc comments elsewhere.

/**
 * @typedef {object} Size
 * @property {number} cols
 * @property {number} rows
 */

/**
 * One format as yt-dlp reports it. Every field is optional because what a site
 * returns varies wildly, which is exactly why the picker has to be defensive.
 * @typedef {object} RawFormat
 * @property {string} [format_id]
 * @property {string} [ext]
 * @property {string} [vcodec]
 * @property {string} [acodec]
 * @property {number} [height]
 * @property {number} [width]
 * @property {number} [abr]
 * @property {number} [tbr]
 * @property {number} [filesize]
 * @property {number} [filesize_approx]
 */

/**
 * @typedef {object} VideoInfo
 * @property {string} [title]
 * @property {string} [uploader]
 * @property {number} [duration]
 * @property {string} [webpage_url]
 * @property {RawFormat[]} [formats]
 */

/**
 * A row in the quality picker: what it says, and the yt-dlp arguments it means.
 * @typedef {object} Choice
 * @property {'video'|'audio'} kind
 * @property {number} resolution  short side in pixels, 0 when unknown
 * @property {string} codec
 * @property {'anywhere'|'vlc'} compatibility
 * @property {number} size  bytes, 0 when the site does not say
 * @property {string} badge  HD / 2K / 4K, or empty
 * @property {boolean} suggested
 * @property {string[]} args
 */

/**
 * Download progress. Only `done` is always known: plenty of sites serve a
 * stream without declaring its length, so the total, speed and estimate can
 * each be missing, and every screen has to read as well without them.
 * @typedef {object} Progress
 * @property {number} done
 * @property {number} [total]
 * @property {number} [speed]
 * @property {number} [eta]
 * @property {number} part
 * @property {number} parts
 */

/**
 * @typedef {object} Report
 * @property {(p: Progress) => void} onProgress
 * @property {(stage: string) => void} onStage
 */

/**
 * Everything a download needs. `cache` reuses the metadata the probe already
 * fetched; `browser` and `ffmpeg` are only set when they are needed.
 * @typedef {object} DownloadRequest
 * @property {string} ytdlp
 * @property {string} url
 * @property {Choice} choice
 * @property {string} outDir
 * @property {string} [cache]
 * @property {string} [browser]
 * @property {string} [ffmpeg]
 */

export {}
