// clipboard.mjs — read whatever the user last copied, so a paste is one keypress
// less. Best effort by design: a missing helper just means an empty field.

import {execFile} from 'node:child_process'

const HELPERS = {
  darwin: ['pbpaste', []],
  win32: ['powershell', ['-NoProfile', '-Command', 'Get-Clipboard']],
  linux: ['wl-paste', ['--no-newline']],
}

export function readClipboard() {
  const helper = HELPERS[process.platform]
  if (!helper) return Promise.resolve('')
  const [cmd, args] = helper

  return new Promise(resolve => {
    execFile(cmd, args, {timeout: 2000}, (err, stdout) => {
      if (err) {
        // linux without wayland: try the X11 tool before giving up
        if (process.platform === 'linux') {
          return execFile('xclip', ['-o', '-selection', 'clipboard'], {timeout: 2000}, (e, out) =>
            resolve(e ? '' : out.trim()),
          )
        }
        return resolve('')
      }
      resolve(stdout.trim())
    })
  })
}
