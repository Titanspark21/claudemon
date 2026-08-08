import { spawnSync } from 'node:child_process'
import { CLIPBOARD_COMMANDS } from './constants.mjs'

export const clipboardCommand = (platform) => {
  return CLIPBOARD_COMMANDS[platform] ?? CLIPBOARD_COMMANDS.default
}

export const copyToClipboard = (text, platform = process.platform) => {
  const copier = clipboardCommand(platform)

  try {
    const result = spawnSync(copier.command, copier.args, { input: text })

    return result.status === 0
  } catch {
    return false
  }
}
