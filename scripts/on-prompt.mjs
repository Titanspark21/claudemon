import { beginTurn } from '../src/activity.mjs'
import { loadConfig } from '../src/config.mjs'
import { stepsFromPrompt } from '../src/encounter.mjs'
import { logError, logNote } from '../src/log.mjs'
import { relinkLaunchers } from '../src/shim.mjs'

const STDIN_TIMEOUT_MS = 2000

function readStdin() {
  return new Promise((resolve) => {
    let buffer = ''
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(buffer)
    }

    const timer = setTimeout(finish, STDIN_TIMEOUT_MS)

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      buffer += chunk
    })
    process.stdin.on('end', finish)
    process.stdin.on('error', finish)
  })
}

function catchUpLaunchers() {
  try {
    for (const path of relinkLaunchers()) {
      logNote('on-prompt', `pointed a launcher at this release: ${path}`)
    }
  } catch (error) {
    logError('on-prompt', error)
  }
}

async function main() {
  const raw = await readStdin()

  catchUpLaunchers()

  if (!raw.trim()) return

  const payload = JSON.parse(raw)
  const prompt =
    typeof payload.prompt === 'string'
      ? payload.prompt
      : typeof payload.user_prompt === 'string'
        ? payload.user_prompt
        : ''

  if (!payload.session_id) return

  const steps =
    prompt.trim() === '' ? 0 : stepsFromPrompt(prompt.length, loadConfig())

  beginTurn(payload.session_id, payload.cwd, { pendingSteps: steps })
}

try {
  await main()
} catch (error) {
  logError('on-prompt', error)
}

process.exit(0)
