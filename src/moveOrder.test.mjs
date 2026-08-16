import { expect, test } from 'vitest'
import { nextMoveSlot, reorderMoveSlots } from './moveOrder.mjs'

const slots = ['tackle', 'growl', 'ember', 'fly']

test('Should carry a move to its new slot and shift the ones it passes', () => {
  expect(reorderMoveSlots(slots, 3, 0)).toEqual([
    'fly',
    'tackle',
    'growl',
    'ember',
  ])
  expect(reorderMoveSlots(slots, 0, 1)).toEqual([
    'growl',
    'tackle',
    'ember',
    'fly',
  ])
  expect(slots, 'the original order is untouched').toEqual([
    'tackle',
    'growl',
    'ember',
    'fly',
  ])
})

test('Should hand back the same order when a move is dropped where it started', () => {
  expect(reorderMoveSlots(slots, 2, 2)).toBe(slots)
})

test('Should walk a held move off one end and onto the other', () => {
  expect(nextMoveSlot(0, -1, 4), 'up from the first slot').toBe(3)
  expect(nextMoveSlot(3, 1, 4), 'down from the last slot').toBe(0)
  expect(nextMoveSlot(1, 1, 4)).toBe(2)
  expect(nextMoveSlot(0, -1, 1), 'a lone move stays put').toBe(0)
})
