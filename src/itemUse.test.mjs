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
