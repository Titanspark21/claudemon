import { expect, test } from 'vitest'

import { sourceSpeciesIdentity, species } from './data.mjs'
import {
  createPokemon,
  evolveInto,
  legalAbilityAfterEvolution,
  pendingEvolution,
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

test('Should preserve an ability slot nature and held item across evolution', () => {
  const mon = createPokemon(35, 20, makeRng(7))
  const nature = mon.nature

  mon.ability = 'friendguard'
  mon.heldItem = 'everstone'

  expect(legalAbilityAfterEvolution(mon, 36)).toBe('unaware')

  evolveInto(mon, 36)

  expect(mon.ability).toBe('unaware')
  expect(mon.nature).toBe(nature)
  expect(mon.heldItem).toBe('everstone')
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

test('Should return the normalized level evolution rule rather than only its target', () => {
  const mon = createPokemon(4, 16, makeRng(2))
  const rule = pendingEvolution(mon, { trigger: 'level-up', level: 16 })

  expect(rule).toMatchObject({ to: 5, trigger: 'level-up', level: 16 })
})

test('Should apply friendship substitutes but still enforce supported held-item and time conditions', () => {
  const golbat = createPokemon(42, 20, makeRng(3))
  const sneasel = createPokemon(215, 20, makeRng(4))

  expect(pendingEvolution(golbat, { trigger: 'level-up', level: 20 })?.to).toBe(
    169,
  )
  expect(
    pendingEvolution(sneasel, {
      trigger: 'level-up',
      level: 20,
      timeOfDay: 'night',
    }),
  ).toBeNull()

  sneasel.heldItem = 'razor-claw'

  expect(
    pendingEvolution(sneasel, {
      trigger: 'level-up',
      level: 20,
      timeOfDay: 'night',
    })?.to,
  ).toBe(461)
  expect(
    pendingEvolution(sneasel, {
      trigger: 'level-up',
      level: 20,
      timeOfDay: 'day',
    }),
  ).toBeNull()
})

test('Should use time biome gender and an explicit form choice to disambiguate branches', () => {
  const eevee = createPokemon(133, 20, makeRng(5))
  const magneton = createPokemon(82, 20, makeRng(6))
  const espurr = createPokemon(677, 25, makeRng(7))
  const cubone = createPokemon(104, 28, makeRng(8))

  expect(
    pendingEvolution(eevee, {
      trigger: 'level-up',
      level: 20,
      timeOfDay: 'day',
      biome: 'meadow',
      party: [eevee],
    })?.to,
  ).toBe(196)
  expect(
    pendingEvolution(eevee, {
      trigger: 'level-up',
      level: 20,
      timeOfDay: 'night',
      biome: 'meadow',
      party: [eevee],
    })?.to,
  ).toBe(197)
  expect(
    pendingEvolution(magneton, {
      trigger: 'level-up',
      level: 20,
      biome: 'city-powerworks',
    })?.to,
  ).toBe(462)
  expect(
    pendingEvolution(magneton, {
      trigger: 'level-up',
      level: 20,
      biome: 'meadow',
    }),
  ).toBeNull()

  espurr.ivs.attack = 0
  expect(pendingEvolution(espurr, { trigger: 'level-up', level: 25 })?.to).toBe(
    sourceSpeciesIdentity('meowsticf').id,
  )

  expect(
    pendingEvolution(cubone, {
      trigger: 'level-up',
      level: 28,
      timeOfDay: 'night',
      formKey: 'base',
    })?.to,
  ).toBe(105)
  expect(
    pendingEvolution(cubone, {
      trigger: 'level-up',
      level: 28,
      timeOfDay: 'night',
      formKey: 'alola',
    })?.to,
  ).toBe(sourceSpeciesIdentity('marowakalola').id)
})

test('Should fail explicitly when asked to evaluate an unsupported evolution trigger', () => {
  const mon = createPokemon(4, 16, makeRng(9))

  expect(() => pendingEvolution(mon, { trigger: 'dance', level: 16 })).toThrow(
    /unsupported evolution trigger/i,
  )
})
