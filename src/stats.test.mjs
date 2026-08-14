import { expect, test } from 'vitest'

import { IV_MAX, STAT_NAMES } from './constants.mjs'
import { makeRng } from './rng.mjs'
import { ivPercentage, rollIvs, statsAtLevel } from './stats.mjs'

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

test('Should apply nature after the base IV stat formula and never modify HP', () => {
  const ivs = Object.fromEntries(STAT_NAMES.map((stat) => [stat, 15]))
  const neutral = statsAtLevel(4, 50, ivs, 'hardy')
  const adamant = statsAtLevel(4, 50, ivs, 'adamant')

  expect(adamant.hp).toBe(neutral.hp)
  expect(adamant.attack).toBe(Math.floor(neutral.attack * 1.1))
  expect(adamant.spAttack).toBe(Math.floor(neutral.spAttack * 0.9))
  expect(adamant.defense).toBe(neutral.defense)
  expect(adamant.speed).toBe(neutral.speed)
})

test('Should report IV percentage over all six stats', () => {
  expect(
    ivPercentage(Object.fromEntries(STAT_NAMES.map((stat) => [stat, 0]))),
  ).toBe(0)
  expect(
    ivPercentage(Object.fromEntries(STAT_NAMES.map((stat) => [stat, IV_MAX]))),
  ).toBe(100)
  expect(
    ivPercentage(Object.fromEntries(STAT_NAMES.map((stat) => [stat, 15]))),
  ).toBeCloseTo((15 / IV_MAX) * 100)
})
