import { expect, test } from 'vitest'

import { spriteFile } from '../paths.mjs'
import { fieldWidth, fitBattleSprites, usableRows } from './battleField.mjs'
import { MAX_FIELD_WIDTH } from './constants.mjs'

test('Should leave the bottom row to the renderer and cap the field width', () => {
  expect(usableRows({ cols: 100, rows: 34 })).toBe(33)
  expect(fieldWidth({ cols: 40, rows: 24 })).toBe(38)
  expect(fieldWidth({ cols: 200, rows: 24 })).toBe(MAX_FIELD_WIDTH)
})

test('Should only share rows between sprites when there is clear air between them', () => {
  let shared = 0

  for (const [foe, player] of [
    [143, 4],
    [4, 143],
    [16, 25],
    [143, 143],
    [25, 143],
  ]) {
    for (const cols of [60, 80, 100, 120, 160]) {
      for (let rows = 24; rows <= 60; rows += 4) {
        const size = { cols, rows }
        const fitted = fitBattleSprites(
          size,
          spriteFile('front', foe, 'png'),
          spriteFile('back', player, 'png'),
          1,
        )

        if (fitted.overlap === 0) continue

        shared++

        const width = Math.min(cols - 2, 78)
        const playerRight = 2 + fitted.player.cols
        const foeLeft = Math.max(1, width - fitted.foe.cols - 2)

        expect(
          playerRight + 2,
          `${foe} vs ${player} at ${cols}x${rows} shares rows but reaches ` +
            `${playerRight} into a foe starting at ${foeLeft}`,
        ).toBeLessThanOrEqual(foeLeft)
      }
    }
  }

  expect(
    shared,
    'the overlap does happen, or this proves nothing',
  ).toBeGreaterThan(0)
})

test('Should never grow the field past the rows the layout can spare', () => {
  for (const [foe, player] of [
    [143, 4],
    [143, 143],
    [16, 25],
  ]) {
    for (let rows = 24; rows <= 60; rows += 2) {
      const size = { cols: 120, rows }
      const fitted = fitBattleSprites(
        size,
        spriteFile('front', foe, 'png'),
        spriteFile('back', player, 'png'),
        1,
      )
      const height =
        fitted.foe.rows.length + fitted.player.rows.length - fitted.overlap

      expect(
        height,
        `${foe} vs ${player} at ${rows} rows wants ${height} rows of field`,
      ).toBeLessThanOrEqual(Math.max(8, rows - 1 - 11))
    }
  }
})
