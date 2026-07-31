// Whether Claude Code is working, and for how long.
//
// The companion sits in a tab of its own with no way of seeing what Claude Code
// is doing, so the hooks tell it: each session keeps a small file under
// ~/.claudemon/sessions/ saying what it is up to, and the companion reads the lot
// on a timer.
//
// One file per session means one writer per file — the same rule the queue and
// the save follow — so there is still nothing to lock. Writes are tmp + rename,
// because the companion can read at any moment.

import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SESSIONS_DIR, sessionFile } from './paths.mjs'

/**
 * A session that has not said anything for this long is assumed dead: a killed
 * terminal never gets to run its SessionEnd hook, and a tab that claims to be
 * working forever is worse than one that goes quiet. Generous, because a single
 * turn can legitimately think for a long time between tool calls.
 */
export const STALE_MS = 30 * 60_000

/** Session files older than this are litter from sessions long gone. */
const PRUNE_MS = 24 * 60 * 60_000

/** Most urgent first: what the companion shows when several sessions disagree. */
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

/** Everything a hook records about one session. Callers pass a whole entry. */
export function writeActivity(entry) {
  try {
    mkdirSync(SESSIONS_DIR, { recursive: true })
    const path = sessionFile(entry.session)
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(entry))
    renameSync(tmp, path)
  } catch {
    // Cosmetic. A hook must never fail over a status file.
  }
  return entry
}

export function clearActivity(sessionId) {
  try {
    unlinkSync(sessionFile(sessionId))
  } catch {
    // Already gone, which is the state we wanted.
  }
}

/** Every session still worth listening to, freshest first. */
export function readSessions(now = Date.now()) {
  let names = []
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

/** Drops the files of sessions that ended without saying so. */
export function pruneSessions(now = Date.now()) {
  let names = []
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
    } catch {
      // Someone else got there first.
    }
  }
  return removed
}

/**
 * Boils every live session down to the one line the companion shows.
 *
 * `state` is 'unknown' when no session is reporting at all, which is also what a
 * machine without the hook installed looks like. The companion says nothing in
 * that case rather than claiming Claude is idle.
 */
export function summariseActivity(sessions, now = Date.now()) {
  const live = sessions.filter((entry) => now - entry.at < STALE_MS)
  if (live.length === 0) return { state: 'unknown', tool: null, since: null, sessions: 0 }

  for (const state of PRIORITY) {
    const matching = live.filter((entry) => entry.state === state)
    if (matching.length === 0) continue

    // The freshest session is the one actually moving, and so the one worth
    // describing. Sorted here rather than trusted from the caller: getting it
    // wrong shows a tool that finished ten minutes ago as the current one.
    const leader = matching.reduce((best, entry) => (entry.at > best.at ? entry : best))
    return {
      state,
      tool: leader.tool ?? null,
      since: typeof leader.since === 'number' ? leader.since : leader.at,
      sessions: matching.length,
    }
  }

  return { state: 'unknown', tool: null, since: null, sessions: 0 }
}

// --- transitions -------------------------------------------------------------
//
// One function per thing that can happen to a session. Each returns the entry it
// wrote, so a hook can look at what the session was doing before.

function base(sessionId, cwd, previous) {
  return {
    v: 1,
    session: sessionId,
    cwd: cwd ?? previous?.cwd ?? null,
    at: Date.now(),
  }
}

/**
 * A prompt was submitted: a new turn starts, and the clock with it.
 *
 * `pendingSteps` is the walk the prompt bought, recorded here rather than taken.
 * Rolling it at the keystroke put a Pokemon in the grass in the same instant you
 * pressed enter, before any of the walking it is supposed to have come from had
 * happened — which read as the game reacting to the key, not to the route.
 * on-activity.mjs cashes it in at the first sign of Claude actually working.
 *
 * Whatever the last turn left unspent is dropped: this is a new walk, not a
 * continuation of the one before it.
 */
export function beginTurn(sessionId, cwd, { pendingSteps = 0 } = {}) {
  const previous = readActivity(sessionId)
  const entry = base(sessionId, cwd, previous)
  return writeActivity({
    ...entry,
    state: 'working',
    tool: null,
    since: entry.at,
    // Steps through the grass are measured from here.
    lastStepAt: entry.at,
    pendingSteps,
  })
}

/** A tool is about to run. Also the heartbeat that keeps a session looking alive. */
export function noteTool(sessionId, cwd, tool, { lastStepAt, pendingSteps } = {}) {
  const previous = readActivity(sessionId)
  const entry = base(sessionId, cwd, previous)
  const working = previous?.state === 'working'
  return writeActivity({
    ...entry,
    state: 'working',
    tool: tool ?? null,
    // A tool running without a prompt behind it (a hook-driven turn, a resumed
    // session) still counts as work starting now.
    since: working && typeof previous.since === 'number' ? previous.since : entry.at,
    // Both clocks restart together. Carrying the step clock across a session that
    // was idle — or sat on a permission prompt — for twenty minutes would cash the
    // whole wait in at the next tool call, which is not time anyone spent waiting
    // on Claude.
    lastStepAt: lastStepAt ?? (working ? previous.lastStepAt ?? entry.at : entry.at),
    // The prompt's own steps do not restart with the clock, though: they are a walk
    // that was bought and not yet taken, and the only things that clear that debt
    // are spending it and the turn ending.
    pendingSteps: pendingSteps ?? previous?.pendingSteps ?? 0,
  })
}

/** Claude cannot get any further without you: a permission prompt, or a question. */
export function noteWaiting(sessionId, cwd, message) {
  const previous = readActivity(sessionId)
  const entry = base(sessionId, cwd, previous)
  const already = previous?.state === 'waiting'
  return writeActivity({
    ...entry,
    state: 'waiting',
    tool: previous?.tool ?? null,
    since: already && typeof previous.since === 'number' ? previous.since : entry.at,
    lastStepAt: previous?.lastStepAt ?? entry.at,
    pendingSteps: previous?.pendingSteps ?? 0,
    message: typeof message === 'string' ? message.slice(0, 120) : null,
  })
}

/** Claude stopped: the turn is over and the tab is yours again. */
export function endTurn(sessionId, cwd, { lastStepAt } = {}) {
  const previous = readActivity(sessionId)
  const entry = base(sessionId, cwd, previous)
  return writeActivity({
    ...entry,
    state: 'idle',
    tool: null,
    since: entry.at,
    lastStepAt: lastStepAt ?? entry.at,
    // Nothing is owed across turns: the caller pays out the last stretch before
    // ending the turn, and a walk nobody took by then is not one you get later.
    pendingSteps: 0,
  })
}

export function endSession(sessionId) {
  clearActivity(sessionId)
}
