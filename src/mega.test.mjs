import { expect, test } from 'vitest'

import { createBattle, submitAction } from './battle.mjs'
import {
  battleAbility,
  battleSpecies,
  battleStats,
  battleTypes,
} from './battleActor.mjs'
import { sourceSpeciesIdentity } from './data.mjs'
import { canMegaEvolve, megaEvolve, revertBattleForm } from './mega.mjs'
import { createPokemon } from './pokemon.mjs'
import { makeRng } from './rng.mjs'
import {
  transformRequestSaveGame,
  transformRequestTrade,
} from './transformers.mjs'

const battleWith = (speciesId, stone, seed = 10) => {
  const player = createPokemon(speciesId, 50, makeRng(seed))
  player.heldItem = stone
  const foe = createPokemon(242, 100, makeRng(seed + 1))

  return {
    player,
    battle: createBattle({ playerMon: player, wildMon: foe, seed }),
  }
}

test('Should match Mega Stones to the correct X and Y battle records', () => {
  const x = battleWith(6, 'charizardite-x')
  const y = battleWith(6, 'charizardite-y')
  const mewtwoX = battleWith(150, 'mewtwonite-x')
  const mewtwoY = battleWith(150, 'mewtwonite-y')

  expect(canMegaEvolve(x.battle, 'player')).toEqual({
    stone: 'charizardite-x',
    targetId: sourceSpeciesIdentity('charizardmegax').id,
  })
  expect(canMegaEvolve(y.battle, 'player')?.targetId).toBe(
    sourceSpeciesIdentity('charizardmegay').id,
  )
  expect(canMegaEvolve(mewtwoX.battle, 'player')?.targetId).toBe(
    sourceSpeciesIdentity('mewtwomegax').id,
  )
  expect(canMegaEvolve(mewtwoY.battle, 'player')?.targetId).toBe(
    sourceSpeciesIdentity('mewtwomegay').id,
  )

  x.player.heldItem = 'venusaurite'
  expect(canMegaEvolve(x.battle, 'player')).toBeNull()
})

test('Should Mega Evolve only the battle actor while preserving permanent identity and HP proportion', () => {
  const { player, battle } = battleWith(6, 'charizardite-x')
  player.hp = Math.floor(player.stats.hp / 2)
  const beforeFraction = player.hp / player.stats.hp

  const events = megaEvolve(battle, 'player')

  expect(events.some((event) => event.type === 'mega')).toBe(true)
  expect(player.species).toBe(6)
  expect(battleSpecies(battle.player)).toBe(
    sourceSpeciesIdentity('charizardmegax').id,
  )
  expect(battleTypes(battle.player)).toEqual(['fire', 'dragon'])
  expect(battleAbility(battle.player)).toBe('toughclaws')
  expect(battleStats(battle.player).attack).toBeGreaterThan(player.stats.attack)
  expect(player.hp / battleStats(battle.player).hp).toBeCloseTo(
    beforeFraction,
    1,
  )
  expect(canMegaEvolve(battle, 'player')).toBeNull()

  revertBattleForm(battle, 'player')
  expect(battleSpecies(battle.player)).toBe(6)
  expect(player.species).toBe(6)
})

test('Should activate the new Mega ability before move resolution', () => {
  const { battle } = battleWith(6, 'charizardite-y')

  const events = submitAction(battle, { type: 'move', index: 1, mega: true })
  const megaIndex = events.findIndex((event) => event.type === 'mega')
  const moveIndex = events.findIndex(
    (event) => event.type === 'message' && event.text.includes(' used '),
  )

  expect(megaIndex).toBeGreaterThanOrEqual(0)
  expect(moveIndex).toBeGreaterThan(megaIndex)
  expect(battle.field.weather?.key).toBe('sun')
  expect(battle.player.mon.species).toBe(6)
})

test('Should automatically revert a Mega when battle ends', () => {
  const { player, battle } = battleWith(6, 'charizardite-x', 16)
  battle.foe.mon.hp = 1

  const events = submitAction(battle, { type: 'move', index: 3, mega: true })

  expect(events.some((event) => event.type === 'mega')).toBe(true)
  expect(
    events.some((event) => event.type === 'end' && event.outcome === 'win'),
  ).toBe(true)
  expect(battle.over).toBe(true)
  expect(battleSpecies(battle.player)).toBe(6)
  expect(player.species).toBe(6)
})

test('Should support an explicit no-turn Mega toggle before choosing a move', () => {
  const { battle } = battleWith(6, 'charizardite-x')

  const events = submitAction(battle, { type: 'mega' })

  expect(events).toContainEqual({
    type: 'mega-toggle',
    side: 'player',
    enabled: true,
  })
  expect(battle.turn).toBe(0)

  submitAction(battle, { type: 'move', index: 1 })
  expect(battleSpecies(battle.player)).toBe(
    sourceSpeciesIdentity('charizardmegax').id,
  )
})

test('Should allow a configured trainer to Mega Evolve under the same side limit', () => {
  const player = createPokemon(242, 100, makeRng(20))
  const foe = createPokemon(6, 50, makeRng(21))
  foe.heldItem = 'charizardite-x'
  foe.trainerMega = true
  const trainer = {
    class: 'Ace Trainer',
    name: 'Test',
    prize: 1,
    team: [foe],
  }
  const battle = createBattle({
    playerMon: player,
    wildMon: foe,
    trainer,
    seed: 22,
  })

  submitAction(battle, { type: 'move', index: 0 })

  expect(battleSpecies(battle.foe)).toBe(
    sourceSpeciesIdentity('charizardmegax').id,
  )
  expect(foe.species).toBe(6)
  expect(canMegaEvolve(battle, 'foe')).toBeNull()
})

test('Should reject battle-only IDs from saves and trades while a live Mega remains persistently normal', () => {
  const { player, battle } = battleWith(6, 'charizardite-x')
  megaEvolve(battle, 'player')

  expect(
    transformRequestSaveGame({
      version: 1,
      trainer: {},
      party: [player],
      box: [],
      daycare: { slots: [], egg: null },
    }).party[0].species,
  ).toBe(6)

  const illegal = {
    ...player,
    species: sourceSpeciesIdentity('charizardmegax').id,
  }
  expect(() =>
    transformRequestSaveGame({
      version: 1,
      trainer: {},
      party: [illegal],
      box: [],
      daycare: { slots: [], egg: null },
    }),
  ).toThrow('battle-only species cannot be persisted')
  expect(() =>
    transformRequestTrade({
      v: 1,
      id: 'illegal',
      mon: illegal,
      from: { name: 'Test', at: 1 },
    }),
  ).toThrow('battle-only species cannot be persisted')
})
