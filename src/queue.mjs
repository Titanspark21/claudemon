import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { HOME, QUEUE_FILE } from './paths.mjs'

function parseLines(contents) {
  const entries = []
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      entries.push(JSON.parse(trimmed))
    } catch {}
  }
  return entries
}

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

function isLive(entry, ttlMs, now) {
  const at = stampOf(entry)
  return at != null && now - at < ttlMs
}

export function encounterExpiresAt(entry, ttlMs) {
  const at = stampOf(entry)
  return at == null ? null : at + ttlMs
}

export function readEncounter(ttlMs, now = Date.now()) {
  const live = peekQueue().filter((entry) => isLive(entry, ttlMs, now))
  return live.length > 0 ? live[live.length - 1] : null
}

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
    } catch {}
    throw error
  }
  return stamped
}

export function offerEncounter(entry, ttlMs, now = Date.now()) {
  if (readEncounter(ttlMs, now)) return false
  writeEncounter(entry)
  return true
}

export function clearEncounter() {
  try {
    writeFileSync(QUEUE_FILE, '')
  } catch {}
}
