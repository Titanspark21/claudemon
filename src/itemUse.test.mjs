import { expect, test } from 'vitest'

import { applyItem } from './itemUse.mjs'
import { createPokemon } from './pokemon.mjs'
import { makeRng } from './rng.mjs'

test('Should hand back the item result with no steps when nothing evolved', () => {
  const mon = createPokemon(4, 30, makeRng(1))
  const save = {
    bag: { potion: 1 },
    dex: { seen: [4], caught: [4], faced: {} },
  }

  mon.hp = 1

  const result = applyItem(save, 'potion', mon)

  expect(result.ok).toBe(true)
  expect(result.steps).toEqual([])
  expect(save.dex.caught).toEqual([4])
})

test('Should use a reusable Link Cable and require any trade evolution held item', () => {
  const kadabra = createPokemon(64, 30, makeRng(2))
  const onix = createPokemon(95, 30, makeRng(3))
  const save = {
    bag: { 'link-cable': 1 },
    dex: { seen: [64, 95], caught: [64, 95], faced: {} },
  }

  const plain = applyItem(save, 'link-cable', kadabra)

  expect(plain.ok).toBe(true)
  expect(plain.evolvedInto).toBe(65)
  expect(save.bag['link-cable']).toBe(1)

  const blocked = applyItem(save, 'link-cable', onix)

  expect(blocked.ok).toBe(false)
  expect(onix.species).toBe(95)

  onix.heldItem = 'metal-coat'

  const held = applyItem(save, 'link-cable', onix)

  expect(held.ok).toBe(true)
  expect(held.evolvedInto).toBe(208)
  expect(onix.heldItem).toBe('metal-coat')
  expect(save.bag['link-cable']).toBe(1)
})

test('Should persist the pending choice when an evolution move has no free slot', () => {
  const mon = createPokemon(90, 50, makeRng(4))
  const save = {
    party: [mon],
    moveChoices: [],
    bag: { 'water-stone': 1 },
    dex: { seen: [90], caught: [90], faced: {} },
  }

  const result = applyItem(save, 'water-stone', mon)

  expect(result.steps.map((step) => step.kind)).toContain('learn-choice')
  expect(save.moveChoices).toEqual([{ partyIndex: 0, move: 'icicle-crash' }])
})

test('Should treat generated Gen VII evolution items as usable evolution items', () => {
  const mon = createPokemon(44, 30, makeRng(5))
  const save = {
    bag: { 'sun-stone': 1 },
    dex: { seen: [44], caught: [44], faced: {} },
  }

  const result = applyItem(save, 'sun-stone', mon)

  expect(result.ok).toBe(true)
  expect(result.evolvedInto).toBe(182)
  expect(mon.species).toBe(182)
  expect(save.bag['sun-stone']).toBeUndefined()
})

test('Should fill in the Pokedex and report what the new form knows on an evolution', () => {
  const mon = createPokemon(90, 50, makeRng(4))
  const save = {
    bag: { 'water-stone': 1 },
    dex: { seen: [90], caught: [90], faced: {} },
  }

  mon.moves = mon.moves.slice(0, 2)

  const result = applyItem(save, 'water-stone', mon)

  expect(result.evolvedInto).toBe(91)
  expect(save.dex.caught).toEqual([90, 91])
  expect(result.steps.map((step) => step.move)).toContain('icicle-crash')
  expect(result.steps.every((step) => step.mon === mon)).toBe(true)
})
