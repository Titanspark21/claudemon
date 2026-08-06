// A small PNG decoder, so sprites need no dependencies.
//
// Only what the Pokemon sprites actually use: non-interlaced images, every colour
// type, bit depths 1 to 8. node:zlib does the inflating, which is the only hard
// part of PNG. Decoding a 96x96 sprite takes about a millisecond, so the
// companion does it on demand rather than shipping a pre-decoded copy.

import { inflateSync } from 'node:zlib'

export const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft
  const dLeft = Math.abs(estimate - left)
  const dAbove = Math.abs(estimate - above)
  const dUpperLeft = Math.abs(estimate - upperLeft)
  if (dLeft <= dAbove && dLeft <= dUpperLeft) return left
  if (dAbove <= dUpperLeft) return above
  return upperLeft
}

/** Reverses the per-scanline filters PNG applies before compression. */
function unfilter(raw, width, height, channels, bitDepth) {
  const bytesPerPixel = Math.max(1, Math.ceil((channels * bitDepth) / 8))
  const scanlineBytes = Math.ceil((width * channels * bitDepth) / 8)
  const out = Buffer.alloc(height * scanlineBytes)

  let rawOffset = 0
  for (let row = 0; row < height; row++) {
    const filter = raw[rawOffset++]
    const lineStart = row * scanlineBytes
    const prevStart = lineStart - scanlineBytes

    for (let i = 0; i < scanlineBytes; i++) {
      const value = raw[rawOffset + i]
      const left = i >= bytesPerPixel ? out[lineStart + i - bytesPerPixel] : 0
      const above = row > 0 ? out[prevStart + i] : 0
      const upperLeft = row > 0 && i >= bytesPerPixel ? out[prevStart + i - bytesPerPixel] : 0

      let restored
      switch (filter) {
        case 0:
          restored = value
          break
        case 1:
          restored = value + left
          break
        case 2:
          restored = value + above
          break
        case 3:
          restored = value + ((left + above) >> 1)
          break
        case 4:
          restored = value + paeth(left, above, upperLeft)
          break
        default:
          throw new Error(`unsupported PNG filter ${filter} on row ${row}`)
      }
      out[lineStart + i] = restored & 0xff
    }
    rawOffset += scanlineBytes
  }
  return { data: out, scanlineBytes }
}

/** Reads sample `index` out of a scanline packed at fewer than 8 bits per sample. */
function readPacked(line, index, bitDepth) {
  const perByte = 8 / bitDepth
  const byte = line[Math.floor(index / perByte)]
  const shift = 8 - bitDepth * ((index % perByte) + 1)
  return (byte >> shift) & ((1 << bitDepth) - 1)
}

/**
 * Decodes a PNG buffer to straight RGBA.
 *
 * @returns {{ width: number, height: number, pixels: Uint8Array }} pixels is
 *   width * height * 4 bytes, in RGBA order.
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')

  let header = null
  let palette = null
  let transparency = null
  const idatChunks = []

  let offset = 8
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      }
    } else if (type === 'PLTE') {
      palette = data
    } else if (type === 'tRNS') {
      transparency = data
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }

    offset += 12 + length
  }

  if (!header) throw new Error('PNG has no IHDR')
  if (header.interlace) throw new Error('interlaced PNGs are not supported')

  const channels = CHANNELS[header.colorType]
  if (!channels) throw new Error(`unsupported PNG colour type ${header.colorType}`)

  const { width, height, bitDepth, colorType } = header
  const raw = inflateSync(Buffer.concat(idatChunks))
  const { data, scanlineBytes } = unfilter(raw, width, height, channels, bitDepth)

  const pixels = new Uint8Array(width * height * 4)
  const maxSample = (1 << bitDepth) - 1

  for (let y = 0; y < height; y++) {
    const line = data.subarray(y * scanlineBytes, (y + 1) * scanlineBytes)

    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4
      // No initial colour: every branch below writes all three. Alpha is the one
      // that has a default, because only two colour types carry it.
      let r
      let g
      let b
      let a = 255

      if (colorType === 3) {
        const index = bitDepth === 8 ? line[x] : readPacked(line, x, bitDepth)
        r = palette[index * 3]
        g = palette[index * 3 + 1]
        b = palette[index * 3 + 2]
        if (transparency && index < transparency.length) a = transparency[index]
      } else if (bitDepth === 8 || bitDepth === 16) {
        // 16-bit samples are big-endian; the high byte is all we need for display.
        const stride = bitDepth === 16 ? 2 : 1
        const base = x * channels * stride
        const sampleAt = (channel) => line[base + channel * stride]

        if (colorType === 0) {
          r = g = b = sampleAt(0)
        } else if (colorType === 4) {
          r = g = b = sampleAt(0)
          a = sampleAt(1)
        } else {
          r = sampleAt(0)
          g = sampleAt(1)
          b = sampleAt(2)
          if (colorType === 6) a = sampleAt(3)
        }
      } else {
        // Sub-byte greyscale, scaled up to 0..255.
        const sample = readPacked(line, x * channels, bitDepth)
        r = g = b = Math.round((sample / maxSample) * 255)
      }

      pixels[target] = r
      pixels[target + 1] = g
      pixels[target + 2] = b
      pixels[target + 3] = a
    }
  }

  return { width, height, pixels }
}
