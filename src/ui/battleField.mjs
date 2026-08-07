import {
  FIELD_GAP,
  FIELD_LEFT,
  FIELD_ROOM_SLACK,
  FOE_INFO_ROWS,
  MAX_FIELD_WIDTH,
  MESSAGE_BOX_ROWS,
  MIN_CANVAS_COLS,
  MIN_FIELD_ROWS,
  NATIVE_CANVAS_COLS,
  NO_SPRITE,
  OVERLAP_FRACTION,
  PLAYER_INFO_ROWS,
} from './constants.mjs'
import { loadSprite, spriteHeight } from './sprite.mjs'
import { visibleLength } from './text.mjs'

const CHROME_ROWS = FOE_INFO_ROWS + PLAYER_INFO_ROWS + MESSAGE_BOX_ROWS

export const usableRows = (size) => size.rows - 1

export const fieldWidth = (size) => Math.min(size.cols - 2, MAX_FIELD_WIDTH)

export const overlapRows = (foe, player, width) => {
  const playerRight = FIELD_LEFT + player.cols
  const foeLeft = Math.max(1, width - foe.cols - 2)

  if (playerRight + FIELD_GAP > foeLeft) return 0

  const shorter = Math.min(spriteHeight(foe), spriteHeight(player))

  return Math.floor(shorter * OVERLAP_FRACTION)
}

const spriteRows = (pngPath, canvasCols) => {
  return loadSprite(pngPath, { cols: canvasCols }) ?? NO_SPRITE
}

export const fitBattleSprites = (size, foeFile, playerFile, scale) => {
  const budget = Math.max(MIN_FIELD_ROWS, usableRows(size) - CHROME_ROWS)
  const width = fieldWidth(size)
  const room = Math.min(NATIVE_CANVAS_COLS, size.cols - FIELD_ROOM_SLACK)
  const maxCanvas = Math.max(MIN_CANVAS_COLS, Math.round(room * scale))

  let low = MIN_CANVAS_COLS
  let high = maxCanvas
  let best = null

  while (low <= high) {
    const canvas = Math.floor((low + high) / 2)
    const foe = spriteRows(foeFile, canvas)
    const player = spriteRows(playerFile, canvas)
    const overlap = overlapRows(foe, player, width)

    if (spriteHeight(foe) + spriteHeight(player) - overlap <= budget) {
      best = { canvas, foe, player, overlap }
      low = canvas + 1
    } else {
      high = canvas - 1
    }
  }

  if (best) return best

  const foe = spriteRows(foeFile, MIN_CANVAS_COLS)
  const player = spriteRows(playerFile, MIN_CANVAS_COLS)

  return {
    canvas: MIN_CANVAS_COLS,
    foe,
    player,
    overlap: overlapRows(foe, player, width),
  }
}

const joinField = (left, leftIndent, right, rightIndent) => {
  const line = left === null ? '' : ' '.repeat(leftIndent) + left

  if (right === null) return line

  return (
    line + ' '.repeat(Math.max(1, rightIndent - visibleLength(line))) + right
  )
}

export const placeField = (lines, fitted, width, hideFoe, maxRows) => {
  const foeHeight = spriteHeight(fitted.foe)
  const playerHeight = spriteHeight(fitted.player)
  const overlap = Math.min(fitted.overlap, foeHeight, playerHeight)

  const top = lines.length
  const playerOffset = foeHeight - overlap
  const height = Math.min(playerOffset + playerHeight, maxRows)

  const foeIndent = Math.max(1, width - fitted.foe.cols - 2)
  const playerIndent = FIELD_LEFT

  const foeDrawn = Math.max(0, Math.min(foeHeight, height))
  const playerDrawn = Math.max(0, Math.min(playerHeight, height - playerOffset))

  const left = new Array(height).fill(null)
  const right = new Array(height).fill(null)

  if (!hideFoe) {
    for (let row = 0; row < foeDrawn; row++) right[row] = fitted.foe.rows[row]
  }

  for (let row = 0; row < playerDrawn; row++)
    left[playerOffset + row] = fitted.player.rows[row]

  for (let row = 0; row < height; row++) {
    lines.push(joinField(left[row], playerIndent, right[row], foeIndent))
  }

  return {
    foeTop: top,
    foeRows: foeDrawn,
    playerTop: top + playerOffset,
    playerRows: playerDrawn,
    foeIndent,
    playerIndent,
  }
}
