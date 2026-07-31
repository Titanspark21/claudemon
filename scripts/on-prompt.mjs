// UserPromptSubmit hook: turns the prompt you just sent into steps through the
// grass, and puts whatever appears in the encounter slot — if the grass is not
// already occupied, since only one Pokemon is ever out at a time.
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
//
// Errors go to ~/.claudemon/claudemon.log, because a hook has no other way to
// report anything without being seen.

import { beginTurn } from '../src/activity.mjs'
import { encounterTtlMs, loadConfig } from '../src/config.mjs'
import { loadSpeciesTable, rollEncounters, stepsFromPrompt } from '../src/encounter.mjs'
import { logError } from '../src/log.mjs'
import { offerEncounter, readEncounter } from '../src/queue.mjs'
import { makeRng, randomSeed } from '../src/rng.mjs'
import { readStatus } from '../src/status.mjs'

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

/** The companion publishes its lead Pokemon's level here for level scaling. */
function readLeadLevel() {
  const level = readStatus()?.lead?.level
  return typeof level === 'number' ? level : null
}

async function main() {
  const raw = await readStdin()
  if (!raw.trim()) return

  const payload = JSON.parse(raw)
  // The field is `prompt`. It is worth being generous about it anyway: getting
  // this wrong is silent, and a hook that quietly does nothing on every prompt
  // looks exactly like a game where Pokemon simply never appear.
  const prompt = typeof payload.prompt === 'string'
    ? payload.prompt
    : typeof payload.user_prompt === 'string' ? payload.user_prompt : ''

  // A turn starts here whether or not anything jumps out, so the companion can
  // show that Claude is busy.
  if (payload.session_id) beginTurn(payload.session_id, payload.cwd)

  if (prompt.trim() === '') return

  const config = loadConfig()
  const ttlMs = encounterTtlMs(config)

  // Something is already standing in the grass. Checked before rolling, because
  // this is the common case in a busy session and it costs one small read.
  if (readEncounter(ttlMs)) return

  const leadLevel = readLeadLevel()
  const encounters = rollEncounters({
    steps: stepsFromPrompt(prompt.length, config),
    leadLevel,
    rng: makeRng(randomSeed()),
    config,
    species: loadSpeciesTable(leadLevel ?? 5),
  })

  // A longer prompt still walks further — more steps is more chances of meeting
  // anything at all — but the first thing you meet is the only thing you meet.
  const [encounter] = encounters
  if (!encounter) return

  offerEncounter({ ...encounter, session: payload.session_id ?? null }, ttlMs)
}

try {
  await main()
} catch (error) {
  logError('on-prompt', error)
}

// Explicit and unconditional: whatever happened above, the prompt goes through.
process.exit(0)
