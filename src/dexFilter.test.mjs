import { expect, test } from 'vitest'
import {
  DEFAULT_DEX_FILTER,
  dexCompletion,
  filterDex,
  generationForDexNumber,
  nextDexFilter,
} from './dexFilter.mjs'

const entry = (overrides = {}) => ({
  id: 1,
  name: 'Bulbasaur',
  sourceKey: 'bulbasaur',
  dexNumber: 1,
  baseSpecies: 1,
  formKey: null,
  collectible: true,
  battleOnly: false,
  types: ['grass', 'poison'],
  biomes: ['meadow', 'forest'],
  caught: false,
  seen: false,
  shiny: false,
  ...overrides,
})

const FIXTURE = [
  entry(),
  entry({
    id: 25,
    name: 'Pikachu',
    sourceKey: 'pikachu',
    dexNumber: 25,
    baseSpecies: 25,
    types: ['electric'],
    biomes: ['meadow', 'city-powerworks'],
    caught: true,
    seen: true,
    shiny: true,
  }),
  entry({
    id: 669,
    name: 'Flabébé',
    sourceKey: 'flabebe',
    dexNumber: 669,
    baseSpecies: 669,
    types: ['fairy'],
    biomes: ['meadow', 'mystic-ruins'],
    seen: true,
  }),
  entry({
    id: 10001,
    name: 'Rattata-Alola',
    sourceKey: 'rattataalola',
    dexNumber: 19,
    baseSpecies: 19,
    formKey: 'alola',
    types: ['dark', 'normal'],
    biomes: ['city-powerworks'],
    caught: true,
    seen: true,
  }),
  entry({
    id: 20002,
    name: 'Charizard-Mega-X',
    sourceKey: 'charizardmegax',
    dexNumber: 6,
    baseSpecies: 6,
    formKey: 'megax',
    collectible: false,
    battleOnly: true,
    types: ['fire', 'dragon'],
    biomes: [],
    seen: true,
  }),
]

test('Should combine name, generation, type, biome, status, shiny and form filters', () => {
  expect(
    filterDex(FIXTURE, {
      query: 'PIKA',
      generation: 1,
      type: 'electric',
      biome: 'city-powerworks',
      status: 'caught',
      shiny: true,
      form: 'base',
    }).map((mon) => mon.id),
  ).toEqual([25])
})

test('Should search names without caring about case or accents', () => {
  expect(filterDex(FIXTURE, { query: 'FLABEBE' }).map((mon) => mon.id)).toEqual(
    [669],
  )
  expect(filterDex(FIXTURE, { query: 'flabé' }).map((mon) => mon.id)).toEqual([
    669,
  ])
})

test('Should search National numbers and synthetic numeric IDs exactly', () => {
  expect(filterDex(FIXTURE, { query: '19' }).map((mon) => mon.id)).toEqual([
    10001,
  ])
  expect(filterDex(FIXTURE, { query: '10001' }).map((mon) => mon.id)).toEqual([
    10001,
  ])
  expect(filterDex(FIXTURE, { query: '20002' }).map((mon) => mon.id)).toEqual([
    20002,
  ])
})

test('Should separate base species from synthetic forms', () => {
  expect(filterDex(FIXTURE, { form: 'forms' }).map((mon) => mon.id)).toEqual([
    10001, 20002,
  ])
  expect(filterDex(FIXTURE, { form: 'base' }).some((mon) => mon.formKey)).toBe(
    false,
  )
})

test('Should distinguish caught, seen-only and unseen results', () => {
  expect(filterDex(FIXTURE, { status: 'caught' }).map((mon) => mon.id)).toEqual(
    [25, 10001],
  )
  expect(filterDex(FIXTURE, { status: 'seen' }).map((mon) => mon.id)).toEqual([
    669, 20002,
  ])
  expect(filterDex(FIXTURE, { status: 'unseen' }).map((mon) => mon.id)).toEqual(
    [1],
  )
})

test('Should return an empty list when no entry satisfies every active filter', () => {
  expect(
    filterDex(FIXTURE, {
      query: 'pikachu',
      type: 'water',
      status: 'unseen',
    }),
  ).toEqual([])
})

test('Should derive generations from National numbers, including forms', () => {
  expect([
    generationForDexNumber(1),
    generationForDexNumber(152),
    generationForDexNumber(252),
    generationForDexNumber(387),
    generationForDexNumber(494),
    generationForDexNumber(650),
    generationForDexNumber(722),
    generationForDexNumber(809),
  ]).toEqual([1, 2, 3, 4, 5, 6, 7, 7])
  expect(filterDex(FIXTURE, { generation: 1 }).map((mon) => mon.id)).toContain(
    10001,
  )
})

test('Should update one filter without mutating the previous state and reset cleanly', () => {
  const current = { ...DEFAULT_DEX_FILTER, query: 'pika', type: 'electric' }
  const next = nextDexFilter(current, { field: 'status', value: 'caught' })

  expect(next).toEqual({ ...current, status: 'caught' })
  expect(current.status).toBe(null)
  expect(nextDexFilter(next, { reset: true })).toEqual(DEFAULT_DEX_FILTER)
})

test('Should cycle a filter through supplied values and back to all', () => {
  const first = nextDexFilter(DEFAULT_DEX_FILTER, {
    field: 'generation',
    values: [1, 2, 3],
  })
  const second = nextDexFilter(first, {
    field: 'generation',
    values: [1, 2, 3],
  })
  const all = nextDexFilter(
    { ...DEFAULT_DEX_FILTER, generation: 3 },
    { field: 'generation', values: [1, 2, 3] },
  )

  expect(first.generation).toBe(1)
  expect(second.generation).toBe(2)
  expect(all.generation).toBe(null)
})

test('Should handle the extended form, biome and fallback filter values', () => {
  const richer = [
    ...FIXTURE,
    entry({
      id: 10050,
      name: 'Test-Cosplay',
      sourceKey: 'testcosplay',
      dexNumber: 25,
      baseSpecies: 25,
      formKey: 'cosplay-star',
      collectible: true,
      battleOnly: false,
      biomes: [{ id: 'meadow' }],
    }),
  ]

  expect(
    filterDex(richer, { form: 'collectible' }).map((mon) => mon.id),
  ).toEqual([10001, 10050])
  expect(
    filterDex(richer, { form: 'battle-only' }).map((mon) => mon.id),
  ).toEqual([20002])
  expect(filterDex(richer, { form: 'form' }).map((mon) => mon.id)).toEqual([
    10001, 20002, 10050,
  ])
  expect(
    filterDex(richer, { form: 'cosplay star' }).map((mon) => mon.id),
  ).toEqual([10050])
  expect(filterDex(richer, { biome: 'meadow' }).map((mon) => mon.id)).toContain(
    10050,
  )
  expect(filterDex(richer, { status: 'anything' })).toEqual(richer)
})

test('Should reject invalid National numbers and leave unknown reducer input alone', () => {
  expect(generationForDexNumber(0)).toBe(null)
  expect(generationForDexNumber(810)).toBe(null)
  expect(generationForDexNumber('nope')).toBe(null)

  const current = { ...DEFAULT_DEX_FILTER, query: 'eevee' }
  expect(nextDexFilter(current, { field: 'unknown' })).toEqual(current)
  expect(nextDexFilter(current, { field: 'query' })).toEqual(current)
  expect(nextDexFilter()).toEqual(DEFAULT_DEX_FILTER)
})

test('Should accept Set-backed and legacy form collections when counting completion', () => {
  const dataset = [
    entry(),
    entry({
      id: 10001,
      dexNumber: 1,
      baseSpecies: 1,
      formKey: 'regional',
      collectible: true,
    }),
  ]
  const save = {
    dex: { caught: new Set([1]), seen: [], shiny: [] },
    forms: { caught: new Set([10001]) },
  }

  expect(dexCompletion(save, dataset)).toEqual({
    nationalCaught: 1,
    nationalTotal: 1,
    formsCaught: 1,
    formsTotal: 1,
  })
})

test('Should count 809 National species separately from collectible forms', () => {
  const base = Array.from({ length: 809 }, (_, index) =>
    entry({
      id: index + 1,
      name: `Species ${index + 1}`,
      sourceKey: `species${index + 1}`,
      dexNumber: index + 1,
      baseSpecies: index + 1,
      types: ['normal'],
      biomes: [],
    }),
  )
  const dataset = [
    ...base,
    entry({
      id: 10001,
      dexNumber: 19,
      baseSpecies: 19,
      formKey: 'alola',
      collectible: true,
    }),
    entry({
      id: 10002,
      dexNumber: 20,
      baseSpecies: 20,
      formKey: 'alola',
      collectible: true,
    }),
    entry({
      id: 20002,
      dexNumber: 6,
      baseSpecies: 6,
      formKey: 'megax',
      collectible: false,
      battleOnly: true,
    }),
  ]
  const save = {
    dex: {
      caught: [1, 19, 10001],
      seen: [1, 19],
      shiny: [],
      forms: { caught: [10001] },
    },
  }

  expect(dexCompletion(save, dataset)).toEqual({
    nationalCaught: 2,
    nationalTotal: 809,
    formsCaught: 1,
    formsTotal: 2,
  })
})
