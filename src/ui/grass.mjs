import {
  BACK_TILE,
  BACK_TOP,
  BAND_SCALE_ROW_BREAKPOINT,
  FRONT_TILE,
  FRONT_TOP,
  GRASS_BEHIND,
  GRASS_IN_FRONT,
  IDLE,
  WALK,
  WALKER_COLS,
  WALKER_PALETTE,
  WALKER_TOP,
} from './constants.mjs'
import { halfBlockRows } from './sprite.mjs'

export const BAND_PX = FRONT_TOP + FRONT_TILE.length

export const bandRows = (scale = 1) => (BAND_PX * scale) / 2

export const bandScale = ({ rows }) => {
  return rows >= BAND_SCALE_ROW_BREAKPOINT ? 2 : 1
}

export const walkerColumn = (step, width, scale = 1) => {
  const walker = WALKER_COLS * scale
  const span = width + walker

  return ((((step * scale + walker) % span) + span) % span) - walker
}

const stamp = (pixels, art, palette, { x, y, scale, width, height }) => {
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

const tile = (pixels, art, palette, { y, phase = 0, scale, width, height }) => {
  const step = art[0].length * scale
  const from = -(((phase % step) + step) % step)

  for (let x = from; x < width; x += step) {
    stamp(pixels, art, palette, { x, y, scale, width, height })
  }
}

export const bandImage = ({ cols, step = 0, walking = false, scale = 1 }) => {
  const width = Math.max(1, Math.floor(cols))
  const height = BAND_PX * scale
  const pixels = new Uint8Array(width * height * 4)
  const frame = walking ? WALK[step % WALK.length] : IDLE

  tile(pixels, BACK_TILE, GRASS_BEHIND, {
    y: BACK_TOP * scale,
    scale,
    width,
    height,
  })

  stamp(pixels, frame.art, WALKER_PALETTE, {
    x: walkerColumn(step, width, scale),
    y: (WALKER_TOP - frame.lift) * scale,
    scale,
    width,
    height,
  })

  tile(pixels, FRONT_TILE, GRASS_IN_FRONT, {
    y: FRONT_TOP * scale,
    phase: Math.floor((FRONT_TILE[0].length * scale) / 2),
    scale,
    width,
    height,
  })

  return { width, height, pixels }
}

export const grassLines = (options) => {
  const image = bandImage(options)

  return halfBlockRows(image, image.width)
}
