import { expect, test } from 'vitest'

import { effectiveSpeed, moveSlotOf, stageMultiplier } from './battleActor.mjs'

test('Should raise the multiplier on positive stages and shrink it on negative ones', () => {
  expect(stageMultiplier(0)).toBe(1)
  expect(stageMultiplier(2)).toBe(2)
  expect(stageMultiplier(6)).toBe(4)
  expect(stageMultiplier(-2)).toBe(0.5)
  expect(stageMultiplier(-6)).toBe(0.25)
})

test('Should scale speed by its stage and halve it while paralysed', () => {
  expect(
    effectiveSpeed({
      mon: { stats: { speed: 100 }, status: null },
      stages: { speed: 0 },
    }),
  ).toBe(100)

  expect(
    effectiveSpeed({
      mon: { stats: { speed: 100 }, status: null },
      stages: { speed: 2 },
    }),
  ).toBe(200)

  expect(
    effectiveSpeed({
      mon: { stats: { speed: 100 }, status: 'paralysis' },
      stages: { speed: 0 },
    }),
  ).toBe(50)
})

test('Should hand back only a slot that still has PP', () => {
  const actor = {
    mon: {
      moves: [
        { move: 'scratch', pp: 3, maxPp: 35 },
        { move: 'growl', pp: 0, maxPp: 40 },
      ],
    },
  }

  expect(moveSlotOf(actor, 0)).toBe(actor.mon.moves[0])
  expect(moveSlotOf(actor, 1)).toBe(null)
  expect(moveSlotOf(actor, 4)).toBe(null)
})
