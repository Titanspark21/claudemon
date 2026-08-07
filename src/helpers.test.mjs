import { expect, test } from 'vitest'

import { pickLevel } from './helpers.mjs'
import { makeRng } from './rng.mjs'

const SPREAD = { min: 2, fallbackMax: 5, below: 3, above: 2, ceiling: 100 }

const levels = (count, leadLevel, spread = SPREAD) => {
  const rng = makeRng(77)
  const rolled = []

  for (let index = 0; index < count; index++) {
    rolled.push(pickLevel(rng, leadLevel, spread))
  }

  return rolled
}

test('Should stay inside the band the spread opens around the lead', () => {
  for (const level of levels(200, 20)) {
    expect(level).toBeGreaterThanOrEqual(17)
    expect(level).toBeLessThanOrEqual(22)
  }
})

test('Should fall back on the starter band when there is no lead to measure against', () => {
  for (const leadLevel of [null, 0, undefined]) {
    for (const level of levels(50, leadLevel)) {
      expect(level).toBeGreaterThanOrEqual(2)
      expect(level).toBeLessThanOrEqual(5)
    }
  }
})

test('Should never drop below the floor nor climb past the ceiling', () => {
  for (const level of levels(200, 1)) {
    expect(
      level,
      'the floor holds under a level one lead',
    ).toBeGreaterThanOrEqual(2)
    expect(level).toBeLessThanOrEqual(3)
  }

  for (const level of levels(200, 100)) {
    expect(level).toBeGreaterThanOrEqual(97)
    expect(level).toBeLessThanOrEqual(100)
  }
})

test('Should collapse to the floor rather than invert when the spread reaches past it', () => {
  const tight = { min: 30, fallbackMax: 5, below: 3, above: 2, ceiling: 100 }

  for (const level of levels(50, 10, tight)) {
    expect(level, 'a floor above the lead wins, and the band never flips').toBe(
      30,
    )
  }
})
