import { expect, test } from 'vitest'

import { HIT_FRAMES } from './constants.mjs'
import { hitOverlays } from './hit.mjs'
import { visibleLength } from './text.mjs'

test('Should draw the explosion as overlays, not as rows', () => {
  const overlays = hitOverlays(0, 9, 20, 3)

  expect(overlays.length).toBeGreaterThan(HIT_FRAMES[3].length)
  expect(overlays.every((overlay) => !overlay.sequence.includes(' '))).toBe(
    true,
  )
  expect(overlays.every((overlay) => overlay.key === 'hit:3')).toBe(true)
})

test('Should sit the explosion centred on the sprite it is hitting', () => {
  const centre = 30
  const overlays = hitOverlays(4, 10, centre, 2)

  const left = Math.min(...overlays.map((overlay) => overlay.col))
  const right = Math.max(
    ...overlays.map((overlay) => overlay.col + visibleLength(overlay.sequence)),
  )

  expect(Math.abs((left + right) / 2 - (centre + 1))).toBeLessThanOrEqual(1)
})

test('Should keep the explosion inside the sprite it is drawn over', () => {
  const overlays = hitOverlays(5, 2, 20, 4)

  expect(overlays.length).toBeGreaterThan(0)

  for (const overlay of overlays) {
    expect(overlay.row).toBeGreaterThanOrEqual(6)
    expect(overlay.row).toBeLessThanOrEqual(7)
  }
})

test('Should draw nothing for a frame past the end of the animation', () => {
  expect(hitOverlays(0, 9, 20, HIT_FRAMES.length)).toEqual([])
})
