import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'

process.env.CLAUDEMON_HOME = mkdtempSync(join(tmpdir(), 'claudemon-queue-'))

const { QUEUE_FILE } = await import('./paths.mjs')
const {
  clearEncounter,
  consumeEncounter,
  offerEncounter,
  peekQueue,
  readEncounter,
} = await import('./queue.mjs')

const encounter = (name, at) => {
  return {
    v: 1,
    kind: 'wild',
    species: 25,
    name,
    level: 10,
    trainer: null,
    seed: name.length,
    shiny: false,
    session: 'session-a',
    at,
  }
}

beforeEach(() => {
  writeFileSync(QUEUE_FILE, '')
})

test('Should append encounters in order instead of replacing the waiting one', () => {
  offerEncounter(encounter('First', '2026-08-13T00:00:00.000Z'))
  offerEncounter(encounter('Second', '2026-08-13T00:00:01.000Z'))

  expect(peekQueue().map((entry) => entry.name)).toEqual(['First', 'Second'])
})

test('Should surface the oldest live encounter first', () => {
  writeFileSync(
    QUEUE_FILE,
    [
      encounter('First', '2026-08-13T00:00:00.000Z'),
      encounter('Second', '2026-08-13T00:00:01.000Z'),
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n'),
  )

  expect(readEncounter(60_000, Date.parse('2026-08-13T00:00:30.000Z')).name).toBe(
    'First',
  )
})

test('Should consume only the current encounter and leave the next one queued', () => {
  writeFileSync(
    QUEUE_FILE,
    [
      encounter('First', '2026-08-13T00:00:00.000Z'),
      encounter('Second', '2026-08-13T00:00:01.000Z'),
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n'),
  )

  const consumed = consumeEncounter(
    60_000,
    Date.parse('2026-08-13T00:00:30.000Z'),
  )

  expect(consumed.name).toBe('First')
  expect(peekQueue().map((entry) => entry.name)).toEqual(['Second'])
})

test('Should prune expired entries while keeping later live encounters', () => {
  writeFileSync(
    QUEUE_FILE,
    [
      encounter('Expired', '2026-08-12T23:58:00.000Z'),
      encounter('Live', '2026-08-13T00:00:20.000Z'),
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n'),
  )

  const current = readEncounter(
    60_000,
    Date.parse('2026-08-13T00:00:30.000Z'),
  )

  expect(current.name).toBe('Live')
  expect(peekQueue().map((entry) => entry.name)).toEqual(['Live'])
})

test('Should clear only the current encounter so the next one can surface', () => {
  writeFileSync(
    QUEUE_FILE,
    [
      encounter('First', '2026-08-13T00:00:00.000Z'),
      encounter('Second', '2026-08-13T00:00:01.000Z'),
    ]
      .map((entry) => JSON.stringify(entry))
      .join('\n'),
  )

  clearEncounter()

  expect(peekQueue().map((entry) => entry.name)).toEqual(['Second'])
})
