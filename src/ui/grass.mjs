// The patch of grass on the home screen, and whoever is walking through it.
//
// Drawn the way sprites are — half-block cells, one pixel across and two down —
// but composed a pixel at a time rather than decoded from a file. That is what
// buys the one thing this scene is for: the walker goes down between two layers
// of grass, so the front one passes over their boots and they are *in* the field
// rather than standing on a picture of it.
//
// Pure, and a function of one number. The companion owns that number and only
// moves it on while Claude is working, so a quiet screen costs nothing at all.

import { halfBlockRows } from './sprite.mjs'

/**
 * Everything above the legs, 10 pixels across.
 *
 * Ten is what a person needs at this size: a cap wide enough to have a brim, a
 * face wide enough to hold two eyes with a gap between them, and shoulders wider
 * than the head. Below eight it stops being a person and becomes a smudge.
 */
const TORSO = [
  '...cccc...',
  '..cccccc..',
  '.dddddddd.',
  '..ssssss..',
  '..sesses..',
  '..tttttt..',
  '.stttttts.',
  '.stttttts.',
  '..pppppp..',
]

/** Legs and boots. The only part of them that moves. */
const LEGS = {
  stand: ['..pp..pp..', '..bb..bb..'],
  stride: ['.pp....pp.', '.bb....bb.'],
  pass: ['...pppp...', '...bbbb...'],
}

const WALKER = {
  stand: [...TORSO, ...LEGS.stand],
  stride: [...TORSO, ...LEGS.stride],
  pass: [...TORSO, ...LEGS.pass],
}

/**
 * The walk, in two frames, which is what the games themselves used.
 *
 * `lift` is the bob: the body rises by a pixel as the legs pass under it and
 * drops again as the next foot lands. Two frames of legs on their own read as a
 * twitch — it is the bob that makes the whole figure read as walking, and it is
 * what carries the frames where a blade happens to be crossing the boots.
 */
const WALK = [
  { art: WALKER.stride, lift: 0 },
  { art: WALKER.pass, lift: 1 },
]

/** Not walking: feet together, nothing moving. */
const IDLE = { art: WALKER.stand, lift: 0 }

const PALETTE = {
  '.': null,
  c: [230, 72, 66], // cap
  d: [150, 34, 40], // its brim, in shadow
  s: [246, 206, 168], // skin
  e: [40, 36, 46], // eyes
  t: [72, 132, 224], // shirt
  p: [58, 68, 108], // trousers
  b: [92, 62, 44], // boots
}

/**
 * The grass, twice over: dimmer behind the walker and brighter in front of them.
 * Two shades of the same art is the whole of the depth in this scene.
 */
const BEHIND = { '.': null, g: [44, 92, 52], G: [62, 130, 66] }
const IN_FRONT = { '.': null, g: [80, 172, 78], G: [116, 208, 98] }

/**
 * The far grass: blades of uneven height over a solid line.
 *
 * Sixteen across rather than eight, and deliberately irregular. A short tile
 * repeats often enough to read as a pattern, and a field that reads as a pattern
 * reads as a hedge.
 */
const BACK_TILE = [
  '...g......g.....',
  '..gGg....gGg..g.',
  '.gGGGg.gGGGGggGg',
  'GGGGGGGGGGGGGGGG',
]

/**
 * The near grass, drawn over the walker: blades, then solid ground.
 *
 * Its bottom two rows are opaque on purpose. Every pixel below the far grass's
 * line has to be filled by something, because a gap there is not a gap in the
 * grass — it is the terminal showing through the middle of the field.
 */
const FRONT_TILE = [
  '..g....g...g....',
  '.gGg..gGg.gGg.g.',
  'gGGGgGGGGgGGGgGg',
  'GGGGGGGGGGGGGGGG',
]

const WALKER_COLS = 10

/**
 * Where each layer sits in the band, in source pixels from the top.
 *
 * The three numbers are one decision: the walker's boots land in the top half of
 * the near grass, so the blades cross their ankles and the legs stay in the
 * clear. Bury the legs and the walk stops reading as a walk.
 */
const WALKER_TOP = 1
const BACK_TOP = 8
const FRONT_TOP = 10

/**
 * The band's height in source pixels.
 *
 * Even, and it has to stay even: a half-block row holds two pixels, and an odd
 * band would be resampled to fit rather than drawn one for one.
 */
export const BAND_PX = FRONT_TOP + FRONT_TILE.length

/** Terminal rows the band occupies. */
export function bandRows(scale = 1) {
  return (BAND_PX * scale) / 2
}

/**
 * How big to draw it.
 *
 * A tall window gets a bigger walker rather than more empty space, and pixel art
 * only ever scales by whole pixels, so nothing is ever blurred. Two is as far as
 * it goes: the band is already seven rows at scale one, and this screen has other
 * things to say.
 */
export function bandScale({ rows }) {
  return rows >= 44 ? 2 : 1
}

/**
 * Where the walker is, in pixels from the left of the band.
 *
 * They walk off the right-hand edge and come back on the left rather than turning
 * round at it: this is a strip of a field that carries on, not a room. Step zero
 * puts them against the left edge, so the first thing a session draws is a whole
 * person rather than half of one.
 */
export function walkerColumn(step, width, scale = 1) {
  const walker = WALKER_COLS * scale
  const span = width + walker
  return (((step * scale + walker) % span) + span) % span - walker
}

/**
 * Draws one piece of art into the band, clipped to it.
 *
 * Nearest neighbour by index arithmetic rather than by building a scaled copy —
 * pixel art scales no other way, and there is nothing here worth allocating for.
 */
function stamp(pixels, art, palette, { x, y, scale, width, height }) {
  for (let row = 0; row < art.length * scale; row++) {
    const target = y + row
    if (target < 0 || target >= height) continue
    const source = art[Math.floor(row / scale)]

    for (let column = 0; column < source.length * scale; column++) {
      const at = x + column
      if (at < 0 || at >= width) continue

      const colour = palette[source[Math.floor(column / scale)]]
      // Transparent, and it stays transparent: the gaps between the blades are
      // what let the layer behind them show through.
      if (!colour) continue

      const offset = (target * width + at) * 4
      pixels[offset] = colour[0]
      pixels[offset + 1] = colour[1]
      pixels[offset + 2] = colour[2]
      pixels[offset + 3] = 255
    }
  }
}

/** The same art repeated the width of the band, starting `phase` pixels in. */
function tile(pixels, art, palette, { y, phase = 0, scale, width, height }) {
  const step = art[0].length * scale
  const from = -(((phase % step) + step) % step)

  for (let x = from; x < width; x += step) {
    stamp(pixels, art, palette, { x, y, scale, width, height })
  }
}

/**
 * One frame of the band, as RGBA pixels.
 *
 * The three layers, in the only order that means anything: the far grass, then
 * whoever is walking through it, then the near grass over the top of them.
 *
 * Separate from the rows it becomes because pixels are what this is really about
 * — it is where the tests can ask whether the walker is behind the front blades
 * without going through a screenful of escape sequences.
 *
 * @param {{cols: number, step?: number, walking?: boolean, scale?: number}} options
 *   `step` is how far the walk has got, and doubles as the frame number.
 */
export function bandImage({ cols, step = 0, walking = false, scale = 1 }) {
  const width = Math.max(1, Math.floor(cols))
  const height = BAND_PX * scale
  const pixels = new Uint8Array(width * height * 4)
  const frame = walking ? WALK[step % WALK.length] : IDLE

  tile(pixels, BACK_TILE, BEHIND, { y: BACK_TOP * scale, scale, width, height })

  stamp(pixels, frame.art, PALETTE, {
    x: walkerColumn(step, width, scale),
    y: (WALKER_TOP - frame.lift) * scale,
    scale,
    width,
    height,
  })

  // Half a tile out of step with the layer behind it, so the two do not line up
  // into columns and give the field away as a repeat.
  tile(pixels, FRONT_TILE, IN_FRONT, {
    y: FRONT_TOP * scale,
    phase: Math.floor((FRONT_TILE[0].length * scale) / 2),
    scale,
    width,
    height,
  })

  return { width, height, pixels }
}

/**
 * The whole band, as terminal rows.
 *
 * Rows rather than overlays: nothing here is drawn on top of anything the
 * renderer does not know about, so the frame diff can handle it like any other
 * line — and a still walker costs nothing, because the rows come out identical.
 */
export function grassLines(options) {
  const image = bandImage(options)
  // The band is already the width it will be drawn at, so this is a pixel for
  // pixel pass rather than a resample.
  return halfBlockRows(image, image.width)
}
