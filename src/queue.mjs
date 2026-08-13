import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { HOME, QUEUE_FILE } from './paths.mjs'
import { trainerClass } from './trainer.mjs'
import {
  transformRequestWriteEncounter,
  transformResponseEncounter,
} from './transformers.mjs'

const parseLines = (contents) => {
  const entries = []

  for (const line of contents.split('\n')) {
    const trimmed = line.trim()

    if (trimmed === '') continue

    try {
      const entry = transformResponseEncounter(JSON.parse(trimmed))

      if (entry) entries.push(entry)
    } catch {}
  }

  return entries
}

export const peekQueue = () => {
  try {
    return parseLines(readFileSync(QUEUE_FILE, 'utf8'))
  } catch {
    return []
  }
}

const stampOf = (entry) => {
  const at = Date.parse(entry.at)

  if (Number.isNaN(at)) return null

  return at
}

const isLive = (entry, ttlMs, now) => {
  const at = stampOf(entry)

  return at != null && now - at < ttlMs
}

export const encounterExpiresAt = (entry, ttlMs) => {
  const at = stampOf(entry)

  if (at == null) return null

  return at + ttlMs
}

const isUsable = (entry) => {
  if (entry.kind === 'trainer') {
    if (!trainerClass(entry.trainer.class)) return false

    return entry.trainer.team.length > 0
  }

  return entry.species != null && entry.name != null
}

const stampEncounter = (entry) => {
  return transformRequestWriteEncounter({
    v: entry.v,
    kind: entry.kind,
    species: entry.species,
    name: entry.name,
    level: entry.level,
    trainer: entry.trainer,
    seed: entry.seed,
    shiny: entry.shiny,
    session: entry.session,
    at: entry.at ?? new Date().toISOString(),
  })
}

const queueContents = (entries) => {
  if (entries.length === 0) return ''

  return `${entries.map((entry) => JSON.stringify(stampEncounter(entry))).join('\n')}\n`
}

const replaceQueue = (entries) => {
  mkdirSync(HOME, { recursive: true })

  const tmp = `${QUEUE_FILE}.${process.pid}.tmp`

  try {
    writeFileSync(tmp, queueContents(entries))
    renameSync(tmp, QUEUE_FILE)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {}

    throw error
  }
}

const liveEntries = (ttlMs, now) => {
  const entries = peekQueue()
  const live = entries.filter(
    (entry) => isLive(entry, ttlMs, now) && isUsable(entry),
  )

  if (live.length !== entries.length) replaceQueue(live)

  return live
}

export const readEncounter = (ttlMs, now = Date.now()) => {
  const live = liveEntries(ttlMs, now)

  if (live.length === 0) return null

  return live[0]
}

export const writeEncounter = (entry) => {
  const stamped = stampEncounter(entry)

  mkdirSync(HOME, { recursive: true })
  appendFileSync(QUEUE_FILE, `${JSON.stringify(stamped)}\n`)

  return stamped
}

export const offerEncounter = (entry) => {
  writeEncounter(entry)

  return true
}

export const consumeEncounter = (ttlMs, now = Date.now()) => {
  const live = liveEntries(ttlMs, now)

  if (live.length === 0) return null

  const [current, ...remaining] = live

  replaceQueue(remaining)

  return current
}

export const clearEncounter = () => {
  const [, ...remaining] = peekQueue()

  replaceQueue(remaining)
}
