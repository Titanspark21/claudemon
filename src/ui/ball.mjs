import { bg, CLEAR, COLOR_ENABLED, fg, RESET } from './ansi.mjs'
import {
  ARC_ROWS,
  BALL_ART,
  BALL_PALETTE,
  BALL_SCALE_DIVISOR,
  BURST_OFFSET_DIVISOR,
  BURST_SPREADS,
  FALL_FRAMES,
  FULL_BLOCK,
  LIT_BUTTON,
  LOWER_HALF,
  SHAKE_OFFSET_DIVISOR,
  SHAKE_TILTS,
  THROW_FRAMES,
  UPPER_HALF,
} from './constants.mjs'

export const ballScale = (canvasCols) => {
  return Math.max(1, Math.round(canvasCols / BALL_SCALE_DIVISOR))
}

const scaleArt = (art, scale) => {
  if (scale <= 1) return art

  const rows = []

  for (const row of art) {
    const wide = [...row].map((pixel) => pixel.repeat(scale)).join('')

    for (let i = 0; i < scale; i++) rows.push(wide)
  }

  return rows
}

const monoCell = (top, bottom) => {
  if (top && bottom) return FULL_BLOCK
  if (top) return UPPER_HALF

  return LOWER_HALF
}

const cell = (top, bottom) => {
  if (!top && !bottom) return null
  if (!COLOR_ENABLED) return monoCell(top, bottom)

  if (top && bottom) return `${fg(...top)}${bg(...bottom)}${UPPER_HALF}`
  if (top) return `${RESET}${fg(...top)}${UPPER_HALF}`

  return `${RESET}${fg(...bottom)}${LOWER_HALF}`
}

const LIT_BALL_PALETTE = { ...BALL_PALETTE, b: LIT_BUTTON }

export const ballCells = (scale = 1, lit = false) => {
  const palette = lit ? LIT_BALL_PALETTE : BALL_PALETTE
  const art = scaleArt(BALL_ART, scale)

  const rows = []

  for (let y = 0; y < art.length; y += 2) {
    const row = []

    for (let x = 0; x < art[y].length; x++) {
      row.push(cell(palette[art[y][x]], palette[art[y + 1]?.[x]]))
    }

    rows.push(row)
  }

  return rows
}

export const ballSteps = ({ shakes = 0, caught = false }) => {
  const steps = []

  for (let i = 0; i < THROW_FRAMES; i++) {
    steps.push({ kind: 'throw', t: i / (THROW_FRAMES - 1), hideFoe: false })
  }

  for (let i = 0; i < FALL_FRAMES; i++) {
    steps.push({ kind: 'fall', t: (i + 1) / FALL_FRAMES, hideFoe: true })
  }

  for (let i = 0; i < shakes; i++) {
    for (const tilt of SHAKE_TILTS)
      steps.push({ kind: 'shake', tilt, hideFoe: true })
  }

  if (caught) {
    steps.push({ kind: 'click', lit: true, hideFoe: true })
    steps.push({ kind: 'click', lit: false, hideFoe: true })
    steps.push({ kind: 'click', lit: true, hideFoe: true })
  } else {
    for (let spread = 1; spread <= BURST_SPREADS; spread++) {
      steps.push({ kind: 'burst', spread, hideFoe: false })
    }
  }

  return steps
}

const centreOf = (step, geometry, width, height) => {
  const { foe, player } = geometry
  const column = foe.indent + Math.floor(foe.cols / 2)

  const rest = { row: foe.top + foe.rows - Math.ceil(height / 2), col: column }

  switch (step.kind) {
    case 'throw': {
      const from = {
        row: player.top + player.rows - Math.ceil(height / 2),
        col: player.indent + Math.floor(width / 2),
      }
      const to = { row: foe.top + Math.floor(foe.rows / 2), col: column }
      const arc = Math.round(ARC_ROWS * Math.sin(Math.PI * step.t))

      return {
        row: Math.round(from.row + (to.row - from.row) * step.t) - arc,
        col: Math.round(from.col + (to.col - from.col) * step.t),
      }
    }
    case 'fall': {
      const from = foe.top + Math.floor(foe.rows / 2)

      return { row: Math.round(from + (rest.row - from) * step.t), col: column }
    }
    case 'shake':
      return {
        row: rest.row,
        col:
          rest.col +
          step.tilt * Math.max(1, Math.round(width / SHAKE_OFFSET_DIVISOR)),
      }
    default:
      return rest
  }
}

const pieces = (step, geometry, cells) => {
  const height = cells.length
  const width = cells[0].length
  const centre = centreOf(step, geometry, width, height)
  const top = centre.row - Math.floor(height / 2)
  const left = centre.col - Math.floor(width / 2)

  if (step.kind !== 'burst') return [{ top, left, rows: cells }]

  const dx = Math.round((width / BURST_OFFSET_DIVISOR) * step.spread)
  const dy = Math.round((height / BURST_OFFSET_DIVISOR) * step.spread)
  const split = Math.ceil(height / 2)

  return [
    { top: top - dy, left: left - dx, rows: cells.slice(0, split) },
    { top: top + split + dy, left: left + dx, rows: cells.slice(split) },
  ]
}

const flushRun = (overlays, run, row, key) => {
  if (!run) return

  overlays.push({
    row: row + 1,
    col: run.col + 1,
    sequence: run.text + CLEAR,
    rows: 1,
    key,
  })
}

export const ballOverlays = (step, geometry, frame = 0) => {
  const cells = ballCells(geometry.scale, step.lit)
  const key = `ball:${frame}`
  const overlays = []

  for (const piece of pieces(step, geometry, cells)) {
    piece.rows.forEach((cellRow, index) => {
      const row = piece.top + index

      if (row < 0 || row > geometry.maxRow) return

      let run = null

      cellRow.forEach((solid, offset) => {
        const col = piece.left + offset

        if (!solid || col < 0 || col >= geometry.cols) {
          flushRun(overlays, run, row, key)
          run = null
          return
        }

        if (!run) run = { col, text: '' }

        run.text += solid
      })

      flushRun(overlays, run, row, key)
    })
  }

  return overlays
}
