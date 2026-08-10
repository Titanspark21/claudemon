import { expect, test } from 'vitest'

import { allPokemon, canSpare, pickLevel, pokemonList } from './helpers.mjs'
import { makeRng } from './rng.mjs'

const SPREAD = { min: 2, fallbackMax: 5, below: 3, above: 2, ceiling: 100 }

const levels = (count, leadLevel, spread = SPREAD) => {
  const rng = makeRng(77)
  const rolled = []

  for (let index = 0; index < count; index++) {
    rolled.push(pickLevel(rng, leadLevel, spread))
  }

  return rolled
}

test('Should stay inside the band the spread opens around the lead', () => {
  for (const level of levels(200, 20)) {
    expect(level).toBeGreaterThanOrEqual(17)
    expect(level).toBeLessThanOrEqual(22)
  }
})

test('Should fall back on the starter band when there is no lead to measure against', () => {
  for (const leadLevel of [null, 0, undefined]) {
    for (const level of levels(50, leadLevel)) {
      expect(level).toBeGreaterThanOrEqual(2)
      expect(level).toBeLessThanOrEqual(5)
    }
  }
})

test('Should never drop below the floor nor climb past the ceiling', () => {
  for (const level of levels(200, 1)) {
    expect(
      level,
      'the floor holds under a level one lead',
    ).toBeGreaterThanOrEqual(2)
    expect(level).toBeLessThanOrEqual(3)
  }

  for (const level of levels(200, 100)) {
    expect(level).toBeGreaterThanOrEqual(97)
    expect(level).toBeLessThanOrEqual(100)
  }
})

test('Should collapse to the floor rather than invert when the spread reaches past it', () => {
  const tight = { min: 30, fallbackMax: 5, below: 3, above: 2, ceiling: 100 }

  for (const level of levels(50, 10, tight)) {
    expect(level, 'a floor above the lead wins, and the band never flips').toBe(
      30,
    )
  }
})

test('Should gather every Pokemon you own across the party, the box and the day care', () => {
  const save = {
    party: [{ species: 1 }],
    box: [{ species: 2 }],
    daycare: { slots: [{ species: 3 }], egg: null },
  }

  expect(allPokemon(save).map((mon) => mon.species)).toEqual([1, 2, 3])
  expect(allPokemon({ party: [], box: [], daycare: { slots: [] } })).toEqual([])
})

test('Should resolve a collection by the name callers pass around', () => {
  const save = { party: [{ species: 1 }], box: [{ species: 2 }] }

  expect(pokemonList(save, 'party')).toBe(save.party)
  expect(pokemonList(save, 'box')).toBe(save.box)
})

test('Should spare anything from the box but never the last of the party', () => {
  const alone = { party: [{ species: 1 }], box: [{ species: 2 }] }
  const pair = { party: [{ species: 1 }, { species: 4 }], box: [] }

  expect(canSpare(alone, 'party'), 'somebody has to fight').toBe(false)
  expect(canSpare(alone, 'box'), 'the box has no such rule').toBe(true)
  expect(canSpare(pair, 'party')).toBe(true)
})
