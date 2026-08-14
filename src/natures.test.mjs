import { expect, test } from 'vitest'

import { NATURE_KEYS, natureModifiers, rollNature } from './natures.mjs'

const EXPECTED = {
  hardy: { raised: null, lowered: null },
  lonely: { raised: 'attack', lowered: 'defense' },
  brave: { raised: 'attack', lowered: 'speed' },
  adamant: { raised: 'attack', lowered: 'spAttack' },
  naughty: { raised: 'attack', lowered: 'spDefense' },
  bold: { raised: 'defense', lowered: 'attack' },
  docile: { raised: null, lowered: null },
  relaxed: { raised: 'defense', lowered: 'speed' },
  impish: { raised: 'defense', lowered: 'spAttack' },
  lax: { raised: 'defense', lowered: 'spDefense' },
  timid: { raised: 'speed', lowered: 'attack' },
  hasty: { raised: 'speed', lowered: 'defense' },
  serious: { raised: null, lowered: null },
  jolly: { raised: 'speed', lowered: 'spAttack' },
  naive: { raised: 'speed', lowered: 'spDefense' },
  modest: { raised: 'spAttack', lowered: 'attack' },
  mild: { raised: 'spAttack', lowered: 'defense' },
  quiet: { raised: 'spAttack', lowered: 'speed' },
  bashful: { raised: null, lowered: null },
  rash: { raised: 'spAttack', lowered: 'spDefense' },
  calm: { raised: 'spDefense', lowered: 'attack' },
  gentle: { raised: 'spDefense', lowered: 'defense' },
  sassy: { raised: 'spDefense', lowered: 'speed' },
  careful: { raised: 'spDefense', lowered: 'spAttack' },
  quirky: { raised: null, lowered: null },
}

test('Should define all 25 natures with only the five neutral ones unmodified', () => {
  expect(NATURE_KEYS).toHaveLength(25)
  expect(new Set(NATURE_KEYS).size).toBe(25)
  expect(
    Object.fromEntries(NATURE_KEYS.map((key) => [key, natureModifiers(key)])),
  ).toEqual(EXPECTED)
})

test('Should roll natures deterministically across the complete table', () => {
  expect(rollNature(() => 0)).toBe('hardy')
  expect(rollNature(() => 0.2)).toBe('bold')
  expect(rollNature(() => 0.999999)).toBe('quirky')
})
