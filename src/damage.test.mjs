import { expect, test } from 'vitest'

import { baseDamage } from './damage.mjs'

test('Should scale with the level, the power and the attack-to-defense ratio', () => {
  expect(baseDamage({ level: 50, power: 40, attack: 100, defense: 100 })).toBe(
    19,
  )

  expect(baseDamage({ level: 100, power: 40, attack: 100, defense: 100 })).toBe(
    35,
  )

  expect(baseDamage({ level: 50, power: 80, attack: 100, defense: 100 })).toBe(
    37,
  )

  expect(baseDamage({ level: 50, power: 40, attack: 200, defense: 100 })).toBe(
    37,
  )

  expect(baseDamage({ level: 50, power: 40, attack: 100, defense: 200 })).toBe(
    10,
  )
})

test('Should never drop below the flat bonus, however lopsided the stats', () => {
  expect(baseDamage({ level: 1, power: 1, attack: 1, defense: 999 })).toBe(2)
})
