// UserPromptSubmit hook: turns the prompt you just sent into steps through the
// grass, and hands them to the turn that is starting.
//
// It does not roll them. A prompt long enough to walk the full cap turned something
// up more often than not, and it did it in the same instant the key went down —
// before Claude had done anything, with the walk it supposedly came from still
// ahead of it. So the steps are recorded here and spent by on-activity.mjs once the
// session is visibly working, which is also when the grass on the home screen is
// actually moving.
//
// Three hard rules, in order of importance:
//
//   1. Never write to stdout. Whatever a UserPromptSubmit hook prints on stdout
//      is injected into the model's context. One stray line would cost tokens on
//      every single prompt and tell Claude about a Pokemon it has no business
//      knowing about.
//   2. Never exit non-zero. Exit code 2 blocks the user's prompt outright, and
//      any failure here is a game bug, never a reason to stop them working.
//   3. Never hang. The prompt does not reach Claude until this process returns.
//      Not rolling here helps: the encounter table is built from the whole Pokedex,
//      and that read is now off the path between you and an answer.
//
// Errors go to ~/.claudemon/claudemon.log, because a hook has no other way to
// report anything without being seen.

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

    // If Claude Code ever stops closing stdin, we still return in time.
    const timer = setTimeout(finish, STDIN_TIMEOUT_MS)

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      buffer += chunk
    })
    process.stdin.on('end', finish)
    process.stdin.on('error', finish)
  })
}

/**
 * Points the launchers at this copy, which is the newest one. See src/shim.mjs.
 *
 * Here rather than anywhere else because a hook is the only part of claudemon that
 * Claude Code runs from the copy it just installed, so it is the only part that can
 * finish an upgrade somebody did through `claude plugin update`. Of the four hooks
 * this is the least frequent, and it reads two small files and almost always finds
 * nothing to do.
 *
 * Failing is not worth a word to anyone: a launcher left alone goes on starting the
 * release it always did, which is what it was doing a moment ago anyway.
 */
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

  // Before the early returns below: an upgrade has to be finished whether or not
  // anything is about to walk out of the grass.
  catchUpLaunchers()

  if (!raw.trim()) return

  const payload = JSON.parse(raw)
  // The field is `prompt`. It is worth being generous about it anyway: getting
  // this wrong is silent, and a hook that quietly does nothing on every prompt
  // looks exactly like a game where Pokemon simply never appear.
  const prompt =
    typeof payload.prompt === 'string'
      ? payload.prompt
      : typeof payload.user_prompt === 'string'
        ? payload.user_prompt
        : ''

  // The session file is the only place the steps can wait, so a payload without a
  // session is a prompt that walks nowhere. It has never been seen in the wild;
  // losing a walk over it is the right way round either way.
  if (!payload.session_id) return

  // An empty prompt still starts a turn — the companion should show that Claude is
  // busy — but it buys no walk.
  const steps = prompt.trim() === '' ? 0 : stepsFromPrompt(prompt.length, loadConfig())

  beginTurn(payload.session_id, payload.cwd, { pendingSteps: steps })
}

try {
  await main()
} catch (error) {
  logError('on-prompt', error)
}

// Explicit and unconditional: whatever happened above, the prompt goes through.
process.exit(0)
