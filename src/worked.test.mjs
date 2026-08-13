import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'

process.env.CLAUDEMON_HOME = mkdtempSync(join(tmpdir(), 'claudemon-worked-'))

const { STALE_MS } = await import('./constants.mjs')
const { WORKED_FILE } = await import('./paths.mjs')
const { accrueWorked, mergeWorkedIntervals, readWorked, workedSince } =
  await import('./worked.mjs')

beforeEach(() => {
  writeFileSync(WORKED_FILE, JSON.stringify({ totalMs: 0, updatedAt: null }))
})

test('Should report nothing worked before any hook has run', () => {
  writeFileSync(WORKED_FILE, 'not json at all')

  expect(readWorked()).toEqual({ totalMs: 0, updatedAt: null, intervals: [] })
})

test('Should count the time since the last event while Claude was working', () => {
  const now = Date.now()

  expect(workedSince({ state: 'working', at: now - 4000 }, now)).toBe(4000)
})

test('Should count nothing while Claude was idle, waiting or unheard of', () => {
  const now = Date.now()

  expect(workedSince({ state: 'idle', at: now - 4000 }, now)).toBe(0)
  expect(workedSince({ state: 'waiting', at: now - 4000 }, now)).toBe(0)
  expect(workedSince(null, now)).toBe(0)
})

test('Should count nothing across a gap longer than a session stays live', () => {
  const now = Date.now()

  expect(workedSince({ state: 'working', at: now - STALE_MS }, now)).toBe(0)
})

test('Should union overlapping ranges', () => {
  const worked = mergeWorkedIntervals(
    { totalMs: 0, updatedAt: null, intervals: [] },
    [
      { session: 'a', from: 1000, to: 5000 },
      { session: 'b', from: 3000, to: 7000 },
    ],
  )

  expect(worked.totalMs).toBe(6000)
})

test('Should count separate ranges in full', () => {
  const worked = mergeWorkedIntervals(
    { totalMs: 0, updatedAt: null, intervals: [] },
    [
      { session: 'a', from: 1000, to: 5000 },
      { session: 'b', from: 7000, to: 11_000 },
    ],
  )

  expect(worked.totalMs).toBe(8000)
})

test('Should normalize ranges that arrive out of order', () => {
  const first = mergeWorkedIntervals(
    { totalMs: 0, updatedAt: null, intervals: [] },
    [
      { session: 'a', from: 5000, to: 9000 },
      { session: 'a', from: 1000, to: 6000 },
    ],
  )
  const replayed = mergeWorkedIntervals(first, [
    { session: 'a', from: 2000, to: 4000 },
  ])

  expect(first.totalMs).toBe(8000)
  expect(replayed.totalMs).toBe(8000)
  expect(replayed.intervals).toEqual([{ session: 'a', from: 1000, to: 9000 }])
})

test('Should add each stretch of work to the running total', () => {
  const now = Date.now()

  accrueWorked(4000, now)
  const worked = accrueWorked(6000, now + 6000)

  expect(worked.totalMs).toBe(10_000)
  expect(worked.updatedAt).toBe(new Date(now + 6000).toISOString())
  expect(readWorked()).toEqual(worked)
})

test('Should leave the total untouched when no time was worked', () => {
  const now = Date.now()

  accrueWorked(4000, now)

  expect(accrueWorked(0, now + 1000)).toEqual({
    totalMs: 4000,
    updatedAt: new Date(now).toISOString(),
    intervals: [{ session: 'legacy', from: now - 4000, to: now }],
  })
})
