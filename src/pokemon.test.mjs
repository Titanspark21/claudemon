import { expect, test } from 'vitest'

import { species } from './data.mjs'
import {
  createPokemon,
  evolveInto,
  legalAbilityAfterEvolution,
  rollAbility,
} from './pokemon.mjs'
import { makeRng } from './rng.mjs'

test('Should give every new Pokemon stable nature ability and held-item fields', () => {
  const first = createPokemon(16, 5, makeRng(123))
  const again = createPokemon(16, 5, makeRng(123))

  expect(first).toEqual(again)
  expect(typeof first.nature).toBe('string')
  expect(
    species(16).abilities.some((slot) => slot.ability === first.ability),
  ).toBe(true)
  expect(first.heldItem).toBeNull()
})

test('Should roll a hidden ability only below the rarity boundary then roll normal slots evenly', () => {
  expect(rollAbility(16, () => 0, 0.05)).toBe('bigpecks')

  const boundaryRolls = [0.05, 0]
  expect(rollAbility(16, () => boundaryRolls.shift(), 0.05)).toBe('keeneye')

  const secondNormal = [0.9, 0.75]
  expect(rollAbility(16, () => secondNormal.shift(), 0.05)).toBe('tangledfeet')
})

test('Should preserve an ability slot across evolution even when its ability name changes', () => {
  const mon = createPokemon(35, 20, makeRng(7))
  mon.ability = 'friendguard'

  expect(legalAbilityAfterEvolution(mon, 36)).toBe('unaware')

  evolveInto(mon, 36)

  expect(mon.ability).toBe('unaware')
})

test('Should use a deterministic legal fallback when the old ability slot does not exist', () => {
  const mon = createPokemon(10, 10, makeRng(7))
  mon.ability = 'runaway'

  expect(legalAbilityAfterEvolution(mon, 11)).toBe('shedskin')

  evolveInto(mon, 11)

  expect(mon.ability).toBe('shedskin')
})

test('Should preserve current HP proportion across evolution and keep fainted Pokemon fainted', () => {
  const healthy = createPokemon(1, 30, makeRng(9))
  healthy.hp = Math.floor(healthy.stats.hp / 2)
  const fraction = healthy.hp / healthy.stats.hp

  evolveInto(healthy, 2)

  expect(healthy.hp).toBe(Math.max(1, Math.round(healthy.stats.hp * fraction)))

  const fainted = createPokemon(1, 30, makeRng(9))
  fainted.hp = 0
  evolveInto(fainted, 2)
  expect(fainted.hp).toBe(0)
})
