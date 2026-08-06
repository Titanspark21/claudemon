import { expect, test } from 'vitest'

import { IV_MAX, STAT_NAMES } from './constants.mjs'
import { makeRng } from './rng.mjs'
import { rollIvs, statsAtLevel } from './stats.mjs'

test('Should grow stats with level and carry the flat HP bonus', () => {
  const low = statsAtLevel(
    4,
    5,
    Object.fromEntries(
      ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'].map((k) => [
        k,
        15,
      ]),
    ),
  )
  const high = statsAtLevel(
    4,
    50,
    Object.fromEntries(
      ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'].map((k) => [
        k,
        15,
      ]),
    ),
  )

  for (const stat of Object.keys(low)) {
    expect(high[stat]).toBeGreaterThan(low[stat])
  }

  expect(low.hp).toBeGreaterThanOrEqual(17)
  expect(low.hp).toBeLessThanOrEqual(22)
})

test('Should roll an in-range IV for every stat', () => {
  const ivs = rollIvs(makeRng(7))

  expect(Object.keys(ivs)).toEqual(STAT_NAMES)

  for (const stat of STAT_NAMES) {
    expect(ivs[stat]).toBeGreaterThanOrEqual(0)
    expect(ivs[stat]).toBeLessThanOrEqual(IV_MAX)
  }
})
