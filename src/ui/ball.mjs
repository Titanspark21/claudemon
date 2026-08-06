import { bg, clear, colorEnabled, fg, reset } from './ansi.mjs'

const UPPER_HALF = '▀'
const LOWER_HALF = '▄'

const BALL_ART = [
  '...kkkk...',
  '.krrrrrrk.',
  'rrhhrrrrdd',
  'rrrrrrrrdd',
  'kkkkbbkkkk',
  'kkkkbbkkkk',
  'wwwwwwwwgg',
  'wwwwwwwwgg',
  '.kwwwwggk.',
  '...kkkk...',
]

const PALETTE = {
  '.': null,
  k: [26, 26, 32],
  r: [222, 48, 48],
  h: [255, 138, 132],
  d: [150, 26, 32],
  w: [246, 246, 248],
  g: [174, 174, 184],
  b: [230, 230, 236],
}

const LIT_BUTTON = [255, 226, 96]

const ARC_ROWS = 3

const THROW_FRAMES = 8
const FALL_FRAMES = 3

const SHAKE_TILTS = [-1, 0, 1, 0]

export function ballScale(canvasCols) {
  return Math.max(1, Math.round(canvasCols / 48))
}

function scaleArt(art, scale) {
  if (scale <= 1) return art

  const rows = []
  for (const row of art) {
    const wide = [...row].map((pixel) => pixel.repeat(scale)).join('')
    for (let i = 0; i < scale; i++) rows.push(wide)
  }
  return rows
}

function cell(top, bottom) {
  if (!top && !bottom) return null
  if (!colorEnabled) return top && bottom ? '█' : top ? UPPER_HALF : LOWER_HALF

  if (top && bottom) return `${fg(...top)}${bg(...bottom)}${UPPER_HALF}`

  return `${reset}${fg(...(top ?? bottom))}${top ? UPPER_HALF : LOWER_HALF}`
}

const cellCache = new Map()

export function ballCells(scale = 1, lit = false) {
  const key = `${scale}|${lit ? 'lit' : 'off'}`
  const hit = cellCache.get(key)
  if (hit) return hit

  const palette = lit ? { ...PALETTE, b: LIT_BUTTON } : PALETTE
  const art = scaleArt(BALL_ART, scale)

  const rows = []
  for (let y = 0; y < art.length; y += 2) {
    const row = []
    for (let x = 0; x < art[y].length; x++) {
      row.push(cell(palette[art[y][x]], palette[art[y + 1]?.[x]]))
    }
    rows.push(row)
  }

  cellCache.set(key, rows)
  return rows
}

export function ballSteps({ shakes = 0, caught = false } = {}) {
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
    for (let spread = 1; spread <= 3; spread++) {
      steps.push({ kind: 'burst', spread, hideFoe: false })
    }
  }

  return steps
}

function centreOf(step, geometry, width, height) {
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
        col: rest.col + step.tilt * Math.max(1, Math.round(width / 6)),
      }
    default:
      return rest
  }
}

function pieces(step, geometry, cells) {
  const height = cells.length
  const width = cells[0].length
  const centre = centreOf(step, geometry, width, height)
  const top = centre.row - Math.floor(height / 2)
  const left = centre.col - Math.floor(width / 2)

  if (step.kind !== 'burst') return [{ top, left, rows: cells }]

  const dx = Math.round((width / 5) * step.spread)
  const dy = Math.round((height / 5) * step.spread)
  const split = Math.ceil(height / 2)

  return [
    { top: top - dy, left: left - dx, rows: cells.slice(0, split) },
    { top: top + split + dy, left: left + dx, rows: cells.slice(split) },
  ]
}

export function ballOverlays(step, geometry, frame = 0) {
  if (!step) return []

  const cells = ballCells(geometry.scale ?? 1, step.lit)
  const key = `ball:${frame}`
  const overlays = []

  for (const piece of pieces(step, geometry, cells)) {
    piece.rows.forEach((cellRow, index) => {
      const row = piece.top + index
      if (row < 0 || row > geometry.maxRow) return

      let run = null
      const flush = () => {
        if (run) {
          overlays.push({
            row: row + 1,
            col: run.col + 1,
            sequence: run.text + clear,
            rows: 1,
            key,
          })
        }
        run = null
      }

      cellRow.forEach((solid, offset) => {
        const col = piece.left + offset
        if (!solid || col < 0 || col >= geometry.cols) {
          flush()
          return
        }
        if (!run) run = { col, text: '' }
        run.text += solid
      })

      flush()
    })
  }

  return overlays
}
