// The encounter slot: the one channel from the hook to the companion process.
//
// One Pokemon in the grass at a time, and only for as long as its window lasts.
// Nothing is ever queued behind it: a session that works for an hour does not bank
// an hour of battles, it just keeps meeting whatever is out there right now.
//
// The entry carries the moment it appeared, so both sides work out when it is gone
// from the same number without having to talk. That is what lets the hook see that
// the grass is occupied — the companion leaves the entry in the file until the
// battle actually starts, rather than draining it into memory where the hook
// cannot see it.
//
// Writes go through a temp file and a rename, which is atomic: a reader never
// catches half a line, and two sessions writing in the same instant leave one
// whole entry rather than a spliced one.

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { HOME, QUEUE_FILE } from './paths.mjs'

function parseLines(contents) {
  const entries = []
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      entries.push(JSON.parse(trimmed))
    } catch {
      // Garbage, or a line from a version that wrote this file differently. Skip
      // it rather than losing whatever else is in there.
    }
  }
  return entries
}

/** Everything in the slot, expired or not. For tests and for reading the file. */
export function peekQueue() {
  try {
    return parseLines(readFileSync(QUEUE_FILE, 'utf8'))
  } catch {
    return []
  }
}

function stampOf(entry) {
  const at = Date.parse(entry?.at)
  return Number.isNaN(at) ? null : at
}

/**
 * Whether an encounter is still standing there.
 *
 * An entry with no usable stamp counts as gone: something that cannot be timed out
 * is exactly what this file exists to prevent, and dropping an encounter is always
 * the safe direction.
 */
function isLive(entry, ttlMs, now) {
  const at = stampOf(entry)
  return at != null && now - at < ttlMs
}

/** The wild Pokemon currently in the grass, or null if there is none. */
export function readEncounter(ttlMs, now = Date.now()) {
  const live = peekQueue().filter((entry) => isLive(entry, ttlMs, now))
  // Normally there is at most one. More can only come from an older version of
  // this file, in which case the newest is the one still worth meeting.
  return live.length > 0 ? live[live.length - 1] : null
}

/** Puts an encounter in the slot, replacing whatever was there. */
export function writeEncounter(entry) {
  const stamped = { ...entry, at: entry.at ?? new Date().toISOString() }
  mkdirSync(HOME, { recursive: true })

  const tmp = `${QUEUE_FILE}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, `${JSON.stringify(stamped)}\n`)
    renameSync(tmp, QUEUE_FILE)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {
      // Already gone, which is the state we wanted.
    }
    throw error
  }
  return stamped
}

/**
 * Offers an encounter, and takes no for an answer.
 *
 * The hook's side of the one-at-a-time rule: if something is already out there,
 * this walk simply turned nothing up.
 *
 * @returns {boolean} whether it went in.
 */
export function offerEncounter(entry, ttlMs, now = Date.now()) {
  if (readEncounter(ttlMs, now)) return false
  writeEncounter(entry)
  return true
}

/** Empties the slot. Companion only: it is the one that consumes encounters. */
export function clearEncounter() {
  try {
    writeFileSync(QUEUE_FILE, '')
  } catch {
    // The entry times out on its own regardless, so the worst case is meeting the
    // same Pokemon again within its window rather than a stuck game.
  }
}
