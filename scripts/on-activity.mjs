import {
  beginTurn,
  endSession,
  endTurn,
  noteTool,
  noteWaiting,
  pruneSessions,
  readActivity,
} from '../src/activity.mjs'
import { encounterTtlMs, loadConfig } from '../src/config.mjs'
import {
  loadSpeciesTable,
  rollEncounters,
  stepsWhileWorking,
} from '../src/encounter.mjs'
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

function walkWhileWorking(sessionId, now) {
  const previous = readActivity(sessionId)
  if (previous?.state !== 'working') return null

  const config = loadConfig()
  const ttlMs = encounterTtlMs(config)
  const { steps, taken } = stepsWhileWorking(
    now - (previous.lastStepAt ?? previous.since ?? now),
    config,
  )
  const pending = Number.isInteger(previous.pendingSteps)
    ? Math.max(0, previous.pendingSteps)
    : 0
  if (steps === 0 && pending === 0) return null

  const walked = {
    lastStepAt: (previous.lastStepAt ?? previous.since ?? now) + taken,
    pendingSteps: 0,
  }

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
      const walked = walkWhileWorking(session, Date.now())
      noteTool(session, cwd, payload.tool_name, walked ?? {})
      break
    }

    case 'Notification':
      noteWaiting(session, cwd, payload.message)
      break

    case 'Stop': {
      const walked = walkWhileWorking(session, Date.now())
      endTurn(session, cwd, walked ?? {})
      break
    }

    case 'SessionStart':
      pruneSessions()
      endTurn(session, cwd)
      break

    case 'SessionEnd':
      endSession(session)
      break

    default:
      beginTurn(session, cwd)
      break
  }
}

try {
  await main()
} catch (error) {
  logError('on-activity', error)
}

process.exit(0)
