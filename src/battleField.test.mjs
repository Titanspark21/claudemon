import { expect, test } from 'vitest'
import {
  createBattleField,
  normalizeBattleField,
  replaceFieldEffect,
} from './battleField.mjs'

test('Should create and normalize battle field state', () => {
  expect(createBattleField()).toEqual({ weather: null, terrain: null })
  expect(normalizeBattleField()).toEqual({ weather: null, terrain: null })
})

test('Should replace field effects independently', () => {
  const field = createBattleField()

  replaceFieldEffect(field, 'weather', { key: 'rain', turns: 5 })
  replaceFieldEffect(field, 'terrain', { key: 'electric', turns: 5 })
  replaceFieldEffect(field, 'weather', null)

  expect(field).toEqual({
    weather: null,
    terrain: { key: 'electric', turns: 5 },
  })
})

test('Should reject unknown field effect kinds', () => {
  expect(() => replaceFieldEffect(createBattleField(), 'room', {})).toThrow(
    'Unknown field effect',
  )
})
