import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { SESSIONS_DIR, sessionFile } from './paths.mjs'

export const STALE_MS = 30 * 60_000

const PRUNE_MS = 24 * 60 * 60_000

const PRIORITY = ['waiting', 'working', 'idle']

function readEntry(path) {
  try {
    const entry = JSON.parse(readFileSync(path, 'utf8'))
    return typeof entry?.at === 'number' ? entry : null
  } catch {
    return null
  }
}

export function readActivity(sessionId) {
  return readEntry(sessionFile(sessionId))
}

export function writeActivity(entry) {
  try {
    mkdirSync(SESSIONS_DIR, { recursive: true })
    const path = sessionFile(entry.session)
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(entry))
    renameSync(tmp, path)
  } catch {}
  return entry
}

export function clearActivity(sessionId) {
  try {
    unlinkSync(sessionFile(sessionId))
  } catch {}
}

export function readSessions(now = Date.now()) {
  let names
  try {
    names = readdirSync(SESSIONS_DIR)
  } catch {
    return []
  }

  const sessions = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const entry = readEntry(join(SESSIONS_DIR, name))
    if (entry && now - entry.at < STALE_MS) sessions.push(entry)
  }
  return sessions.sort((a, b) => b.at - a.at)
}

export function pruneSessions(now = Date.now()) {
  let names
  try {
    names = readdirSync(SESSIONS_DIR)
  } catch {
    return 0
  }

  let removed = 0
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const path = join(SESSIONS_DIR, name)
    const entry = readEntry(path)
    if (entry && now - entry.at < PRUNE_MS) continue
    try {
      unlinkSync(path)
      removed++
    } catch {}
  }
  return removed
}

export function summariseActivity(sessions, now = Date.now()) {
  const live = sessions.filter((entry) => now - entry.at < STALE_MS)
  if (live.length === 0)
    return { state: 'unknown', tool: null, since: null, sessions: 0 }

  for (const state of PRIORITY) {
    const matching = live.filter((entry) => entry.state === state)
    if (matching.length === 0) continue

    const leader = matching.reduce((best, entry) =>
      entry.at > best.at ? entry : best,
    )
    return {
      state,
      tool: leader.tool ?? null,
      since: typeof leader.since === 'number' ? leader.since : leader.at,
      sessions: matching.length,
    }
  }

  return { state: 'unknown', tool: null, since: null, sessions: 0 }
}

export function isWorking(activity) {
  return activity?.state === 'working'
}

function base(sessionId, cwd, previous) {
  return {
    v: 1,
    session: sessionId,
    cwd: cwd ?? previous?.cwd ?? null,
    at: Date.now(),
  }
}

export function beginTurn(sessionId, cwd, { pendingSteps = 0 } = {}) {
  const previous = readActivity(sessionId)
  const entry = base(sessionId, cwd, previous)
  return writeActivity({
    ...entry,
    state: 'working',
    tool: null,
    since: entry.at,
    lastStepAt: entry.at,
    pendingSteps,
  })
}

export function noteTool(
  sessionId,
  cwd,
  tool,
  { lastStepAt, pendingSteps } = {},
) {
  const previous = readActivity(sessionId)
  const entry = base(sessionId, cwd, previous)
  const working = previous?.state === 'working'
  return writeActivity({
    ...entry,
    state: 'working',
    tool: tool ?? null,
    since:
      working && typeof previous.since === 'number' ? previous.since : entry.at,
    lastStepAt:
      lastStepAt ?? (working ? (previous.lastStepAt ?? entry.at) : entry.at),
    pendingSteps: pendingSteps ?? previous?.pendingSteps ?? 0,
  })
}

export function noteWaiting(sessionId, cwd, message) {
  const previous = readActivity(sessionId)
  const entry = base(sessionId, cwd, previous)
  const already = previous?.state === 'waiting'
  return writeActivity({
    ...entry,
    state: 'waiting',
    tool: previous?.tool ?? null,
    since:
      already && typeof previous.since === 'number' ? previous.since : entry.at,
    lastStepAt: previous?.lastStepAt ?? entry.at,
    pendingSteps: previous?.pendingSteps ?? 0,
    message: typeof message === 'string' ? message.slice(0, 120) : null,
  })
}

export function endTurn(sessionId, cwd, { lastStepAt } = {}) {
  const previous = readActivity(sessionId)
  const entry = base(sessionId, cwd, previous)
  return writeActivity({
    ...entry,
    state: 'idle',
    tool: null,
    since: entry.at,
    lastStepAt: lastStepAt ?? entry.at,
    pendingSteps: 0,
  })
}

export function endSession(sessionId) {
  clearActivity(sessionId)
}
