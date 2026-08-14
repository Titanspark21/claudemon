import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { bundledDataFile } from '../src/paths.mjs'
import { BIOME_IDS } from './biomeOverrides.mjs'
import {
  assignBiomes,
  biomeEvidence,
  buildBiomePools,
  generateBiomeAssignments,
  scoreFamilyCoherence,
  validateBiomePools,
} from './biomes.mjs'

const record = (overrides = {}) => ({
  id: 1,
  sourceKey: 'fixture',
  dexNumber: 1,
  baseSpecies: 1,
  formKey: null,
  collectible: true,
  battleOnly: false,
  types: ['normal'],
  eggGroups: ['field'],
  habitat: 'grassland',
  captureRate: 120,
  evolvesFrom: null,
  legendary: false,
  mythical: false,
  ...overrides,
})

test.each([
  ['meadow', 'flower-meadow'],
  ['forest', 'viridian-forest'],
  ['wetlands', 'great-marsh'],
  ['coast', 'sandy-beach'],
  ['highlands', 'mount-coronet'],
  ['badlands', 'desert-resort'],
  ['frostlands', 'ice-path'],
  ['city-powerworks', 'lumiose-city'],
  ['mystic-ruins', 'ancient-ruins'],
])('location fixture maps %s evidence into its biome', (biome, location) => {
  const mon = record()
  const assigned = assignBiomes(
    mon,
    biomeEvidence(mon, { locations: [location] }),
    {},
    `fixture-${biome}`,
  )
  expect(assigned[0].biome).toBe(biome)
  expect(assigned[0].evidence).toContainEqual({
    source: 'location',
    detail: location,
    biome,
  })
})

test('location evidence outranks habitat and type evidence', () => {
  const mon = record({ types: ['water'], habitat: 'sea' })
  const evidence = biomeEvidence(mon, {
    locations: ['lake-area', 'beach-area'],
  })
  const assigned = assignBiomes(mon, evidence, {}, 'priority-seed')
  expect(new Set(assigned.map((entry) => entry.biome))).toEqual(
    new Set(['wetlands', 'coast']),
  )
  expect(
    assigned.every((entry) =>
      entry.evidence.some((item) => item.source === 'location'),
    ),
  ).toBe(true)
})

test('urban Electric and Steel evidence selects City & Powerworks first', () => {
  const mon = record({ types: ['electric', 'steel'], habitat: 'urban' })
  const assigned = assignBiomes(mon, biomeEvidence(mon), {}, 'urban-seed')
  expect(assigned[0].biome).toBe('city-powerworks')
})

test('supernatural species select Mystic Ruins and missing habitat falls back safely', () => {
  const mon = record({
    types: ['ghost', 'psychic'],
    habitat: 'unseen-habitat',
    eggGroups: ['amorphous'],
  })
  const assigned = assignBiomes(mon, biomeEvidence(mon), {}, 'mystic-seed')
  expect(assigned[0].biome).toBe('mystic-ruins')
})

test('curated override has absolute priority and supports one or three memberships', () => {
  const mon = record({ sourceKey: 'override-me' })
  const overrides = {
    'override-me': {
      biomes: ['meadow', 'city-powerworks', 'mystic-ruins'],
      reason: 'fixture generalist',
    },
  }
  const assigned = assignBiomes(mon, biomeEvidence(mon), overrides)
  expect(assigned).toHaveLength(3)
  expect(assigned.every((entry) => entry.override)).toBe(true)
})

test('ecological specialists keep a single evidence-backed biome', () => {
  const mon = record({ types: [], habitat: 'forest', eggGroups: [] })
  const assigned = assignBiomes(mon, biomeEvidence(mon), {}, 'specialist-seed')
  expect(assigned.map((entry) => entry.biome)).toEqual(['forest'])
})

test('legendary overrides stay in special-biome homes', () => {
  const mon = record({
    sourceKey: 'articuno',
    legendary: true,
    types: ['ice', 'flying'],
  })
  const assigned = assignBiomes(mon, biomeEvidence(mon))
  expect(assigned.map((entry) => entry.biome)).toEqual([
    'frostlands',
    'highlands',
  ])
  expect(assigned.every((entry) => entry.override)).toBe(true)
})

test('Alolan form overrides remain distinct from their base species', () => {
  const alolan = record({
    id: 810,
    sourceKey: 'sandshrewalola',
    dexNumber: 27,
    baseSpecies: 27,
    formKey: 'alola',
    types: ['ice', 'steel'],
  })
  const assigned = assignBiomes(alolan, biomeEvidence(alolan))
  expect(assigned.map((entry) => entry.biome)).toEqual(['frostlands'])
})

test('family coherence reports split and shared evolution edges', () => {
  const records = [
    record({ id: 1 }),
    record({ id: 2, sourceKey: 'child', baseSpecies: 2, evolvesFrom: 1 }),
  ]
  const shared = [
    { id: 1, biomes: [{ biome: 'forest' }] },
    { id: 2, biomes: [{ biome: 'forest' }, { biome: 'meadow' }] },
  ]
  expect(scoreFamilyCoherence(records, shared)).toMatchObject({
    edges: 1,
    coherent: 1,
    split: 0,
  })
  shared[1].biomes = [{ biome: 'coast' }]
  expect(scoreFamilyCoherence(records, shared)).toMatchObject({
    edges: 1,
    coherent: 0,
    split: 1,
  })
})

test('validation catches an eligible record with no assignment', () => {
  const result = validateBiomePools([record()], [])
  expect(result.valid).toBe(false)
  expect(result.errors).toContain('unassigned eligible record fixture')
})

test('the complete Generation VII dataset produces nine balanced broad pools', () => {
  const pokedex = JSON.parse(
    readFileSync(bundledDataFile('pokedex.json'), 'utf8'),
  )
  const assignments = generateBiomeAssignments(pokedex)
  const validation = validateBiomePools(pokedex, assignments)
  const pools = buildBiomePools(assignments)

  expect(validation.valid, validation.errors.join('\n')).toBe(true)
  expect(validation.counts.averageMemberships).toBeCloseTo(2, 1)
  expect(pools.biomes.map((biome) => biome.id)).toEqual(BIOME_IDS)
  expect(pools.biomes).toHaveLength(9)
  expect(pools.biomes.every((biome) => biome.ordinary.length > 0)).toBe(true)
  expect(assignments.some((entry) => entry.special)).toBe(true)
  expect(
    assignments.every(
      (entry) => entry.biomes.length >= 1 && entry.biomes.length <= 3,
    ),
  ).toBe(true)
  expect(
    assignments.every((entry) =>
      entry.biomes.every(
        (item) => item.override || (item.evidence?.length ?? 0) > 0,
      ),
    ),
  ).toBe(true)
  expect(generateBiomeAssignments(pokedex)).toEqual(assignments)
})
