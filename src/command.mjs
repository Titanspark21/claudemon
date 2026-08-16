import {
  WINDOWS_ABSOLUTE_PATH_PATTERN,
  WINDOWS_MISSING_COMMAND_PATTERN,
  WINDOWS_QUOTE_PATTERN,
} from './constants.mjs'

const quoteWindowsToken = (token) => {
  if (!WINDOWS_QUOTE_PATTERN.test(token)) return token

  return `"${token.replace(/"/g, '""')}"`
}

export const windowsCommandLine = (command, args) => {
  return [command, ...args].map(quoteWindowsToken).join(' ')
}

export const commandInvocation = (
  command,
  args,
  platform = process.platform,
) => {
  if (platform !== 'win32') return { command, args, shell: false }
  if (WINDOWS_ABSOLUTE_PATH_PATTERN.test(command))
    return { command, args, shell: false }

  return { command: windowsCommandLine(command, args), args: [], shell: true }
}

export const commandMissing = (error, output) => {
  if (error?.code === 'ENOENT') return true

  return WINDOWS_MISSING_COMMAND_PATTERN.test(output)
}
