import { describe, expect, test } from 'vitest'

import { createBattle } from './battle.mjs'
import { createGymRun, rollbackGymRun } from './gym.mjs'
import {
  awardProgressionHeldItems,
  consumeHeldItem,
  equipHeldItem,
  rollWildHeldItem,
  unequipHeldItem,
} from './heldItems.mjs'
import { createPokemon } from './pokemon.mjs'
import { makeRng } from './rng.mjs'
import { shopStock } from './shop.mjs'

const mon = (species = 25, seed = 1) =>
  createPokemon(species, 25, makeRng(seed))

const saveWith = (...party) => ({
  party,
  box: [],
  daycare: { slots: [], egg: null },
  bag: {},
  badges: [],
  money: 50_000,
})

describe('held item inventory lifecycle', () => {
  test('equips, safely swaps, and unequips without duplicating inventory', () => {
    const pikachu = mon()
    const save = saveWith(pikachu)

    save.bag.charcoal = 1
    save.bag.leftovers = 1

    expect(equipHeldItem(save, pikachu, 'charcoal')).toMatchObject({
      ok: true,
      returnedItem: null,
    })
    expect(pikachu.heldItem).toBe('charcoal')
    expect(save.bag.charcoal).toBeUndefined()

    expect(equipHeldItem(save, pikachu, 'leftovers')).toMatchObject({
      ok: true,
      returnedItem: 'charcoal',
    })
    expect(pikachu.heldItem).toBe('leftovers')
    expect(save.bag.leftovers).toBeUndefined()
    expect(save.bag.charcoal).toBe(1)

    expect(unequipHeldItem(save, pikachu)).toMatchObject({
      ok: true,
      item: 'leftovers',
    })
    expect(pikachu.heldItem).toBeNull()
    expect(save.bag.leftovers).toBe(1)
  })

  test('rejects missing inventory, invalid selections, and redundant held-item actions', () => {
    const pikachu = mon()
    const save = saveWith(pikachu)

    expect(equipHeldItem(save, null, 'leftovers')).toMatchObject({ ok: false })
    expect(unequipHeldItem(save, pikachu)).toMatchObject({
      ok: false,
      item: null,
    })
    expect(equipHeldItem(save, pikachu, 'leftovers')).toMatchObject({
      ok: false,
    })

    save.bag['poke-ball'] = 1
    expect(equipHeldItem(save, pikachu, 'poke-ball')).toMatchObject({
      ok: false,
    })
    expect(save.bag['poke-ball']).toBe(1)
    expect(pikachu.heldItem).toBeNull()

    save.bag.leftovers = 1
    expect(equipHeldItem(save, pikachu, 'leftovers')).toMatchObject({
      ok: true,
    })
    save.bag.leftovers = 1
    expect(equipHeldItem(save, pikachu, 'leftovers')).toMatchObject({
      ok: false,
    })
    expect(save.bag.leftovers).toBe(1)
  })

  test('prevents assigning the same unique Mega Stone to two Pokémon', () => {
    const first = mon(1, 2)
    const second = mon(2, 3)
    const save = saveWith(first, second)

    save.bag.venusaurite = 2

    expect(equipHeldItem(save, first, 'venusaurite').ok).toBe(true)
    expect(equipHeldItem(save, second, 'venusaurite').ok).toBe(false)
    expect(first.heldItem).toBe('venusaurite')
    expect(second.heldItem).toBeNull()
    expect(save.bag.venusaurite).toBe(1)
  })
})

describe('held item battle lifecycle', () => {
  test('consumes a held item exactly once and journals the cause', () => {
    const player = mon()
    const foe = mon(1, 2)
    const battle = createBattle({ playerMon: player, wildMon: foe, seed: 5 })
    const events = []

    player.heldItem = 'sitrus-berry'

    expect(consumeHeldItem(battle, 'player', 'berry', events)).toBe(true)
    expect(consumeHeldItem(battle, 'player', 'berry', events)).toBe(false)
    expect(player.heldItem).toBeNull()
    expect(battle.consumedHeldItems).toEqual([
      { side: 'player', item: 'sitrus-berry', cause: 'berry', turn: 0 },
    ])
    expect(events.filter((event) => event.action === 'consumed')).toHaveLength(
      1,
    )
  })

  test('gym rollback restores a consumed held item from the run snapshot', () => {
    const player = mon()
    const save = saveWith(player)

    player.heldItem = 'focus-sash'

    const run = createGymRun({ gym: { id: 'test-gym' }, seed: 9, save })
    const battle = createBattle({
      playerMon: player,
      wildMon: mon(1, 4),
      seed: 10,
    })

    consumeHeldItem(battle, 'player', 'focus-sash')
    expect(player.heldItem).toBeNull()

    const restored = rollbackGymRun(run)
    expect(restored.party[0].heldItem).toBe('focus-sash')
  })
})

describe('held item acquisition', () => {
  test('uses deterministic common, rare, and empty wild held-item bands', () => {
    expect(rollWildHeldItem(25, 'ultra-sun-ultra-moon', () => 0.1)).toBe(
      'oran-berry',
    )
    expect(rollWildHeldItem(25, 'ultra-sun-ultra-moon', () => 0.52)).toBe(
      'light-ball',
    )
    expect(rollWildHeldItem(25, 'ultra-sun-ultra-moon', () => 0.9)).toBeNull()
    expect(rollWildHeldItem(25, 'black-white', () => 0)).toBeNull()
  })

  test('badge gates common shop-held items', () => {
    const save = saveWith(mon())

    expect(shopStock(save)).toContain('oran-berry')
    expect(shopStock(save)).not.toContain('life-orb')

    save.badges = Array.from({ length: 7 }, (_, index) => `badge-${index}`)
    expect(shopStock(save)).toContain('life-orb')
  })

  test('badge progression awards rare items and a compatible Mega Stone once', () => {
    const save = saveWith(mon(3))

    save.badges = ['badge-1']
    expect(awardProgressionHeldItems(save, 0)).toEqual(['quick-claw'])
    expect(save.bag['quick-claw']).toBe(1)

    save.badges.push('badge-2')
    expect(awardProgressionHeldItems(save, 1)).toEqual(['king-s-rock'])
    expect(save.bag['king-s-rock']).toBe(1)

    save.badges = Array.from({ length: 8 }, (_, index) => `badge-${index + 1}`)
    const final = awardProgressionHeldItems(save, 7)

    expect(final).toEqual(['venusaurite'])
    expect(save.bag.venusaurite).toBe(1)
    expect(awardProgressionHeldItems(save, 8)).toEqual([])
  })
})
