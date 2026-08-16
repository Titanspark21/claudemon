import { expect, test } from 'vitest'
import {
  coverageFor,
  coverageReport,
  significantFieldKnownFailures,
  validateCoverage,
} from './mechanicsCoverage.mjs'

const entry = (handler) => ({
  status: 'supported',
  handler,
  source: 'fixture',
})

const fixture = () => ({
  dataset: {
    abilities: [{ id: 'overgrow' }],
    items: [{ id: 'leftovers' }, { id: 'thunderstone' }],
    moves: {
      tackle: {},
      'thunder-shock': {},
    },
    species: [
      {
        id: 1,
        sourceKey: 'bulbasaur',
        baseSpecies: 1,
        abilities: [{ ability: 'overgrow' }],
        learnset: [{ level: 1, move: 'tackle' }],
        evolutions: [],
      },
    ],
  },
  coverage: {
    generation: 7,
    significantFieldKnownFailures: [],
    abilities: { overgrow: entry('ability:overgrow') },
    items: {
      leftovers: entry('item:leftovers'),
      thunderstone: entry('item:evolution-stone'),
    },
    moves: {
      tackle: entry('move:damage'),
      'thunder-shock': entry('move:damage'),
    },
  },
})

test.each(['abilities', 'items', 'moves'])(
  'Should reject an unclassified %s record',
  (kind) => {
    const { dataset, coverage } = fixture()
    delete coverage[kind][Object.keys(coverage[kind])[0]]

    const result = validateCoverage(dataset, coverage)

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('unclassified'))).toBe(
      true,
    )
  },
)

test('Should reject supported coverage without a handler', () => {
  const { dataset, coverage } = fixture()
  delete coverage.abilities.overgrow.handler

  expect(validateCoverage(dataset, coverage).errors).toContain(
    'ability overgrow is supported without a handler',
  )
})

test('Should reject an exclusion without a concrete reason', () => {
  const { dataset, coverage } = fixture()
  coverage.items.leftovers = {
    status: 'blocked-by-excluded-system',
    source: 'fixture',
  }

  expect(validateCoverage(dataset, coverage).errors).toContain(
    'item leftovers blocked-by-excluded-system has no reason',
  )
})

test('Should reject stale entries that are no longer imported', () => {
  const { dataset, coverage } = fixture()
  coverage.moves.oldmove = entry('move:old')

  expect(validateCoverage(dataset, coverage).errors).toContain(
    'move oldmove is a stale coverage entry',
  )
})

test('Should reject species references to unknown records', () => {
  const { dataset, coverage } = fixture()
  dataset.species[0].abilities[0].ability = 'missing-ability'
  dataset.species[0].learnset.push({ level: 7, move: 'missing-move' })
  dataset.species[0].evolutions.push({
    to: 999,
    item: 'missing-item',
    conditions: { heldItem: 'missing-held-item', move: 'missing-evo-move' },
  })

  const errors = validateCoverage(dataset, coverage).errors.join('\n')

  expect(errors).toContain('unknown ability missing-ability')
  expect(errors).toContain('unknown move missing-move')
  expect(errors).toContain('evolves to unknown species 999')
  expect(errors).toContain('unknown item missing-item')
  expect(errors).toContain('unknown held item missing-held-item')
  expect(errors).toContain('unknown evolution move missing-evo-move')
})

test('Should reject significant-field debt that points at an unknown move', () => {
  const { dataset, coverage } = fixture()
  coverage.significantFieldKnownFailures.push({
    field: 'move.self.boosts',
    moves: ['missing-move'],
    reason: 'fixture debt',
  })

  expect(validateCoverage(dataset, coverage).errors).toContain(
    'significantFieldKnownFailures[0] references unknown move missing-move',
  )
})

test('Should expose the repository significant-field debt as a central invariant', () => {
  expect(significantFieldKnownFailures.length).toBeGreaterThan(0)
  expect(
    significantFieldKnownFailures.map((failure) => failure.field),
  ).toContain('move.secondary.self.boosts')
})

test('Should normalize source ids for coverage lookup', () => {
  const { coverage } = fixture()

  expect(coverageFor('item', 'thunder-stone', coverage)).toEqual(
    coverage.items.thunderstone,
  )
  expect(coverageFor('move', 'thunder-shock', coverage)).toEqual(
    coverage.moves['thunder-shock'],
  )
})

test('Should report totals and zero gaps for complete coverage', () => {
  const { dataset, coverage } = fixture()
  const report = coverageReport(dataset, coverage)

  expect(report).toContain('abilities: 1 total · 1 supported')
  expect(report).toContain('items: 2 total · 2 supported')
  expect(report).toContain('moves: 2 total · 2 supported')
  expect(report).toContain('gaps: 0')
})
