// The hook that tells the companion what Claude Code is doing.
//
// One script for every lifecycle event, because the work is the same each time:
// read the event, record the new state of this session, and — while Claude is
// working — count the waiting as steps through the grass.
//
// Registered on PreToolUse, Notification, Stop, SessionStart and SessionEnd. It
// deliberately does not take PostToolUse as well: a tool finishing tells the
// player nothing a running timer does not already say, and it would double the
// number of processes spawned per tool call.
//
// The same three rules as on-prompt.mjs, and one more that matters even more
// here:
//
//   1. Never write to stdout.
//   2. Never exit non-zero. On PreToolUse, exit code 2 *denies the tool call*.
//      A crash in the game must never stop Claude working.
//   3. Never hang. This runs before every tool call, so it is on the critical
//      path of the whole session.
//   4. Do as little as possible. Small files, no scanning, no network.

import { beginTurn, endSession, endTurn, noteTool, noteWaiting, pruneSessions, readActivity } from '../src/activity.mjs'
import { encounterTtlMs, loadConfig } from '../src/config.mjs'
import { loadSpeciesTable, rollEncounters, stepsWhileWorking } from '../src/encounter.mjs'
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
 * Walks this session as far as it is owed: the steps its prompt bought and never
 * took, plus the time it has spent working since it was last paid.
 *
 * The two are one walk rather than two rolls. Otherwise the same moment could turn
 * up a Pokemon twice over, and the cap that stops an essay spawning a swarm would
 * only be capping one half of it.
 *
 * @returns {{lastStepAt: number, pendingSteps: number}|null} the clocks to record,
 *   or null to leave them where they are.
 */
function walkWhileWorking(sessionId, now) {
  const previous = readActivity(sessionId)
  if (previous?.state !== 'working') return null

  const config = loadConfig()
  const ttlMs = encounterTtlMs(config)
  const { steps, taken } = stepsWhileWorking(now - (previous.lastStepAt ?? previous.since ?? now), config)
  const pending = Number.isInteger(previous.pendingSteps) ? Math.max(0, previous.pendingSteps) : 0
  if (steps === 0 && pending === 0) return null

  // Spent, whether or not the walk turns anything up. Everything below this line
  // is the dice, and the dice must not decide whether time passed.
  const walked = { lastStepAt: (previous.lastStepAt ?? previous.since ?? now) + taken, pendingSteps: 0 }

  // The clock still moves when the grass is occupied: that time was spent walking
  // past something you already have the chance to fight, and paying it out again
  // later is how one long turn would owe you a queue of battles.
  if (readEncounter(ttlMs)) return walked

  const level = readStatus()?.lead?.level
  const leadLevel = typeof level === 'number' ? level : null

  const encounters = rollEncounters({
    steps: Math.min(config.maxSteps, steps + pending),
    leadLevel,
    rng: makeRng(randomSeed()),
    config,
    species: loadSpeciesTable(leadLevel ?? 5),
  })

  // However far this stretch of work walked, only the first thing it turned up is
  // waiting for you.
  const [encounter] = encounters
  if (encounter) offerEncounter({ ...encounter, session: sessionId }, ttlMs)

  return walked
}

async function main() {
  const raw = await readStdin()
  if (!raw.trim()) return

  const payload = JSON.parse(raw)
  const session = payload.session_id
  if (!session) return

  const cwd = payload.cwd ?? null
  const event = payload.hook_event_name

  switch (event) {
    case 'PreToolUse': {
      // Roll first, so the steps are credited against the clocks this write moves.
      // Also the usual place a prompt's own walk gets taken: the first tool call is
      // the earliest moment the session is visibly doing something.
      const walked = walkWhileWorking(session, Date.now())
      noteTool(session, cwd, payload.tool_name, walked ?? {})
      break
    }

    case 'Notification':
      // Claude is blocked on the human: a permission prompt, or a question.
      noteWaiting(session, cwd, payload.message)
      break

    case 'Stop': {
      // The last stretch of thinking counts too, which is what makes a turn that
      // never touched a tool still walk somewhere — and the last chance to take a
      // walk the prompt bought, since endTurn writes the debt off.
      const walked = walkWhileWorking(session, Date.now())
      endTurn(session, cwd, walked ?? {})
      break
    }

    case 'SessionStart':
      // The one event rare enough to afford a directory scan, so it is where the
      // leftovers of sessions that were killed rather than closed get cleared.
      pruneSessions()
      endTurn(session, cwd)
      break

    case 'SessionEnd':
      endSession(session)
      break

    default:
      // An event we did not ask for. Recording it as work is better than losing
      // the session, since anything arriving at all means it is alive.
      beginTurn(session, cwd)
      break
  }
}

try {
  await main()
} catch (error) {
  logError('on-activity', error)
}

// Explicit and unconditional: whatever happened above, Claude carries on.
process.exit(0)
