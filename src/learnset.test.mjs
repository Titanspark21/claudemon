import { expect, test } from 'vitest'

import { move as moveOf } from './data.mjs'
import { movesAtLevel, movesLearnedAt } from './learnset.mjs'

test('Should keep the last four moves learned as the natural moveset', () => {
  const early = movesAtLevel(4, 1)

  expect(early.length).toBeGreaterThanOrEqual(1)
  expect(early).toContain('scratch')

  const late = movesAtLevel(4, 100)

  expect(late).toHaveLength(4)
  expect(new Set(late).size).toBe(4)
  expect(late).toEqual(['rage', 'slash', 'flamethrower', 'fire-spin'])
})

test('Should lead a starter with a move that attacks', () => {
  for (const speciesId of [1, 4, 7, 25]) {
    const first = moveOf(movesAtLevel(speciesId, 1)[0])

    expect(first.damageClass).not.toBe('status')
  }
})

test('Should give every Pokemon something to attack with', () => {
  for (const speciesId of [1, 4, 7, 16, 19, 25, 74, 143, 150]) {
    for (const level of [1, 5, 20, 50, 100]) {
      const moves = movesAtLevel(speciesId, level)

      expect(moves.some((name) => moveOf(name).damageClass !== 'status')).toBe(
        true,
      )
    }
  }
})

test('Should report only the moves learned exactly at that level', () => {
  expect(movesLearnedAt(4, 9)).toEqual(['ember'])
  expect(movesLearnedAt(4, 10)).toEqual([])
  expect(movesLearnedAt(4, 1)).toEqual(['growl', 'scratch'])
})
