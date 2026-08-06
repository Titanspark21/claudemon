import { halfBlockRows } from './sprite.mjs'

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

const WALK = [
  { art: WALKER.stride, lift: 0 },
  { art: WALKER.pass, lift: 1 },
]

const IDLE = { art: WALKER.stand, lift: 0 }

const PALETTE = {
  '.': null,
  c: [230, 72, 66],
  d: [150, 34, 40],
  s: [246, 206, 168],
  e: [40, 36, 46],
  t: [72, 132, 224],
  p: [58, 68, 108],
  b: [92, 62, 44],
}

const BEHIND = { '.': null, g: [44, 92, 52], G: [62, 130, 66] }
const IN_FRONT = { '.': null, g: [80, 172, 78], G: [116, 208, 98] }

// prettier-ignore
const BACK_TILE = [
  '...g......g.....',
  '..gGg....gGg..g.',
  '.gGGGg.gGGGGggGg',
  'GGGGGGGGGGGGGGGG',
]

// prettier-ignore
const FRONT_TILE = [
  '..g....g...g....',
  '.gGg..gGg.gGg.g.',
  'gGGGgGGGGgGGGgGg',
  'GGGGGGGGGGGGGGGG',
]

const WALKER_COLS = 10

const WALKER_TOP = 1
const BACK_TOP = 8
const FRONT_TOP = 10

export const BAND_PX = FRONT_TOP + FRONT_TILE.length

export function bandRows(scale = 1) {
  return (BAND_PX * scale) / 2
}

export function bandScale({ rows }) {
  return rows >= 44 ? 2 : 1
}

export function walkerColumn(step, width, scale = 1) {
  const walker = WALKER_COLS * scale
  const span = width + walker
  return ((((step * scale + walker) % span) + span) % span) - walker
}

function stamp(pixels, art, palette, { x, y, scale, width, height }) {
  for (let row = 0; row < art.length * scale; row++) {
    const target = y + row
    if (target < 0 || target >= height) continue
    const source = art[Math.floor(row / scale)]

    for (let column = 0; column < source.length * scale; column++) {
      const at = x + column
      if (at < 0 || at >= width) continue

      const colour = palette[source[Math.floor(column / scale)]]
      if (!colour) continue

      const offset = (target * width + at) * 4
      pixels[offset] = colour[0]
      pixels[offset + 1] = colour[1]
      pixels[offset + 2] = colour[2]
      pixels[offset + 3] = 255
    }
  }
}

function tile(pixels, art, palette, { y, phase = 0, scale, width, height }) {
  const step = art[0].length * scale
  const from = -(((phase % step) + step) % step)

  for (let x = from; x < width; x += step) {
    stamp(pixels, art, palette, { x, y, scale, width, height })
  }
}

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

  tile(pixels, FRONT_TILE, IN_FRONT, {
    y: FRONT_TOP * scale,
    phase: Math.floor((FRONT_TILE[0].length * scale) / 2),
    scale,
    width,
    height,
  })

  return { width, height, pixels }
}

export function grassLines(options) {
  const image = bandImage(options)
  return halfBlockRows(image, image.width)
}
