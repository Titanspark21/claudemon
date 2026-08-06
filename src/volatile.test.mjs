import { expect, test } from 'vitest'

import { createPokemon } from './pokemon.mjs'
import { makeRng } from './rng.mjs'
import { statsAtLevel } from './stats.mjs'
import {
  applyFlinch,
  applyVolatileAilment,
  blockedByVolatile,
  emptyVolatile,
  endOfTurnVolatile,
  isMoveDisabled,
  isTrapped,
} from './volatile.mjs'

const aPokemon = (speciesId, level) => {
  const created = createPokemon(speciesId, level, makeRng(1))

  for (const key of Object.keys(created.ivs)) created.ivs[key] = 15

  created.stats = statsAtLevel(speciesId, level, created.ivs)
  created.hp = created.stats.hp

  return created
}

const scriptedRng = (rolls) => {
  let index = 0

  return () => {
    const roll = rolls[index] ?? 0

    index++

    return roll
  }
}

const aBattle = (rolls, playerSpecies = 25, foeSpecies = 16) => {
  return {
    turn: 1,
    rng: scriptedRng(rolls),
    player: {
      mon: aPokemon(playerSpecies, 30),
      volatile: emptyVolatile(),
    },
    foe: { mon: aPokemon(foeSpecies, 30), volatile: emptyVolatile() },
  }
}

const texts = (events) => events.filter((e) => e.text).map((e) => e.text)

test('Should confuse the target for as many turns as it rolled, then let it snap out', () => {
  const battle = aBattle([0, 0, 0])
  const events = []

  applyVolatileAilment(
    battle,
    'foe',
    { ailment: 'confusion', name: 'Confuse Ray' },
    events,
  )

  expect(battle.foe.volatile.confusion).toBe(2)
  expect(texts(events)).toContain('the wild Pidgey became confused!')

  battle.turn = 2

  const first = []
  const hpBefore = battle.foe.mon.hp

  expect(blockedByVolatile(battle, 'foe', first)).toBe(true)
  expect(battle.foe.mon.hp).toBeLessThan(hpBefore)
  expect(texts(first)).toEqual([
    'the wild Pidgey is confused!',
    'It hurt itself in its confusion!',
  ])

  battle.turn = 3

  const last = []

  expect(blockedByVolatile(battle, 'foe', last)).toBe(true)
  expect(
    texts(last),
    'the second rolled turn is spent confused, not skipped',
  ).toEqual([
    'the wild Pidgey is confused!',
    'It hurt itself in its confusion!',
    'the wild Pidgey snapped out of its confusion!',
  ])
  expect(battle.foe.volatile.confusion).toBe(0)

  battle.turn = 4

  expect(blockedByVolatile(battle, 'foe', [])).toBe(false)
})

test('Should leave the target alone on the very turn the confusion lands', () => {
  const battle = aBattle([0.99, 0])
  const events = []

  applyVolatileAilment(battle, 'foe', { ailment: 'confusion' }, events)

  const sameTurn = []

  expect(blockedByVolatile(battle, 'foe', sameTurn)).toBe(false)
  expect(sameTurn).toEqual([])
  expect(battle.foe.volatile.confusion).toBe(5)
})

test('Should not stack a second confusion on an already confused target', () => {
  const battle = aBattle([0, 0])
  const events = []

  applyVolatileAilment(battle, 'foe', { ailment: 'confusion' }, events)
  applyVolatileAilment(battle, 'foe', { ailment: 'confusion' }, events)

  expect(events.filter((e) => e.type === 'volatile')).toHaveLength(1)
})

test('Should make the confused Pokemon act when the coin flip spares it', () => {
  const battle = aBattle([0.99])

  battle.foe.volatile.confusion = 3

  const events = []

  expect(blockedByVolatile(battle, 'foe', events)).toBe(false)
  expect(texts(events)).toEqual(['the wild Pidgey is confused!'])
  expect(battle.foe.mon.hp).toBe(battle.foe.mon.stats.hp)
})

test('Should flinch the target only for the turn the hit landed', () => {
  const battle = aBattle([0])

  applyFlinch(battle, 'foe', { flinchChance: 30 })

  const events = []

  expect(blockedByVolatile(battle, 'foe', events)).toBe(true)
  expect(texts(events)).toEqual([
    'the wild Pidgey flinched and could not move!',
  ])

  battle.turn = 2

  expect(blockedByVolatile(battle, 'foe', [])).toBe(false)
})

test('Should not flinch when the move has no flinch chance or the roll misses', () => {
  const battle = aBattle([0.99])

  applyFlinch(battle, 'foe', { flinchChance: null })

  expect(battle.foe.volatile.flinchTurn).toBe(null)

  applyFlinch(battle, 'foe', { flinchChance: 30 })

  expect(battle.foe.volatile.flinchTurn).toBe(null)
})

test('Should chip the trapped Pokemon each turn and free it when the hold runs out', () => {
  const battle = aBattle([0])
  const events = []

  applyVolatileAilment(battle, 'foe', { ailment: 'trap', name: 'Wrap' }, events)

  expect(isTrapped(battle.foe)).toBe(true)
  expect(texts(events)).toContain('the wild Pidgey was trapped by Wrap!')

  const chip = Math.floor(battle.foe.mon.stats.hp / 16)

  for (const turn of [1, 2]) {
    const hpBefore = battle.foe.mon.hp
    const turnEvents = []

    battle.turn = turn

    endOfTurnVolatile(battle, 'foe', turnEvents)

    expect(battle.foe.mon.hp).toBe(hpBefore - chip)
    expect(texts(turnEvents)).toContain('the wild Pidgey is hurt by Wrap!')
  }

  const freed = []
  const hpBefore = battle.foe.mon.hp

  endOfTurnVolatile(battle, 'foe', freed)

  expect(battle.foe.mon.hp).toBe(hpBefore)
  expect(texts(freed)).toEqual(['the wild Pidgey was freed from Wrap!'])
  expect(isTrapped(battle.foe)).toBe(false)
})

test('Should sap the seeded Pokemon and hand the health to the other side', () => {
  const battle = aBattle([])
  const events = []

  battle.player.mon.hp = 1

  applyVolatileAilment(battle, 'foe', { ailment: 'leech-seed' }, events)
  applyVolatileAilment(battle, 'foe', { ailment: 'leech-seed' }, events)

  expect(texts(events)).toEqual(['the wild Pidgey was seeded!'])

  const drain = []
  const sapped = Math.floor(battle.foe.mon.stats.hp / 8)
  const foeBefore = battle.foe.mon.hp

  endOfTurnVolatile(battle, 'foe', drain)

  expect(battle.foe.mon.hp).toBe(foeBefore - sapped)
  expect(battle.player.mon.hp).toBe(1 + sapped)
  expect(texts(drain)).toEqual([
    "the wild Pidgey's health is sapped by Leech Seed!",
  ])
})

test('Should refuse to seed a Grass type', () => {
  const battle = aBattle([], 25, 1)
  const events = []

  applyVolatileAilment(battle, 'foe', { ailment: 'leech-seed' }, events)

  expect(battle.foe.volatile.leechSeed).toBe(false)
  expect(texts(events)).toEqual(['But it failed!'])
})

test('Should disable one move with PP and lift it once the count runs out', () => {
  const battle = aBattle([0, 0])
  const events = []

  applyVolatileAilment(battle, 'foe', { ailment: 'disable' }, events)

  expect(isMoveDisabled(battle.foe, 0)).toBe(true)
  expect(isMoveDisabled(battle.foe, 1)).toBe(false)
  expect(texts(events)[0]).toMatch(/^the wild Pidgey's .+ was disabled!$/)

  endOfTurnVolatile(battle, 'foe', [])

  expect(
    battle.foe.volatile.disable.turns,
    'the landing turn does not burn a tick',
  ).toBe(2)

  battle.turn = 2
  endOfTurnVolatile(battle, 'foe', [])

  expect(isMoveDisabled(battle.foe, 0)).toBe(true)

  battle.turn = 3

  const lifted = []

  endOfTurnVolatile(battle, 'foe', lifted)

  expect(isMoveDisabled(battle.foe, 0)).toBe(false)
  expect(texts(lifted)[0]).toMatch(
    /^the wild Pidgey's .+ is no longer disabled!$/,
  )
})

test('Should fail to disable a Pokemon with no PP left anywhere', () => {
  const battle = aBattle([0])
  const events = []

  for (const slot of battle.foe.mon.moves) slot.pp = 0

  applyVolatileAilment(battle, 'foe', { ailment: 'disable' }, events)

  expect(battle.foe.volatile.disable).toBe(null)
  expect(texts(events)).toEqual(['But it failed!'])
})

test('Should skip every end-of-turn effect once the Pokemon has fainted', () => {
  const battle = aBattle([0])

  battle.foe.volatile.leechSeed = true
  battle.foe.mon.hp = 0

  const events = []

  endOfTurnVolatile(battle, 'foe', events)

  expect(events).toEqual([])
})
