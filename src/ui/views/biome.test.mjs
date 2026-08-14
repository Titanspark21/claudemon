import { expect, test } from 'vitest'

import { BIOME_IDS, MINUTE_MS } from '../../constants.mjs'
import { stripAnsi, visibleLength } from '../text.mjs'
import {
  biomeName,
  drawBiomeStatus,
  drawFork,
  forkOptions,
  onBiomeKey,
} from './biome.mjs'

const SIZE = { cols: 80, rows: 24 }

const NAMES = {
  meadow: 'Meadow',
  forest: 'Forest',
  wetlands: 'Wetlands',
  coast: 'Coast',
  highlands: 'Highlands',
  badlands: 'Badlands',
  frostlands: 'Frostlands',
  'city-powerworks': 'City & Powerworks',
  'mystic-ruins': 'Mystic Ruins',
}

const expedition = (patch = {}) => ({
  biome: 'meadow',
  elapsedMs: 12 * MINUTE_MS,
  forcedTargetMs: 40 * MINUTE_MS,
  optionalOffered: false,
  optionalPaths: ['forest', 'wetlands'],
  pendingDeparture: null,
  ...patch,
})

const plain = (lines) => lines.map(stripAnsi).join('\n')

test('Should name all nine biomes with a distinct monochrome-readable marker', () => {
  const markers = new Set()

  for (const biome of BIOME_IDS) {
    const lines = drawBiomeStatus(expedition({ biome }), SIZE)
    const text = plain(lines)

    expect(text).toContain(NAMES[biome])

    const marker = stripAnsi(lines[0]).trimStart()[0]
    expect(marker, `${biome} needs a visible marker`).toBeTruthy()
    markers.add(marker)
  }

  expect(markers.size).toBe(BIOME_IDS.length)
})

test('Should keep defensive status fallbacks compact', () => {
  expect(drawBiomeStatus(null, SIZE)).toEqual([])
  expect(biomeName(undefined)).toBe('Unknown biome')

  const tiny = drawBiomeStatus(
    expedition({
      biome: 'unknown-place',
      elapsedMs: -MINUTE_MS,
      forcedTargetMs: 0,
    }),
    { cols: 10, rows: 12 },
  )
  const complete = plain(
    drawBiomeStatus(
      expedition({ elapsedMs: 90 * MINUTE_MS, forcedTargetMs: 40 * MINUTE_MS }),
      SIZE,
    ),
  )

  expect(tiny.every((line) => visibleLength(line) <= 10)).toBe(true)
  const defaults = plain(
    drawBiomeStatus(
      expedition({ elapsedMs: null, forcedTargetMs: null }),
      undefined,
    ),
  )

  expect(complete).toContain('100%')
  expect(defaults).toContain('0/1 min')
})

test('Should reject incomplete fork state without rendering choices', () => {
  expect(forkOptions(null)).toEqual([])
  expect(forkOptions(expedition())).toEqual([])
  expect(
    forkOptions(expedition({ optionalOffered: true, optionalDismissed: true })),
  ).toEqual([])
  expect(
    forkOptions(expedition({ optionalOffered: true, optionalPaths: null })),
  ).toEqual([])
  expect(
    forkOptions(
      expedition({ optionalOffered: true, optionalPaths: ['forest'] }),
    ),
  ).toEqual([])
  expect(drawFork(expedition(), 0, SIZE)).toEqual([])
})

test('Should stack optional choices in a narrow fork without dropping a destination', () => {
  const lines = drawFork(expedition({ optionalOffered: true }), 2, {
    cols: 32,
    rows: 18,
  })
  const text = plain(lines)

  expect(text).toContain('Forest')
  expect(text).toContain('Stay')
  expect(text).toMatch(/▶\s*Wetlands/)
  expect(lines.every((line) => visibleLength(line) <= 32)).toBe(true)
})

test('Should show compact visit progress on the persistent biome row', () => {
  const text = plain(drawBiomeStatus(expedition(), SIZE))

  expect(text).toContain('12')
  expect(text).toContain('40')
  expect(text).toMatch(/min|%/i)
})

test('Should show an optional fork with Stay selected between two destinations', () => {
  const lines = drawFork(expedition({ optionalOffered: true }), 1, SIZE)
  const text = plain(lines)

  expect(text).toMatch(/fork/i)
  expect(text).toContain('Forest')
  expect(text).toContain('Wetlands')
  expect(text).toMatch(/▶\s*Stay/i)
  expect(text).not.toMatch(/automatically/i)
})

test('Should show mandatory departure without Stay and warn about automatic choice', () => {
  const lines = drawFork(
    expedition({
      pendingDeparture: {
        paths: ['forest', 'wetlands'],
        atWorkedMs: 40 * MINUTE_MS,
      },
    }),
    0,
    SIZE,
  )
  const text = plain(lines)

  expect(text).toMatch(/move|depart/i)
  expect(text).toContain('Forest')
  expect(text).toContain('Wetlands')
  expect(text).not.toMatch(/\bStay\b/i)
  expect(text).toMatch(/away|inactive/i)
  expect(text).toMatch(/automatic/i)
})

test('Should keep status and fork rows inside a narrow terminal', () => {
  const size = { cols: 32, rows: 18 }
  const state = expedition({
    biome: 'city-powerworks',
    pendingDeparture: {
      paths: ['mystic-ruins', 'badlands'],
      atWorkedMs: 40 * MINUTE_MS,
    },
  })
  const lines = [...drawBiomeStatus(state, size), ...drawFork(state, 0, size)]

  expect(lines.length).toBeLessThanOrEqual(6)
  expect(lines.every((line) => visibleLength(line) <= size.cols)).toBe(true)
  expect(plain(lines)).toContain('City & Powerworks')
})

test('Should ignore unrelated keys and support reverse/space fork controls', () => {
  const chosen = []
  const sounds = []
  const ctx = {
    save: { expedition: expedition({ optionalOffered: true }) },
    biomeSelection: undefined,
    chooseBiomePath: (choice) => chosen.push(choice),
    playSound: (sound) => sounds.push(sound),
  }

  onBiomeKey(ctx, { name: 'q' })
  expect(chosen).toEqual([])
  expect(sounds).toEqual([])

  onBiomeKey(ctx, { name: 'left' })
  expect(ctx.biomeSelection).toBe(2)

  onBiomeKey(ctx, { name: 'up' })
  expect(ctx.biomeSelection).toBe(1)

  onBiomeKey(ctx, { name: 'down' })
  expect(ctx.biomeSelection).toBe(2)

  onBiomeKey(ctx, { name: 'space' })
  expect(chosen).toEqual(['wetlands'])
  expect(sounds).toEqual(['cursor', 'cursor', 'cursor', 'select'])

  ctx.save.expedition = expedition()
  onBiomeKey(ctx, { name: 'enter' })
  expect(chosen).toEqual(['wetlands'])
})

test('Should use Stay only for optional forks and route mandatory choices through the app', () => {
  const chosen = []
  const sounds = []
  const ctx = {
    save: { expedition: expedition({ optionalOffered: true }) },
    biomeSelection: 1,
    chooseBiomePath: (choice) => chosen.push(choice),
    playSound: (sound) => sounds.push(sound),
  }

  onBiomeKey(ctx, { name: 'enter' })
  expect(chosen).toEqual(['stay'])

  ctx.save.expedition = expedition({
    pendingDeparture: {
      paths: ['forest', 'wetlands'],
      atWorkedMs: 40 * MINUTE_MS,
    },
  })
  ctx.biomeSelection = 0
  onBiomeKey(ctx, { name: 'right' })
  onBiomeKey(ctx, { name: 'enter' })

  expect(ctx.biomeSelection).toBe(1)
  expect(chosen).toEqual(['stay', 'wetlands'])
  expect(sounds).toEqual(['select', 'cursor', 'select'])
})
