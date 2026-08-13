import { readFileSync } from 'node:fs'
import { EMPTY_WORKED, HOUR_MS, STALE_MS } from './constants.mjs'
import * as fileLock from './fileLock.mjs'
import { WORKED_FILE } from './paths.mjs'
import {
  transformRequestWriteWorked,
  transformResponseWorked,
} from './transformers.mjs'

const validInterval = (interval) => {
  if (typeof interval?.session !== 'string') return false
  if (!Number.isFinite(interval.from) || !Number.isFinite(interval.to))
    return false

  return interval.to > interval.from
}

const compareIntervals = (first, second) => {
  if (first.session !== second.session) {
    return first.session.localeCompare(second.session)
  }

  return first.from - second.from
}

const normalizeIntervals = (intervals) => {
  const sorted = intervals.filter(validInterval).sort(compareIntervals)
  const normalized = []

  for (const interval of sorted) {
    const previous = normalized[normalized.length - 1]

    if (
      previous?.session === interval.session &&
      interval.from <= previous.to
    ) {
      previous.to = Math.max(previous.to, interval.to)
      continue
    }

    normalized.push({
      session: interval.session,
      from: interval.from,
      to: interval.to,
    })
  }

  return normalized
}

const coverageOrder = (first, second) => first.from - second.from

const coveredMs = (intervals) => {
  const sorted = intervals.slice().sort(coverageOrder)
  let total = 0
  let from = null
  let to = null

  for (const interval of sorted) {
    if (from == null || interval.from > to) {
      if (from != null) total += to - from

      from = interval.from
      to = interval.to
      continue
    }

    to = Math.max(to, interval.to)
  }

  if (from != null) total += to - from

  return total
}

const latestIntervalAt = (intervals) => {
  return intervals.reduce(
    (latest, interval) => Math.max(latest, interval.to),
    0,
  )
}

const readWorkedFile = () => {
  try {
    return JSON.parse(readFileSync(WORKED_FILE, 'utf8'))
  } catch {
    return null
  }
}

export const readWorked = () => {
  const worked = transformResponseWorked(readWorkedFile())

  if (!worked) return { ...EMPTY_WORKED }

  return worked
}

const mergeIntervals = (worked, intervals) => {
  const previous = normalizeIntervals(worked.intervals)
  const incoming = intervals.filter(validInterval)
  const merged = normalizeIntervals([...previous, ...incoming])

  return { previous, incoming, merged }
}

export const mergeWorkedIntervals = (worked, intervals) => {
  const { previous, incoming, merged } = mergeIntervals(worked, intervals)
  const addedMs = coveredMs(merged) - coveredMs(previous)

  if (addedMs <= 0) return { ...worked, intervals: merged }

  const updatedAt = Math.max(
    Date.parse(worked.updatedAt) || 0,
    latestIntervalAt(incoming),
  )

  return {
    totalMs: worked.totalMs + addedMs,
    updatedAt: new Date(updatedAt).toISOString(),
    intervals: merged,
  }
}

export const recordActiveWindow = (worked, interval) => {
  return mergeWorkedIntervals(worked, [interval])
}

const mergeWorkedFile = (current, interval) => {
  const worked = current ?? { ...EMPTY_WORKED }

  return recordActiveWindow(worked, interval)
}

const writeWorked = (interval) => {
  try {
    return fileLock.updateJsonFile({
      path: WORKED_FILE,
      incoming: interval,
      transformResponse: transformResponseWorked,
      transformRequest: transformRequestWriteWorked,
      merge: mergeWorkedFile,
    })
  } catch {
    return readWorked()
  }
}

export const workedHours = (worked) => Math.floor(worked.totalMs / HOUR_MS)

export const workedSince = (previous, now) => {
  if (previous?.state !== 'working') return 0

  const elapsed = now - previous.at

  if (elapsed <= 0 || elapsed >= STALE_MS) return 0

  return elapsed
}

export const bankActiveWindow = (interval) => writeWorked(interval)

export const accrueWorked = (elapsedMs, now) => {
  if (elapsedMs <= 0) return readWorked()

  return bankActiveWindow({
    session: 'legacy',
    from: now - elapsedMs,
    to: now,
  })
}
