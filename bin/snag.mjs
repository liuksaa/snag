#!/usr/bin/env node
// snag — grab a video from the command line.

import {start} from '../src/main.mjs'

const argv = process.argv.slice(2)

if (argv.includes('-h') || argv.includes('--help')) {
  console.log(`snag — snag any video. paste. snag. done.

  snag                 open snag (fills in a link you have copied)
  snag <url>           go straight to the format picker
  snag --version       print the version

Files are saved to ~/Downloads.

The picker labels every option with the codec you will actually get:
  ★ plays anywhere   H.264/H.265 — opens in QuickTime, Preview, Photos
  VLC                VP9/AV1 — sharper, but needs VLC on a Mac

Sites that need a login (Instagram, private posts) work automatically: snag
borrows cookies from the browser you use most. To choose one yourself:

  SNAG_BROWSER=brave snag        (also chrome, firefox, edge, safari)

snag follows your system language. Press ^l to change it while running, or:

  SNAG_LANG=es snag              en de es fr hi id ja pt ru tr zh
`)
  process.exit(0)
}

if (argv.includes('--version') || argv.includes('-v')) {
  const {default: pkg} = await import('../package.json', {with: {type: 'json'}})
  console.log(pkg.version)
  process.exit(0)
}

if (!process.stdout.isTTY) {
  console.error('snag needs an interactive terminal.')
  process.exit(1)
}

const url = argv.find(a => !a.startsWith('-'))
await start({url})
