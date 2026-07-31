// status.json: a small summary the status line can read without opening the save.
//
// Written by the companion process whenever something worth showing changes.
// Kept deliberately tiny, because the status line reads it on every refresh.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { HOME, STATUS_FILE } from './paths.mjs'

/** Treated as stale after this long, so a killed companion stops claiming to be live. */
const HEARTBEAT_STALE_MS = 15_000

export function readStatus() {
  try {
    return JSON.parse(readFileSync(STATUS_FILE, 'utf8'))
  } catch {
    return null
  }
}

export function writeStatus(status) {
  try {
    mkdirSync(HOME, { recursive: true })
    const payload = JSON.stringify({ ...status, heartbeat: Date.now() })
    // tmp + rename, so a reader never catches a half-written file.
    const tmp = `${STATUS_FILE}.${process.pid}.tmp`
    writeFileSync(tmp, payload)
    renameSync(tmp, STATUS_FILE)
  } catch {
    // Cosmetic file. Failing to write it must never take the game down.
  }
}

/** Whether a companion process is actually alive and watching right now. */
export function companionIsLive(status) {
  if (!status?.heartbeat) return false
  return Date.now() - status.heartbeat < HEARTBEAT_STALE_MS
}
