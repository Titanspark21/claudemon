import { expect, test } from 'vitest'

import { BIOME_IDS } from '../src/constants.mjs'
import { loadData } from '../src/data.mjs'
import {
  encounterWeight,
  loadSpeciesTable,
  rollEncounters,
  speciesTableFromDex,
} from '../src/encounter.mjs'
import { makeRng } from '../src/rng.mjs'
import { rollTrainer } from '../src/trainer.mjs'

const ALWAYS = {
  encounterChance: 1,
  trainerChance: 0,
  charsPerStep: 40,
  maxSteps: 20_000,
  workStepSeconds: 20,
}

const FIXTURE_DEX = [
  {
    id: 1,
    name: 'Sprout',
    stage: 0,
    captureRate: 100,
    collectible: true,
    battleOnly: false,
  },
  {
    id: 2,
    name: 'Branch',
    stage: 1,
    captureRate: 100,
    collectible: true,
    battleOnly: false,
  },
  {
    id: 3,
    name: 'Canopy',
    stage: 2,
    captureRate: 100,
    collectible: true,
    battleOnly: false,
  },
  {
    id: 4,
    name: 'Relic',
    stage: 0,
    captureRate: 3,
    legendary: true,
    collectible: true,
    battleOnly: false,
  },
  {
    id: 10_001,
    name: 'Sprout-Coast',
    stage: 0,
    captureRate: 100,
    collectible: true,
    battleOnly: false,
    baseSpecies: 1,
    formKey: 'coast',
  },
  {
    id: 20_001,
    name: 'Sprout-Mega',
    stage: 0,
    captureRate: 100,
    collectible: false,
    battleOnly: true,
    baseSpecies: 1,
    formKey: 'mega',
  },
]

const FIXTURE_BIOMES = {
  biomes: [
    {
      id: 'forest',
      ordinary: [
        { id: 1, affinity: 100 },
        { id: 2, affinity: 10_000 },
        { id: 3, affinity: 1_000_000 },
        { id: 10_001, affinity: 1_000_000 },
        { id: 20_001, affinity: 1_000_000 },
      ],
      special: [{ id: 4, affinity: Number.MAX_SAFE_INTEGER }],
    },
    {
      id: 'coast',
      ordinary: [{ id: 10_001, affinity: 1_000_000 }],
      special: [],
    },
    {
      id: 'frostlands',
      ordinary: [{ id: 3, affinity: 1_000_000 }],
      special: [],
    },
  ],
}

const idsOf = (table) => table.map((entry) => entry.id)

const entryOf = (table, id) => table.find((entry) => entry.id === id)

test('biome tables filter assignments before level gates and keep collectible forms legal', () => {
  const early = speciesTableFromDex(
    FIXTURE_DEX,
    { leadLevel: 15, biome: 'forest' },
    FIXTURE_BIOMES,
  )

  expect(idsOf(early)).toEqual([1, 10_001])
  expect(idsOf(early)).not.toContain(20_001)

  const middle = speciesTableFromDex(
    FIXTURE_DEX,
    { leadLevel: 16, biome: 'forest' },
    FIXTURE_BIOMES,
  )

  expect(idsOf(middle)).toContain(2)
  expect(idsOf(middle)).not.toContain(3)

  const late = speciesTableFromDex(
    FIXTURE_DEX,
    { leadLevel: 40, biome: 'forest' },
    FIXTURE_BIOMES,
  )

  expect(idsOf(late)).toEqual([1, 2, 3, 10_001, 4])
})

test('affinity raises encounter weight while evolution stage and legendary status keep rarities bounded', () => {
  const record = FIXTURE_DEX[0]
  const lowAffinity = encounterWeight(
    record,
    { affinity: 100 },
    { leadLevel: 40 },
  )
  const highAffinity = encounterWeight(
    record,
    { affinity: 1_000_000 },
    { leadLevel: 40 },
  )

  expect(highAffinity).toBeGreaterThan(lowAffinity)

  const forest = speciesTableFromDex(
    FIXTURE_DEX,
    { leadLevel: 40, biome: 'forest' },
    FIXTURE_BIOMES,
  )

  expect(entryOf(forest, 2).weight).toBeLessThan(entryOf(forest, 1).weight * 2)
  expect(entryOf(forest, 3).weight).toBeLessThan(entryOf(forest, 2).weight * 2)
  expect(entryOf(forest, 4).weight).toBeLessThan(entryOf(forest, 1).weight)
})

test('weight normalization covers default context, invalid affinity and illegal encounter records', () => {
  const ordinary = {
    id: 99,
    name: 'Plain',
    collectible: true,
    battleOnly: false,
  }
  const baseline = encounterWeight(ordinary, null)

  expect(baseline).toBeGreaterThan(0)
  expect(encounterWeight(ordinary, { affinity: 0 }, { leadLevel: 5 })).toBe(
    baseline,
  )
  expect(
    encounterWeight(ordinary, { affinity: 'invalid' }, { leadLevel: 5 }),
  ).toBe(baseline)
  expect(
    encounterWeight(
      { ...ordinary, stage: 9 },
      { affinity: Number.MAX_SAFE_INTEGER },
      { leadLevel: 100 },
    ),
  ).toBeGreaterThan(0)
  expect(encounterWeight({ ...ordinary, collectible: false }, null)).toBe(0)
  expect(encounterWeight({ ...ordinary, battleOnly: true }, null)).toBe(0)

  const mythical = { ...ordinary, mythical: true, captureRate: 3 }

  expect(encounterWeight(mythical, null, { leadLevel: 39 })).toBe(0)
  expect(encounterWeight(mythical, null, { leadLevel: 40 })).toBeGreaterThan(0)
})

test('biome tables ignore malformed, missing and duplicate assignment entries', () => {
  const noisy = {
    biomes: [
      {
        id: 'forest',
        ordinary: [null, { id: 999 }, { id: 1 }, { id: 1 }],
        special: [],
      },
    ],
  }
  const table = speciesTableFromDex(
    FIXTURE_DEX,
    { leadLevel: 40, biome: 'forest' },
    noisy,
  )

  expect(idsOf(table)).toEqual([1])
})

test('legendary overlays stay closed until the legendary level gate', () => {
  const before = speciesTableFromDex(
    FIXTURE_DEX,
    { leadLevel: 39, biome: 'forest' },
    FIXTURE_BIOMES,
  )
  const after = speciesTableFromDex(
    FIXTURE_DEX,
    { leadLevel: 40, biome: 'forest' },
    FIXTURE_BIOMES,
  )

  expect(idsOf(before)).not.toContain(4)
  expect(idsOf(after)).toContain(4)
})

test('invalid or unavailable biome data falls back to the legal global pool', () => {
  const unavailable = speciesTableFromDex(
    FIXTURE_DEX,
    { leadLevel: 40, biome: null },
    FIXTURE_BIOMES,
  )
  const invalid = speciesTableFromDex(
    FIXTURE_DEX,
    { leadLevel: 40, biome: 'missing' },
    FIXTURE_BIOMES,
  )
  const malformed = speciesTableFromDex(
    FIXTURE_DEX,
    { leadLevel: 40, biome: 'forest' },
    { biomes: [{ id: 'forest', ordinary: null, special: [] }] },
  )

  expect(idsOf(unavailable)).toEqual([1, 2, 3, 4, 10_001])
  expect(idsOf(invalid)).toEqual(idsOf(unavailable))
  expect(idsOf(malformed)).toEqual(idsOf(unavailable))
})

test('an all-gated local pool falls back rather than producing an empty encounter table', () => {
  const table = speciesTableFromDex(
    FIXTURE_DEX,
    { leadLevel: 5, biome: 'frostlands' },
    FIXTURE_BIOMES,
  )

  expect(table.length).toBeGreaterThan(0)
  expect(idsOf(table)).toContain(1)
  expect(idsOf(table)).not.toContain(20_001)
})

test('all nine generated biomes retain SPEC breadth and legal encounter tables', () => {
  const data = loadData()
  const byId = data.byId
  const ordinaryMemberships = data.biomes.biomes.reduce(
    (sum, biome) => sum + biome.ordinary.length,
    0,
  )
  const expectedPoolSize = ordinaryMemberships / BIOME_IDS.length

  for (const biome of BIOME_IDS) {
    const generated = data.biomes.biomes.find((entry) => entry.id === biome)
    const table = loadSpeciesTable(100, biome)
    const unique = new Set(idsOf(table))
    const breadthDelta =
      Math.abs(generated.ordinary.length - expectedPoolSize) / expectedPoolSize

    expect(
      breadthDelta,
      `${biome} ordinary pool is outside the SPEC ±15% target`,
    ).toBeLessThanOrEqual(0.15)
    expect(table.length).toBe(
      generated.ordinary.length + generated.special.length,
    )
    expect(
      unique.size,
      `${biome} contains duplicate encounter identities`,
    ).toBe(table.length)

    for (const entry of table) {
      const record = byId.get(entry.id)

      expect(
        record,
        `${biome} references missing species ${entry.id}`,
      ).toBeTruthy()
      expect(record.collectible, `${entry.name} is not collectible`).toBe(true)
      expect(record.battleOnly, `${entry.name} is battle-only`).toBe(false)
      expect(entry.weight).toBeGreaterThan(0)
    }
  }
})

test('no generated biome has an empty encounter pool at any lead level', () => {
  for (const biome of BIOME_IDS) {
    for (let leadLevel = 1; leadLevel <= 100; leadLevel++) {
      expect(
        loadSpeciesTable(leadLevel, biome).length,
        `${biome} became empty at lead level ${leadLevel}`,
      ).toBeGreaterThan(0)
    }
  }
})

test('overlapping generated assignments let the same species belong to more than one biome', () => {
  const meadow = new Set(idsOf(loadSpeciesTable(100, 'meadow')))
  const city = new Set(idsOf(loadSpeciesTable(100, 'city-powerworks')))
  const overlap = [...meadow].filter((id) => city.has(id))

  expect(overlap.length).toBeGreaterThan(0)
  expect(overlap).toContain(132)
})

test('seeded rolls across every biome stay deterministic and preserve substantial variety', () => {
  for (const [index, biome] of BIOME_IDS.entries()) {
    const species = loadSpeciesTable(100, biome)
    const first = rollEncounters({
      steps: 2_000,
      leadLevel: 100,
      rng: makeRng(10_000 + index),
      config: ALWAYS,
      species,
    })
    const replay = rollEncounters({
      steps: 2_000,
      leadLevel: 100,
      rng: makeRng(10_000 + index),
      config: ALWAYS,
      species,
    })
    const unique = new Set(first.map((entry) => entry.species))

    expect(first).toEqual(replay)
    expect(
      unique.size,
      `${biome} rolls collapsed to too few species`,
    ).toBeGreaterThan(60)
  }
})

test('trainer teams stay biome-flavoured without illegal forms or mono-type forcing', () => {
  const data = loadData()
  const species = loadSpeciesTable(60, 'coast')
  const allowed = new Set(idsOf(species))
  const seen = new Set()
  const rng = makeRng(73_211)
  let mixedTeams = 0

  for (let index = 0; index < 300; index++) {
    const trainer = rollTrainer({ rng, leadLevel: 60, species })
    const typeSignatures = new Set()

    for (const mon of trainer.team) {
      const record = data.byId.get(mon.species)

      expect(allowed.has(mon.species)).toBe(true)
      expect(record.collectible).toBe(true)
      expect(record.battleOnly).toBe(false)
      seen.add(mon.species)
      typeSignatures.add(record.types.join('/'))
    }

    if (typeSignatures.size > 1) mixedTeams++
  }

  expect(seen.size).toBeGreaterThan(40)
  expect(mixedTeams).toBeGreaterThan(0)
})
