import { expect, test } from 'vitest'
import {
  BIOME_IDS,
  EXPEDITION_OPTIONAL_RATE,
  EXPEDITION_VISIT_MAX_MS,
  EXPEDITION_VISIT_MIN_MS,
  EXPEDITION_VISIT_MODE_MS,
  MINUTE_MS,
} from './constants.mjs'
import {
  transformRequestSaveGame,
  transformResponseSave,
} from './transformers.mjs'
import {
  BIOME_GRAPH,
  advanceExpedition,
  autoChooseDeparture,
  chooseBiomePath,
  createExpedition,
  forceDeparture,
  forcedVisitTarget,
  normalizeExpedition,
  offerOptionalFork,
  optionalForkTarget,
} from './expedition.mjs'

const seedWithOptionalFork = () => {
  for (let seed = 0; seed < 10_000; seed++) {
    if (optionalForkTarget(seed) != null) return seed
  }

  throw new Error('no optional-fork seed found')
}

test('Should use the specified triangular visit distribution', () => {
  expect(EXPEDITION_VISIT_MIN_MS).toBe(30 * MINUTE_MS)
  expect(EXPEDITION_VISIT_MODE_MS).toBe(40 * MINUTE_MS)
  expect(EXPEDITION_VISIT_MAX_MS).toBe(65 * MINUTE_MS)
  expect(
    (EXPEDITION_VISIT_MIN_MS +
      EXPEDITION_VISIT_MODE_MS +
      EXPEDITION_VISIT_MAX_MS) /
      3,
  ).toBe(45 * MINUTE_MS)

  for (let seed = 0; seed < 20_000; seed++) {
    const target = forcedVisitTarget(seed)

    expect(target).toBeGreaterThanOrEqual(EXPEDITION_VISIT_MIN_MS)
    expect(target).toBeLessThanOrEqual(EXPEDITION_VISIT_MAX_MS)
  }
})

test('Should start new and normalized legacy expeditions in Meadow', () => {
  expect(createExpedition(123, 90_000).biome).toBe('meadow')

  const migrated = normalizeExpedition(null, 7 * MINUTE_MS, 456)

  expect(migrated.biome).toBe('meadow')
  expect(migrated.elapsedMs).toBe(0)
  expect(migrated.visitStartedWorkedMs).toBe(7 * MINUTE_MS)
})

test('Should persist every visit decision and pending departure across restart mapping', () => {
  const expedition = createExpedition(2026, 0)

  advanceExpedition(expedition, expedition.forcedTargetMs)

  const written = transformRequestSaveGame({ version: 1, expedition })
  const restored = transformResponseSave(written)

  expect(restored.expedition).toEqual(expedition)
  expect(restored.expedition.pendingDeparture.paths).toHaveLength(2)
})

test('Should advance only from monotonic merged worked time', () => {
  const expedition = createExpedition(seedWithOptionalFork(), 10 * MINUTE_MS)

  advanceExpedition(expedition, 10 * MINUTE_MS)
  expect(expedition.elapsedMs).toBe(0)

  advanceExpedition(expedition, 22 * MINUTE_MS)
  expect(expedition.elapsedMs).toBe(12 * MINUTE_MS)

  advanceExpedition(expedition, 18 * MINUTE_MS)
  advanceExpedition(expedition, 22 * MINUTE_MS)
  expect(expedition.elapsedMs).toBe(12 * MINUTE_MS)
})

test('Should offer one optional fork on forty percent of visits between 15 and 30 minutes', () => {
  let optional = 0

  for (let seed = 0; seed < 10_000; seed++) {
    const target = optionalForkTarget(seed)

    if (target == null) continue

    optional++
    expect(target).toBeGreaterThanOrEqual(15 * MINUTE_MS)
    expect(target).toBeLessThanOrEqual(30 * MINUTE_MS)
  }

  expect(
    Math.abs(optional / 10_000 - EXPEDITION_OPTIONAL_RATE),
  ).toBeLessThanOrEqual(0.01)
})

test('Should keep an ignored optional offer available and Stay should preserve the forced clock', () => {
  const expedition = createExpedition(seedWithOptionalFork(), 0)
  const forcedTarget = expedition.forcedTargetMs
  const optionalTarget = expedition.optionalTargetMs

  const first = advanceExpedition(expedition, optionalTarget)

  expect(first.map((event) => event.type)).toEqual(['optional-fork'])
  expect(offerOptionalFork(expedition)).toEqual({
    stay: true,
    paths: expedition.optionalPaths,
  })

  advanceExpedition(expedition, optionalTarget + 3 * MINUTE_MS)
  expect(offerOptionalFork(expedition)).not.toBeNull()

  chooseBiomePath(expedition, 'stay')

  expect(expedition.biome).toBe('meadow')
  expect(expedition.forcedTargetMs).toBe(forcedTarget)
  expect(expedition.visitStartedWorkedMs).toBe(0)
  expect(expedition.elapsedMs).toBe(optionalTarget + 3 * MINUTE_MS)
  expect(offerOptionalFork(expedition)).toBeNull()
})

test('Should force departure immediately at expiry with exactly two neighboring paths', () => {
  const expedition = createExpedition(77, 0)
  const before = expedition.biome
  const events = advanceExpedition(expedition, expedition.forcedTargetMs)
  const departure = forceDeparture(expedition)

  expect(events.map((event) => event.type)).toEqual(['forced-departure'])
  expect(expedition.pendingDeparture).not.toBeNull()
  expect(departure.paths).toHaveLength(2)
  expect(new Set(departure.paths).size).toBe(2)
  expect(
    departure.paths.every((biome) => BIOME_GRAPH[before].includes(biome)),
  ).toBe(true)
  expect(expedition.pendingDeparture.atWorkedMs).toBe(expedition.forcedTargetMs)
})

test('Should accept named optional destinations and reject paths that were not offered', () => {
  const expedition = createExpedition(seedWithOptionalFork(), 0)

  advanceExpedition(expedition, expedition.optionalTargetMs)

  const destination = expedition.optionalPaths[1]
  const workedMs = expedition.workedMs

  chooseBiomePath(expedition, 'not-a-biome')
  expect(expedition.optionalOffered).toBe(true)
  expect(expedition.biome).toBe('meadow')

  chooseBiomePath(expedition, destination)

  expect(expedition.biome).toBe(destination)
  expect(expedition.visitRevision).toBe(1)
  expect(expedition.visitStartedWorkedMs).toBe(workedMs)
})

test('Should reject an invalid forced path, accept a named one, and fail closed on corrupt auto choice', () => {
  const expedition = createExpedition(8181, 0)

  advanceExpedition(expedition, expedition.forcedTargetMs)

  const destination = expedition.pendingDeparture.paths[0]

  chooseBiomePath(expedition, 'not-a-biome')
  expect(expedition.pendingDeparture).not.toBeNull()

  chooseBiomePath(expedition, destination)
  expect(expedition.biome).toBe(destination)
  expect(expedition.pendingDeparture).toBeNull()

  advanceExpedition(
    expedition,
    expedition.visitStartedWorkedMs + expedition.forcedTargetMs,
  )
  expedition.autoPathIndex = 99

  expect(() => autoChooseDeparture(expedition)).toThrow(
    'expedition could not settle a forced departure',
  )
})

test('Should choose forced departures deterministically and carry overshoot into the new visit', () => {
  const workedMs = 4 * 60 * MINUTE_MS
  const first = createExpedition(9123, 0)
  const second = createExpedition(9123, 0)

  advanceExpedition(first, workedMs)
  advanceExpedition(second, workedMs)
  autoChooseDeparture(first)
  autoChooseDeparture(second)

  expect(first).toEqual(second)
  expect(BIOME_IDS).toContain(first.biome)
  expect(first.visitRevision).toBeGreaterThan(0)
  expect(first.workedMs).toBe(workedMs)
  expect(first.elapsedMs).toBe(workedMs - first.visitStartedWorkedMs)
  expect(first.elapsedMs).toBeLessThan(first.forcedTargetMs)
  expect(first.pendingDeparture).toBeNull()
})

test('Should normalize corrupt persisted state without inventing illegal paths', () => {
  const normalized = normalizeExpedition(
    {
      version: 99,
      biome: 'void',
      visitSeed: -1,
      visitRevision: -5,
      visitStartedWorkedMs: -100,
      workedMs: Number.NaN,
      elapsedMs: -1,
      forcedTargetMs: 1,
      optionalRoll: 3,
      optionalTargetMs: -2,
      optionalPaths: ['void', 'void'],
      forcedPaths: ['void'],
      autoPathIndex: 9,
      optionalOffered: true,
      optionalDismissed: false,
      pendingDeparture: { paths: ['void', 'void'], atWorkedMs: -1 },
    },
    12 * MINUTE_MS,
    31415,
  )

  expect(normalized.biome).toBe('meadow')
  expect(normalized.visitRevision).toBe(0)
  expect(normalized.visitStartedWorkedMs).toBe(12 * MINUTE_MS)
  expect(normalized.elapsedMs).toBe(0)
  expect(normalized.forcedTargetMs).toBeGreaterThanOrEqual(30 * MINUTE_MS)
  expect(normalized.forcedPaths).toHaveLength(2)
  expect(
    normalized.forcedPaths.every((biome) => BIOME_GRAPH.meadow.includes(biome)),
  ).toBe(true)
  expect(normalized.pendingDeparture).toBeNull()
})

test('Should define a connected graph with two or more neighbors per biome', () => {
  for (const biome of BIOME_IDS) {
    expect(BIOME_GRAPH[biome].length).toBeGreaterThanOrEqual(2)
    expect(new Set(BIOME_GRAPH[biome]).size).toBe(BIOME_GRAPH[biome].length)

    for (const neighbor of BIOME_GRAPH[biome]) {
      expect(BIOME_IDS).toContain(neighbor)
      expect(BIOME_GRAPH[neighbor]).toContain(biome)
    }
  }

  const reached = new Set(['meadow'])
  const pending = ['meadow']

  while (pending.length) {
    const biome = pending.shift()

    for (const neighbor of BIOME_GRAPH[biome]) {
      if (reached.has(neighbor)) continue
      reached.add(neighbor)
      pending.push(neighbor)
    }
  }

  expect([...reached].sort()).toEqual([...BIOME_IDS].sort())
})

const simulate = (visits) => {
  const expedition = createExpedition(0xdecafbad, 0)
  const biomes = []
  const targets = []
  let optional = 0

  for (let index = 0; index < visits; index++) {
    biomes.push(expedition.biome)
    targets.push(expedition.forcedTargetMs)
    if (expedition.optionalTargetMs != null) optional++

    advanceExpedition(
      expedition,
      expedition.visitStartedWorkedMs + expedition.forcedTargetMs,
    )
    autoChooseDeparture(expedition)
  }

  return { expedition, biomes, targets, optional }
}

test('Should stay stable and healthy across 10,000 seeded visits', () => {
  const first = simulate(10_000)
  const replay = simulate(10_000)
  const meanMinutes =
    first.targets.reduce((sum, target) => sum + target, 0) /
    first.targets.length /
    MINUTE_MS
  const optionalRate = first.optional / first.targets.length

  expect(first).toEqual(replay)
  expect(Math.abs(meanMinutes - 45)).toBeLessThanOrEqual(0.25)
  expect(Math.abs(optionalRate - EXPEDITION_OPTIONAL_RATE)).toBeLessThanOrEqual(
    0.01,
  )
  expect(new Set(first.biomes)).toEqual(new Set(BIOME_IDS))
  expect(first.targets.every((target) => target >= 30 * MINUTE_MS)).toBe(true)
  expect(first.targets.every((target) => target <= 65 * MINUTE_MS)).toBe(true)
  expect(first.expedition.pendingDeparture).toBeNull()
})
