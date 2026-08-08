import { expect, test } from 'vitest'

import { createPokemon } from '../pokemon.mjs'
import { makeRng } from '../rng.mjs'
import { EVOLVES_MARK, LEVEL_EVO_PREFIX, SHINY_MARK } from './constants.mjs'
import { stripAnsi } from './text.mjs'
import { evolutionTag, shinyTag } from './widgets.mjs'

test('Should tag a stone evolution with a star and a level evolution with its level', () => {
  const rng = makeRng(7)

  expect(stripAnsi(evolutionTag(createPokemon(25, 12, rng)))).toBe(
    ` ${EVOLVES_MARK}`,
  )
  expect(stripAnsi(evolutionTag(createPokemon(4, 10, rng)))).toBe(
    ` ${LEVEL_EVO_PREFIX}16`,
  )
  expect(evolutionTag(createPokemon(6, 40, rng))).toBe('')
})

test('Should tag a shiny with a star and leave an ordinary one unmarked', () => {
  expect(stripAnsi(shinyTag(true))).toBe(` ${SHINY_MARK}`)
  expect(shinyTag(false)).toBe('')
})

test('Should brighten the level tag once the Pokemon is old enough to evolve', () => {
  const rng = makeRng(7)

  const waiting = evolutionTag(createPokemon(4, 10, rng))
  const ready = evolutionTag(createPokemon(4, 16, rng))

  expect(stripAnsi(waiting)).toBe(stripAnsi(ready))
  expect(waiting).not.toBe(ready)
})
