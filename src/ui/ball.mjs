// The ball throw.
//
// A throw is the one action whose whole substance is the animation: the engine has
// already resolved it before anything is drawn, and hands back how many times the
// ball shook and whether it held. Printing "You threw a Poké Ball!" and the verdict
// back to back reads like a dice roll, so this puts the ball on screen and makes
// the player watch it wobble first.
//
// Drawn as half-block cells, the same way sprites are, which is what makes it work
// in both sprite modes: in image mode the terminal has already painted a PNG into
// those cells, and writing into them covers it.

import { bg, clear, colorEnabled, fg, reset } from './ansi.mjs'

const UPPER_HALF = '▀'
const LOWER_HALF = '▄'

/**
 * The ball, 10x10 pixels, one character per pixel.
 *
 * Ten across is the smallest a Poké Ball reads at: the band has to be thick
 * enough to hold a button, and a button under two pixels wide is a dead pixel.
 *
 * `.` is transparent, and stays transparent all the way to the overlays — a space
 * written over a sprite punches a hole in it, so the gaps here are never drawn at
 * all. Only the top and bottom arcs are outlined, deliberately: an outline down
 * the sides as well leaves so much dark that the whole thing reads as a black
 * rectangle with a red lid. The shaded right-hand columns and the glint on the
 * left are what make it a sphere rather than a disc.
 */
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

/** The catch light, which is the only thing that changes colour mid-animation. */
const LIT_BUTTON = [255, 226, 96]

/** Rows the ball rises above a straight line between the two Pokemon. */
const ARC_ROWS = 3

const THROW_FRAMES = 8
const FALL_FRAMES = 3

/** One wobble: left, back, right, back. */
const SHAKE_TILTS = [-1, 0, 1, 0]

/**
 * How many pixels wide one pixel of the art is drawn.
 *
 * Scaled off the sprite canvas so the ball keeps its proportions as the window
 * grows — about a fifth of the height of the Pokemon beside it, which is roughly
 * what the games show.
 */
export function ballScale(canvasCols) {
  return Math.max(1, Math.round(canvasCols / 48))
}

/** Nearest neighbour, because pixel art scales no other way. */
function scaleArt(art, scale) {
  if (scale <= 1) return art

  const rows = []
  for (const row of art) {
    const wide = [...row].map((pixel) => pixel.repeat(scale)).join('')
    for (let i = 0; i < scale; i++) rows.push(wide)
  }
  return rows
}

/**
 * One character cell: a half-block holding the two pixels stacked in it, or null
 * where both of them are transparent.
 */
function cell(top, bottom) {
  if (!top && !bottom) return null
  if (!colorEnabled) return top && bottom ? '█' : top ? UPPER_HALF : LOWER_HALF

  if (top && bottom) return `${fg(...top)}${bg(...bottom)}${UPPER_HALF}`

  // Only one pixel is solid, so it is drawn as a foreground block over whatever
  // is already behind it. The reset makes sure that is not the background colour
  // the previous cell left set.
  return `${reset}${fg(...(top ?? bottom))}${top ? UPPER_HALF : LOWER_HALF}`
}

const cellCache = new Map()

/**
 * The ball as a grid of cells, `[row][column]`.
 *
 * @param {number} scale pixels per source pixel
 * @param {boolean} lit whether the catch light is on
 */
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

/**
 * The whole throw, as one entry per frame.
 *
 * Pure data and short, so the interface can hold nothing but a frame number and
 * ask what to draw — the same deal the explosion runs on.
 *
 * @param {{shakes?: number, caught?: boolean}} result what the engine decided
 */
export function ballSteps({ shakes = 0, caught = false } = {}) {
  const steps = []

  for (let i = 0; i < THROW_FRAMES; i++) {
    steps.push({ kind: 'throw', t: i / (THROW_FRAMES - 1), hideFoe: false })
  }

  // Off the field from the moment the ball reaches it: a Pokemon being sucked
  // into a ball is not standing there, and the empty spot is the sign that the
  // throw connected at all.
  for (let i = 0; i < FALL_FRAMES; i++) {
    steps.push({ kind: 'fall', t: (i + 1) / FALL_FRAMES, hideFoe: true })
  }

  for (let i = 0; i < shakes; i++) {
    for (const tilt of SHAKE_TILTS) steps.push({ kind: 'shake', tilt, hideFoe: true })
  }

  if (caught) {
    // Click. The last frame is the one that is held: the ball never opens again,
    // so the rest of the battle plays out with it lying there and the field empty.
    steps.push({ kind: 'click', lit: true, hideFoe: true })
    steps.push({ kind: 'click', lit: false, hideFoe: true })
    steps.push({ kind: 'click', lit: true, hideFoe: true })
  } else {
    // It comes back out as the ball splits, which is the whole point of the frame.
    for (let spread = 1; spread <= 3; spread++) {
      steps.push({ kind: 'burst', spread, hideFoe: false })
    }
  }

  return steps
}

/** Where the middle of the ball sits on this frame, in 0-based rows and columns. */
function centreOf(step, geometry, width, height) {
  const { foe, player } = geometry
  const column = foe.indent + Math.floor(foe.cols / 2)

  // Where it comes to rest: on the ground under the Pokemon it was thrown at.
  const rest = { row: foe.top + foe.rows - Math.ceil(height / 2), col: column }

  switch (step.kind) {
    case 'throw': {
      // From behind your own Pokemon rather than from on top of it, which is
      // roughly where the trainer would be standing. Half a ball in from both
      // margins, so it starts on screen and clear of the name and bars below.
      const from = {
        row: player.top + player.rows - Math.ceil(height / 2),
        col: player.indent + Math.floor(width / 2),
      }
      const to = { row: foe.top + Math.floor(foe.rows / 2), col: column }
      // A straight line looks thrown by a machine. The sine is the lob.
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
      // In ball widths, so the rock stays as obvious as the ball is big. A single
      // column at this size is a twitch nobody would notice.
      return { row: rest.row, col: rest.col + step.tilt * Math.max(1, Math.round(width / 6)) }
    default:
      return rest
  }
}

/**
 * The blocks of cells to draw, each with its own corner.
 *
 * One for every frame but the burst, which comes apart into a lid and a base
 * moving in opposite directions.
 */
function pieces(step, geometry, cells) {
  const height = cells.length
  const width = cells[0].length
  const centre = centreOf(step, geometry, width, height)
  const top = centre.row - Math.floor(height / 2)
  const left = centre.col - Math.floor(width / 2)

  if (step.kind !== 'burst') return [{ top, left, rows: cells }]

  // Measured in ball widths rather than cells, so it flies apart by the same
  // amount whatever size it is being drawn at. Sideways more than up, because a
  // lid that shoots straight up reads as an explosion instead of an opening.
  const dx = Math.round((width / 5) * step.spread)
  const dy = Math.round((height / 5) * step.spread)
  const split = Math.ceil(height / 2)

  return [
    { top: top - dy, left: left - dx, rows: cells.slice(0, split) },
    { top: top + split + dy, left: left + dx, rows: cells.slice(split) },
  ]
}

/**
 * Turns one frame into overlays.
 *
 * Runs of solid cells, split at every transparent one, so the gaps in the art
 * leave whatever is behind them alone — a sprite, or the box around the message.
 *
 * @param {object} step one entry from `ballSteps`
 * @param {object} geometry `foe` and `player` sprite boxes as
 *   `{top, rows, indent, cols}` in 0-based rows and columns, the `scale` to draw
 *   at, the screen width as `cols`, and `maxRow` as the last row the ball may
 *   touch — the message box below it is not to be drawn over.
 * @param {number} frame keys the overlays, so the renderer knows the ball moved
 */
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
          // Rows and columns are 1-based in an overlay; everything above is not.
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
