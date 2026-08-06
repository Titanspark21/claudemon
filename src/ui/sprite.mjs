// Drawing Pokemon in a terminal.
//
// One way, and deliberately so: quadrant block characters. Every cell carries a
// 2x2 grid of pixels — ▘▝▖▗▚▞▛▜▙▟ and the halves and the full block — with one
// foreground colour and one background colour shared between them.
//
// Quadrants because they are the densest grid that is genuinely safe. Sextants
// (2x3) and octants (2x4) pack more in, but they are Unicode 13 and 16, and a font
// without them draws a wall of tofu that nothing can detect. Quadrants have been in
// Block Elements since Unicode 1.1, so every monospace font ever shipped has them,
// and they still double the horizontal resolution of the ▀ they replaced.

import { existsSync, readFileSync } from 'node:fs'
import { decodePng } from '../png.mjs'
import { bg, colorEnabled, fg, reset } from './ansi.mjs'

const UPPER_HALF = '▀'
const LOWER_HALF = '▄'

/**
 * How much taller a character cell is than it is wide.
 *
 * Not measured — terminals do not say, and it varies with the font. Two is the
 * value nearly every monospace font lands near, and it is the number that decides
 * how many rows a sprite is drawn over, so being a little out only makes a Pokemon
 * slightly tall or slightly wide rather than wrong.
 */
const CELL_ASPECT = 2

/**
 * Quadrant glyphs: a 2x2 grid of pixels in one cell.
 *
 * Indexed by mask, whose bits are in reading order: 1 2 / 4 8. Written out rather
 * than computed, because the sixteen glyphs are scattered across Block Elements in
 * no useful order — the halves and the full block were there first, and Unicode
 * filled the ten gaps in around them.
 *
 * Laid out four to a row so the table is read the way the mask is built: the column
 * is the top two pixels, the row the bottom two.
 */
// prettier-ignore
const QUADRANT_GLYPHS = [
  ' ', '▘', '▝', '▀',
  '▖', '▌', '▞', '▛',
  '▗', '▚', '▐', '▜',
  '▄', '▙', '▟', '█',
]

function quadrantGlyph(mask) {
  return QUADRANT_GLYPHS[mask]
}

/** Half blocks: one pixel across, two down. Bits are 1 / 2. */
function halfGlyph(mask) {
  return [' ', UPPER_HALF, LOWER_HALF, '█'][mask]
}

/**
 * The ways a cell can be subdivided.
 *
 * Both cost the same number of cells for a given sprite — the arithmetic that
 * decides how many rows a sprite needs cancels the grid out entirely — so the
 * denser one is free resolution. What it costs instead is colour: a cell carries
 * one foreground and one background either way, so four pixels have to share the
 * two colours that two pixels used to have.
 *
 * `quadrant` is what sprites are drawn with. `half` stays for the grass, which is
 * not decoded from a file but composed a pixel at a time at exactly the size it
 * will be drawn — a denser grid there would only ask it to invent pixels it does
 * not have.
 */
export const BLOCK_GRIDS = {
  half: { cols: 1, rows: 2, glyph: halfGlyph },
  quadrant: { cols: 2, rows: 2, glyph: quadrantGlyph },
}

/**
 * Sprite art is 96x96, and a canvas that wide is 48 rows tall, which is 96 pixels
 * down a quadrant grid. So this is where the source is reproduced in full and
 * anything wider would only be asking a 96-pixel sprite for a 97th.
 */
export const NATIVE_CANVAS_COLS = 96

/** Alpha at or below this counts as transparent. Sprites have hard edges. */
const ALPHA_CUTOFF = 128

/**
 * Samples an RGBA image down to a target size, taking the commonest colour in each
 * box rather than the average of it.
 *
 * Averaging is what a photograph wants and the opposite of what this art wants.
 * These sprites are drawn from a palette of a couple of dozen flat colours with a
 * hard outline around every shape, and a box straddling that outline averages to a
 * colour that appears nowhere in the sprite — so a shrunk Charizard comes out a
 * uniform muddy brown, its outlines dissolved into its fills. Taking the commonest
 * colour instead can only ever return a colour the artist actually used, which
 * keeps the palette intact and the outlines dark all the way down.
 */
function resample({ width, height, pixels }, targetWidth, targetHeight) {
  const out = new Uint8Array(targetWidth * targetHeight * 4)
  const tally = new Map()

  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = Math.floor((ty * height) / targetHeight)
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * height) / targetHeight))

    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = Math.floor((tx * width) / targetWidth)
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * width) / targetWidth))

      tally.clear()
      let opaque = 0
      let total = 0
      let best = 0
      let bestCount = 0

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const source = (y * width + x) * 4
          total++
          if (pixels[source + 3] <= ALPHA_CUTOFF) continue
          opaque++

          const colour = (pixels[source] << 16) | (pixels[source + 1] << 8) | pixels[source + 2]
          const count = (tally.get(colour) ?? 0) + 1
          tally.set(colour, count)
          // Ties go to the colour seen first, which is the top-left of the box.
          if (count > bestCount) {
            best = colour
            bestCount = count
          }
        }
      }

      const target = (ty * targetWidth + tx) * 4
      if (opaque === 0) {
        out[target + 3] = 0
      } else {
        out[target] = (best >> 16) & 0xff
        out[target + 1] = (best >> 8) & 0xff
        out[target + 2] = best & 0xff
        // A cell is only kept if most of what it covered was actually solid,
        // which keeps the silhouette crisp instead of fuzzy.
        out[target + 3] = opaque * 2 >= total ? 255 : 0
      }
    }
  }

  return { width: targetWidth, height: targetHeight, pixels: out }
}

/** Squared distance between two RGB colours. Comparison only, so no square root. */
function colourDistance(a, b) {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

/**
 * Splits a cell's solid pixels between the two colours a cell can carry.
 *
 * Takes the commonest colour in the cell, then whichever of the rest is furthest
 * from it, and sends every pixel to the nearer of the two. On flat pixel art that
 * is exactly the right answer: a cell straddling an outline and a fill holds those
 * two colours and has no need for a third.
 *
 * Commonest rather than most extreme, for the same reason the resample picks it —
 * both colours come back as ones the artist actually used. Furthest-from-it for the
 * second, because the runner-up is often a near-duplicate of the first and would
 * waste the only other slot the cell has.
 *
 * @param {number[][]} colours one entry per solid pixel
 * @returns {{front: number[], back: number[]|null, belongsToFront: boolean[]}}
 */
function twoColours(colours) {
  if (colours.length === 0) return { front: [0, 0, 0], back: null, belongsToFront: [] }

  const tally = new Map()
  for (const colour of colours) {
    const key = (colour[0] << 16) | (colour[1] << 8) | colour[2]
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }

  let a = colours[0]
  let bestCount = 0
  for (const [key, count] of tally) {
    if (count > bestCount) {
      a = [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff]
      bestCount = count
    }
  }

  let b = null
  for (const c of colours) {
    if (b === null || colourDistance(c, a) > colourDistance(b, a)) b = c
  }
  if (colourDistance(a, b) === 0)
    return { front: a, back: null, belongsToFront: colours.map(() => true) }

  // Whichever claims more pixels goes in the foreground, so the glyph carries the
  // bigger shape and the rarer colour sits behind it.
  const toA = colours.map((c) => colourDistance(c, a) <= colourDistance(c, b))
  const countA = toA.filter(Boolean).length
  return countA >= colours.length - countA
    ? { front: a, back: b, belongsToFront: toA }
    : { front: b, back: a, belongsToFront: toA.map((x) => !x) }
}

/**
 * Renders an RGBA image as rows of block characters.
 *
 * The number of rows a sprite takes does not depend on the grid: a denser grid
 * subdivides the same cell rather than asking for more of them. So this is the same
 * layout at any density, and `grid` only decides how much detail fits inside it.
 *
 * @param {{cols: number, rows: number, glyph: (mask: number) => string}} grid
 * @returns {string[]} one string per terminal row.
 */
export function blockRows(image, cols, grid = BLOCK_GRIDS.quadrant) {
  // Rows come out of the cell's shape, not the grid's: a cell is CELL_ASPECT times
  // taller than it is wide, and a sprite has to keep its proportions.
  const rows = Math.max(1, Math.round((cols * image.height) / (CELL_ASPECT * image.width)))
  const scaled = resample(image, cols * grid.cols, rows * grid.rows)

  const lines = []
  for (let row = 0; row < rows; row++) {
    let line = ''
    let styled = false

    for (let col = 0; col < cols; col++) {
      // Read the cell's pixels in the order the glyph masks are numbered.
      const colours = []
      const solid = []
      for (let y = 0; y < grid.rows; y++) {
        for (let x = 0; x < grid.cols; x++) {
          const at = ((row * grid.rows + y) * scaled.width + col * grid.cols + x) * 4
          if (scaled.pixels[at + 3] > ALPHA_CUTOFF) {
            solid.push(true)
            colours.push([scaled.pixels[at], scaled.pixels[at + 1], scaled.pixels[at + 2]])
          } else {
            solid.push(false)
          }
        }
      }

      if (colours.length === 0) {
        if (styled) {
          line += reset
          styled = false
        }
        line += ' '
        continue
      }

      if (!colorEnabled) {
        let mask = 0
        solid.forEach((on, index) => {
          if (on) mask |= 1 << index
        })
        line += grid.glyph(mask)
        continue
      }

      const { front, back, belongsToFront } = twoColours(colours)

      // A background colour fills the whole cell, so it can only be used when there
      // is nothing transparent left to show through. Otherwise the cell gets one
      // colour and the glyph carries the silhouette.
      const opaque = colours.length === solid.length
      let mask = 0
      let seen = 0
      solid.forEach((on, index) => {
        if (!on) return
        const toFront = belongsToFront[seen++]
        if (toFront || !(opaque && back)) mask |= 1 << index
      })

      // A cell of one colour with nothing transparent in it is painted rather than
      // drawn: a background is the cell rectangle by definition, and a glyph's ink
      // is not. Fonts cut the block elements to their own height, which is shorter
      // than the row the terminal lays out — SF Mono leaves 2.5pt of a 16.7pt row
      // empty above the block — and down a sprite that shortfall reads as a gap
      // between every row. Terminals that rasterise these glyphs themselves instead
      // of taking them from the font have no seam either way, which is the whole
      // reason this only ever showed up outside them.
      //
      // So `bg` and a space, and the cell is solid everywhere. Costs a byte less
      // than the full block it replaces, and this is the common case by a distance:
      // flat pixel art is mostly cells of a single colour.
      if (opaque && !back) {
        line += bg(...front) + ' '
      } else if (opaque) {
        line += fg(...front) + bg(...back) + grid.glyph(mask)
      } else {
        line += reset + fg(...front) + grid.glyph(mask)
      }
      styled = true
    }

    lines.push(styled ? line + reset : line)
  }
  return lines
}

/** Half blocks, for art already composed at the size it will be drawn. */
export function halfBlockRows(image, cols) {
  return blockRows(image, cols, BLOCK_GRIDS.half)
}

/**
 * Trims the transparent margin around a sprite.
 *
 * The 96x96 canvas is mostly empty for the smaller Pokemon, which would leave the
 * battle screen looking sparse. `canvasFraction` reports how much of the original
 * width the content actually used, so callers can scale by it and keep relative
 * sizes honest: a cropped Pidgey still renders smaller than a cropped Snorlax.
 */
export function cropToContent(image) {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.pixels[(y * image.width + x) * 4 + 3] <= ALPHA_CUTOFF) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  // Fully transparent image: nothing to crop to.
  if (maxX < 0) return { ...image, canvasFraction: 1 }

  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const pixels = new Uint8Array(width * height * 4)

  for (let y = 0; y < height; y++) {
    const from = ((minY + y) * image.width + minX) * 4
    pixels.set(image.pixels.subarray(from, from + width * 4), y * width * 4)
  }

  return { width, height, pixels, canvasFraction: width / image.width }
}

/**
 * The smallest canvas worth drawing on. Also the floor `scale` cannot pull a
 * canvas below: a window this short has no resolution left to trade away.
 */
export const MIN_CANVAS_COLS = 16

/**
 * The widest sprite canvas that fits the window, never exceeding the source
 * resolution.
 *
 * Bigger terminal, sharper sprite, up to pixel-perfect. Capping at the native
 * width matters: upscaling past it would blur art that was drawn pixel by pixel.
 *
 * Height is almost always what binds, not width — a canvas costs half as many rows
 * as it does columns, and terminals are wider than they are tall. So this is where
 * resolution is lost, and why `scale` only ever goes down: full size is already
 * whatever the window can afford.
 *
 * @param {{cols: number, rows: number}} size terminal size
 * @param {number} reservedRows rows the surrounding interface needs
 * @param {number} scale fraction of the available room to use, 0.4 to 1
 */
export function fitCanvasCols({ cols, rows }, reservedRows = 7, scale = 1) {
  // A canvas C columns wide is C/2 rows tall, since each cell stacks two pixels.
  const byHeight = Math.max(MIN_CANVAS_COLS, (rows - reservedRows) * 2)
  const byWidth = Math.max(MIN_CANVAS_COLS, cols - 4)
  const room = Math.min(NATIVE_CANVAS_COLS, byWidth, byHeight)
  return Math.max(MIN_CANVAS_COLS, Math.round(room * scale))
}

/**
 * Rendered sprites, keyed by what they were rendered from.
 *
 * A battle repaints on every keystroke and decodes two sprites each time. The
 * results only change when the size does, so there is no reason to redo the work.
 */
const renderCache = new Map()

/**
 * Loads a sprite from disk and renders it for the current terminal.
 *
 * `cols` is the width the full 96x96 canvas would occupy; the sprite itself takes
 * up its share of that, so passing the same `cols` for every Pokemon gives
 * consistent scaling across the whole Pokedex.
 *
 * @returns {{ rows: string[], cols: number }}
 */
export function renderSprite(pngPath, options = {}) {
  const { cols = 36 } = options
  const key = `${pngPath}|${cols}`

  const hit = renderCache.get(key)
  if (hit) return hit

  const rendered = renderSpriteUncached(pngPath, cols)
  // Plenty for a battle plus a Pokedex page, and bounded so a long session
  // browsing all 151 cannot grow without limit. Evict the oldest rather than
  // clearing: a wholesale clear throws away the two sprites currently on screen,
  // which the very next frame would immediately decode again.
  if (renderCache.size >= 64) renderCache.delete(renderCache.keys().next().value)
  renderCache.set(key, rendered)
  return rendered
}

/**
 * Renders a sprite from disk, or null if there is nothing to draw.
 *
 * Every view wants the same answer to "draw this if you can": a missing sprite
 * and an undecodable one are both just no art, and neither is worth interrupting
 * a battle over.
 */
export function loadSprite(pngPath, options = {}) {
  if (!existsSync(pngPath)) return null
  try {
    return renderSprite(pngPath, options)
  } catch {
    return null
  }
}

/**
 * Places a rendered sprite into a frame.
 *
 * @param {number} indent the left margin in columns.
 * @returns {number} rows consumed, so callers can budget height.
 */
export function placeSprite(lines, sprite, indent) {
  for (const row of sprite.rows) lines.push(' '.repeat(indent) + row)
  return sprite.rows.length
}

/** Rows a rendered sprite occupies. */
export function spriteHeight(sprite) {
  return sprite.rows.length
}

function renderSpriteUncached(pngPath, cols) {
  const sprite = cropToContent(decodePng(readFileSync(pngPath)))
  const targetCols = Math.max(4, Math.round(cols * sprite.canvasFraction))

  return {
    rows: blockRows(sprite, targetCols),
    cols: targetCols,
  }
}
