import { expect, test } from 'vitest'

import {
  expForLevel,
  expFromDefeating,
  expProgress,
  levelFromExp,
  moneyFromDefeating,
} from './exp.mjs'
import { makeRng } from './rng.mjs'

test('Should agree between the experience curve and the level in both directions', () => {
  for (const speciesId of [1, 25, 143, 150]) {
    for (const level of [1, 2, 10, 37, 99, 100]) {
      const exp = expForLevel(speciesId, level)

      expect(levelFromExp(speciesId, exp)).toBe(level)
    }
  }
})

test('Should still read as the level below one experience point short', () => {
  const exp = expForLevel(4, 20)

  expect(levelFromExp(4, exp)).toBe(20)
  expect(levelFromExp(4, exp - 1)).toBe(19)
})

test('Should report a sane fraction of progress into the level', () => {
  const start = expForLevel(4, 10)
  const next = expForLevel(4, 11)
  const halfway = start + Math.floor((next - start) / 2)

  const progress = expProgress(4, halfway)

  expect(progress.level).toBe(10)
  expect(progress.fraction).toBeGreaterThan(0.4)
  expect(progress.fraction).toBeLessThan(0.6)
})

test('Should report a full bar with nothing left to earn at the level cap', () => {
  expect(expProgress(4, expForLevel(4, 100))).toEqual({
    level: 100,
    into: 0,
    needed: 0,
    fraction: 1,
  })
})

test('Should be worth more experience to beat something bigger', () => {
  expect(expFromDefeating(16, 20)).toBeGreaterThan(expFromDefeating(16, 5))
  expect(expFromDefeating(143, 10)).toBeGreaterThan(expFromDefeating(10, 10))
})

test('Should pay a level-scaled prize with jitter on top', () => {
  const payout = moneyFromDefeating(10, makeRng(3))

  expect(payout).toBeGreaterThanOrEqual(120)
  expect(payout).toBeLessThanOrEqual(160)
})
