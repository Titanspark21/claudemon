import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { HOME, STATUS_FILE } from './paths.mjs'

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
    const tmp = `${STATUS_FILE}.${process.pid}.tmp`
    writeFileSync(tmp, payload)
    renameSync(tmp, STATUS_FILE)
  } catch {}
}

export function companionIsLive(status) {
  if (!status?.heartbeat) return false
  return Date.now() - status.heartbeat < HEARTBEAT_STALE_MS
}
