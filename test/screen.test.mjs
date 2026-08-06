import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createScreen } from '../src/ui/screen.mjs'
import { ballCells, ballOverlays, ballSteps } from '../src/ui/ball.mjs'
import {
  BAND_PX,
  bandImage,
  bandRows,
  grassLines,
  walkerColumn,
} from '../src/ui/grass.mjs'
import {
  HIT_FRAMES,
  draw as drawBattle,
  fitBattleSprites,
  hitOverlays,
} from '../src/ui/views/battle.mjs'
import { draw as drawBox } from '../src/ui/views/box.mjs'
import { draw as drawDex } from '../src/ui/views/dex.mjs'
import { draw as drawOptions } from '../src/ui/views/options.mjs'
import { draw as drawShop } from '../src/ui/views/shop.mjs'
import { draw as drawTeam } from '../src/ui/views/team.mjs'
import { DEFAULT_CONFIG } from '../src/config.mjs'
import { itemsInBag } from '../src/shop.mjs'
import {
  BLOCK_GRIDS,
  MIN_CANVAS_COLS,
  NATIVE_CANVAS_COLS,
  blockRows,
  fitCanvasCols,
} from '../src/ui/sprite.mjs'
import { genderTag } from '../src/ui/widgets.mjs'
import {
  cursor,
  gray,
  reset,
  screen as screenCodes,
  stripAnsi,
  visibleLength,
} from '../src/ui/ansi.mjs'

function fakeTerminal({ cols = 40, rows = 12 } = {}) {
  const writes = []

  const output = {
    columns: cols,
    rows,
    write: (text) => writes.push(text),
    on: () => {},
    off: () => {},
  }

  const input = {
    isTTY: false,
    on: () => {},
    off: () => {},
    resume: () => {},
    pause: () => {},
    setRawMode: () => {},
  }

  return {
    screen: createScreen({ input, output }),
    frame: () => (writes.length === 0 ? '' : writes[writes.length - 1]),
    count: () => writes.length,
    since: (mark) => writes.slice(mark).join(''),
  }
}

function repainted(frame, row) {
  return frame.includes(cursor.to(row, 1))
}

const SPRITE = ['....', '.##.', '.##.', '....']

test('an unchanged frame writes nothing at all', () => {
  const term = fakeTerminal()

  term.screen.render(SPRITE)
  const after = term.count()

  term.screen.render(SPRITE)
  assert.equal(
    term.count(),
    after,
    'a second identical frame is not worth a byte',
  )
})

test('only the row that changed is repainted', () => {
  const term = fakeTerminal()
  term.screen.render(['one', 'two', 'three'])
  term.screen.render(['one', 'CHANGED', 'three'])

  const frame = term.frame()
  assert.ok(frame.includes('CHANGED'))
  assert.ok(!frame.includes('one'), 'the untouched rows stay untouched')
  assert.ok(!frame.includes('three'))
})

const badge = (row, sequence, key) => ({ row, col: 2, sequence, rows: 1, key })

test('an overlay goes out once and then stays put', () => {
  const term = fakeTerminal()

  term.screen.render(SPRITE, [badge(2, 'XX', 'a')])
  assert.ok(term.frame().includes('XX'))

  const after = term.count()
  term.screen.render(SPRITE, [badge(2, 'XX', 'a')])
  assert.equal(term.count(), after, 'nothing moved, so nothing is redrawn')
})

test('the row under a vanished overlay is put back', () => {
  const term = fakeTerminal()
  term.screen.render(SPRITE, [badge(2, 'XX', 'a')])

  term.screen.render(SPRITE)

  const frame = term.frame()
  assert.ok(repainted(frame, 2), 'the row the overlay covered is repainted')
  assert.ok(frame.includes(SPRITE[1]), 'from what was underneath it')
  assert.ok(!frame.includes('XX'))
})

test('a changed overlay is redrawn over a restored row', () => {
  const term = fakeTerminal()
  term.screen.render(SPRITE, [badge(2, 'XX', 'a')])

  term.screen.render(SPRITE, [badge(2, 'YY', 'b')])

  const frame = term.frame()
  assert.ok(frame.includes(SPRITE[1]), 'the sprite row goes back down first')
  assert.ok(frame.includes('YY'), 'and the new frame on top of it')
  assert.ok(frame.indexOf(SPRITE[1]) < frame.indexOf('YY'), 'in that order')
})

test('an overlay is redrawn when the line under it is repainted', () => {
  const term = fakeTerminal()
  const tall = { row: 2, col: 1, sequence: 'OVER', rows: 2, key: 'sprite' }

  term.screen.render(['a', '', '', 'd'], [tall])
  term.screen.render(['a', '', 'CHANGED', 'd'], [tall])

  assert.ok(term.frame().includes('OVER'), 'so it has to go back out')
})

test('an overlay is left alone when an unrelated line changes', () => {
  const term = fakeTerminal()
  const over = { row: 2, col: 1, sequence: 'OVER', rows: 1, key: 'sprite' }

  term.screen.render(['a', '', 'c'], [over])
  term.screen.render(['a', '', 'CHANGED'], [over])

  assert.ok(!term.frame().includes('OVER'), 'nothing disturbed it')
})

const WIPE = reset + ' '.repeat(40)

function rowWrite(frame, row) {
  const jump = cursor.to(row, 1)
  const at = frame.indexOf(jump)
  if (at < 0) return null

  const rest = frame.slice(at + jump.length)
  // eslint-disable-next-line no-control-regex
  const next = rest.search(/\x1b\[\d+;\d+H/)
  return next < 0 ? rest : rest.slice(0, next)
}

function reclaimed(frame, row, cols = 40) {
  const write = rowWrite(frame, row)
  return (
    write != null &&
    visibleLength(write) === cols &&
    !write.includes(screenCodes.clearLine)
  )
}

test('the cells a vanished overlay covered are written over, not only erased', () => {
  const term = fakeTerminal()
  const tall = { row: 2, col: 1, sequence: 'OVER', rows: 2, key: 'sprite' }

  term.screen.render(['a', '', '', 'd'], [tall])
  term.screen.render(['a', '', '', 'd'])

  const frame = term.frame()
  assert.ok(frame.includes(cursor.to(2, 1) + WIPE), 'the first row it covered')
  assert.ok(frame.includes(cursor.to(3, 1) + WIPE), 'and the second')
  assert.ok(
    !frame.includes(cursor.to(1, 1) + WIPE),
    'and nothing it did not cover',
  )
})

test('rows that fall off the bottom of a shorter frame are wiped too', () => {
  const term = fakeTerminal({ rows: 8 })
  term.screen.render(['a', 'b', 'c', 'd', 'e'])

  term.screen.render(['a'])

  const frame = term.frame()
  assert.ok(
    frame.includes(cursor.to(3, 1) + WIPE),
    'a row nothing will be drawn into',
  )
  assert.ok(
    frame.includes(cursor.to(2, 1) + screenCodes.clearBelow),
    'and then the erase',
  )
})

test('a repaint wipes every row it draws, since it no longer knows what was there', () => {
  const term = fakeTerminal()
  term.screen.render(
    ['a', 'b', 'c'],
    [{ row: 2, col: 1, sequence: 'OVER', rows: 1, key: 'sprite' }],
  )

  term.screen.repaint()
  term.screen.render(['a', 'b', 'c'])

  const frame = term.frame()
  for (const row of [1, 2, 3]) {
    assert.ok(reclaimed(frame, row), `row ${row} is written over, edge to edge`)
  }
  for (const row of [4, 12]) {
    assert.ok(
      frame.includes(cursor.to(row, 1) + WIPE),
      `row ${row} is wiped too`,
    )
  }
})

test('a reclaimed row is written to the edge, and not erased afterwards', () => {
  const term = fakeTerminal()
  const tall = { row: 2, col: 1, sequence: 'OVER', rows: 2, key: 'sprite' }

  term.screen.render(['a', '', '', 'd'], [tall])
  term.screen.render(['a', '', 'text', 'd'])

  const frame = term.frame()
  assert.ok(reclaimed(frame, 2), 'the blank row it covered')
  assert.ok(reclaimed(frame, 3), 'and the one with text on it')
  assert.ok(
    rowWrite(frame, 3).includes('text'),
    'which still says what it says',
  )
})

test('an erase never follows the spaces that took a row back from an overlay', () => {
  const term = fakeTerminal({ rows: 8 })
  term.screen.render(
    ['a', 'b', 'c', 'd', 'e'],
    [{ row: 4, col: 1, sequence: 'OVER', rows: 2, key: 'sprite' }],
  )

  term.screen.render(['a'])

  const frame = term.frame()
  const erase = frame.indexOf(screenCodes.clearBelow)
  assert.ok(erase >= 0, 'the erase still goes out')
  assert.ok(
    frame.lastIndexOf(WIPE) > erase,
    'but the spaces are the last thing those rows see',
  )
})

test('a frame that changes nothing still writes nothing after all that', () => {
  const term = fakeTerminal()
  term.screen.render(['a', 'b', 'c'])
  const after = term.count()

  term.screen.render(['a', 'b', 'c'])
  assert.equal(term.count(), after, 'wiping is for reclaimed rows only')
})

test('an overlay standing still costs nothing across a started screen', () => {
  const term = fakeTerminal()
  term.screen.start()
  term.screen.render(['a', '', 'c'], [badge(2, 'XX', 'a')])
  const mark = term.count()

  term.screen.render(['a', '', 'c'], [badge(2, 'XX', 'a')])
  assert.equal(term.since(mark), '', 'nothing moved, so nothing goes out')
})

test('an animating overlay is written away, not cleared away', () => {
  const term = fakeTerminal()
  term.screen.start()
  term.screen.render(SPRITE, [badge(2, 'XX', 'ball:1')])

  const mark = term.count()
  term.screen.render(SPRITE, [badge(2, 'YY', 'ball:2')])

  const frame = term.since(mark)
  assert.ok(!frame.includes(screenCodes.clear), 'no clear')
  assert.ok(frame.includes('YY'), 'just the next frame of it')
})

test('quitting writes over the screen before handing it back', () => {
  const term = fakeTerminal({ rows: 8 })
  term.screen.start()
  term.screen.render(
    ['a'],
    [{ row: 3, col: 1, sequence: 'OVER', rows: 2, key: 'sprite' }],
  )

  term.screen.stop()

  const frame = term.frame()
  for (let row = 1; row <= 8; row++) {
    assert.ok(
      frame.includes(cursor.to(row, 1) + WIPE),
      `row ${row} is written over`,
    )
  }
  assert.ok(
    frame.indexOf(WIPE) < frame.indexOf(screenCodes.exitAlt),
    'and all of it before the buffer goes away',
  )
})

test('a repaint forgets every overlay it had drawn', () => {
  const term = fakeTerminal()
  term.screen.render(SPRITE, [badge(2, 'XX', 'a')])

  term.screen.repaint()
  term.screen.render(SPRITE, [badge(2, 'XX', 'a')])

  assert.ok(
    term.frame().includes('XX'),
    'the screen is blank again, so it all goes back',
  )
})

test('the explosion is drawn as overlays, not as rows', () => {
  const overlays = hitOverlays(0, 9, 20, 3)

  assert.ok(
    overlays.length > HIT_FRAMES[3].length,
    'each row is split into its runs',
  )
  assert.ok(
    overlays.every((overlay) => !overlay.sequence.includes(' ')),
    'a space written over a sprite would punch a hole in it',
  )
  assert.ok(
    overlays.every((overlay) => overlay.key === 'hit:3'),
    'and the frame keys them',
  )
})

test('the explosion sits centred on the sprite it is hitting', () => {
  const centre = 30
  const overlays = hitOverlays(4, 10, centre, 2)

  const left = Math.min(...overlays.map((overlay) => overlay.col))
  const right = Math.max(
    ...overlays.map((overlay) => overlay.col + visibleLength(overlay.sequence)),
  )

  assert.ok(
    Math.abs((left + right) / 2 - (centre + 1)) <= 1,
    `${left}..${right} around ${centre}`,
  )
})

test('the explosion stays inside the sprite it is drawn over', () => {
  const overlays = hitOverlays(5, 2, 20, 4)

  assert.ok(overlays.length > 0, 'something should still be drawn')
  for (const overlay of overlays) {
    assert.ok(
      overlay.row >= 6 && overlay.row <= 7,
      `row ${overlay.row} is outside the sprite`,
    )
  }
})

test('a frame past the end of the animation draws nothing', () => {
  assert.deepEqual(hitOverlays(0, 9, 20, HIT_FRAMES.length), [])
})

const FIELD = {
  foe: { top: 2, rows: 10, indent: 40, cols: 20 },
  player: { top: 14, rows: 10, indent: 2, cols: 24 },
  scale: 1,
  cols: 78,
  maxRow: 26,
}

function everyFrame(result) {
  return ballSteps(result).map((step, frame) => ({ step, frame }))
}

test('the ball art is a rectangle, so its pixels line up in columns', () => {
  for (const scale of [1, 2]) {
    const cells = ballCells(scale)
    assert.ok(cells.length > 1, 'more than one row of cells')
    for (const row of cells) {
      assert.equal(
        row.length,
        cells[0].length,
        `scale ${scale} has a ragged row`,
      )
    }
  }
})

test('the ball is drawn as runs of blocks, never as spaces', () => {
  for (const { step, frame } of everyFrame({ shakes: 3, caught: false })) {
    const overlays = ballOverlays(step, FIELD, frame)
    assert.ok(overlays.length > 0, `frame ${frame} drew nothing`)

    for (const overlay of overlays) {
      const visible = stripAnsi(overlay.sequence)
      assert.ok(
        !visible.includes(' '),
        `frame ${frame} would punch a hole in the sprite`,
      )
      assert.ok(visible.length > 0, 'and an empty run is not worth an overlay')
      assert.equal(
        overlay.key,
        `ball:${frame}`,
        'the frame is what tells the renderer it moved',
      )
    }
  }
})

test('the ball stays inside the field it was given', () => {
  for (const { step, frame } of everyFrame({ shakes: 3, caught: false })) {
    for (const overlay of ballOverlays(step, FIELD, frame)) {
      assert.ok(
        overlay.row >= 1 && overlay.row <= FIELD.maxRow + 1,
        `row ${overlay.row}`,
      )
      assert.ok(overlay.col >= 1, `col ${overlay.col}`)
      assert.ok(
        overlay.col - 1 + visibleLength(overlay.sequence) <= FIELD.cols,
        `frame ${frame} ran off the right edge`,
      )
    }
  }
})

test('the ball comes to rest on the Pokemon it was thrown at', () => {
  const steps = ballSteps({ shakes: 0, caught: true })
  const frame = steps.length - 1
  const overlays = ballOverlays(steps[frame], FIELD, frame)

  const left = Math.min(...overlays.map((overlay) => overlay.col))
  const right = Math.max(
    ...overlays.map((overlay) => overlay.col + visibleLength(overlay.sequence)),
  )
  const centre = FIELD.foe.indent + Math.floor(FIELD.foe.cols / 2) + 1
  assert.ok(
    Math.abs((left + right) / 2 - centre) <= 1,
    `${left}..${right} around ${centre}`,
  )

  const rows = overlays.map((overlay) => overlay.row)
  assert.ok(Math.min(...rows) > FIELD.foe.top, 'below the top of it')
  assert.ok(
    Math.max(...rows) <= FIELD.foe.top + FIELD.foe.rows,
    'and standing on the ground',
  )
})

test('the throw starts on your side of the field', () => {
  const [first] = ballOverlays(ballSteps({})[0], FIELD, 0)
  assert.ok(
    first.row > FIELD.foe.top + FIELD.foe.rows,
    'down where your Pokemon is',
  )
  assert.ok(first.col < FIELD.foe.indent, 'and over on the left')
})

test('one wobble per shake the engine counted out', () => {
  const wobbles = (shakes) =>
    ballSteps({ shakes, caught: false }).filter((step) => step.kind === 'shake')

  assert.equal(wobbles(0).length, 0, 'a ball that never shook does not wobble')
  assert.equal(wobbles(3).length, wobbles(1).length * 3)
  assert.ok(
    wobbles(1).some((step) => step.tilt < 0) &&
      wobbles(1).some((step) => step.tilt > 0),
    'and it rocks both ways',
  )
})

test('the Pokemon is off the field for exactly as long as the ball is shut', () => {
  const held = ballSteps({ shakes: 4, caught: true })
  assert.ok(held.at(-1).hideFoe, 'a ball that held never opens again')

  const broke = ballSteps({ shakes: 1, caught: false })
  assert.equal(broke.at(-1).kind, 'burst')
  assert.ok(!broke.at(-1).hideFoe, 'one that failed puts it back')

  const first = broke.findIndex((step) => step.hideFoe)
  const last = broke.findLastIndex((step) => step.hideFoe)
  assert.ok(first > 0, 'it is still out there while the ball is in the air')
  assert.equal(
    last - first + 1,
    broke.filter((step) => step.hideFoe).length,
    'and it goes away once rather than flickering',
  )
})

const BAND_COLS = 64

function samePixel(one, other, x, y) {
  const at = (y * one.width + x) * 4
  for (let channel = 0; channel < 4; channel++) {
    if (one.pixels[at + channel] !== other.pixels[at + channel]) return false
  }
  return true
}

test('the band is drawn one pixel per pixel, at any size', () => {
  assert.equal(BAND_PX % 2, 0, 'a half-block row holds two pixels')

  for (const scale of [1, 2]) {
    const lines = grassLines({ cols: BAND_COLS, scale })
    assert.equal(
      lines.length,
      bandRows(scale),
      `scale ${scale} is the height it claims`,
    )
  }
})

test('every row of the band is exactly as wide as it was given room for', () => {
  for (const row of grassLines({ cols: BAND_COLS, step: 7, walking: true })) {
    assert.equal(visibleLength(row), BAND_COLS)
  }
})

test('the field has no holes in it', () => {
  const band = bandImage({ cols: BAND_COLS, step: 3, walking: true })

  for (let y = band.height - 3; y < band.height; y++) {
    for (let x = 0; x < band.width; x++) {
      assert.notEqual(
        band.pixels[(y * band.width + x) * 4 + 3],
        0,
        `hole at ${x},${y}`,
      )
    }
  }
})

test('the near blades pass in front of the walker', () => {
  const here = bandImage({ cols: BAND_COLS, step: 0, walking: true })
  const gone = bandImage({ cols: BAND_COLS, step: 24, walking: true })

  const boots = BAND_PX - 3
  let covered = 0
  let showing = 0
  for (let x = 0; x < 10; x++) {
    if (samePixel(here, gone, x, boots)) covered++
    else showing++
  }

  assert.ok(showing > 0, 'the boots are in the grass, not under it')
  assert.ok(covered > 0, 'and the blades in front of them are drawn over them')
})

test('walking looks different from standing still', () => {
  const standing = grassLines({ cols: BAND_COLS, step: 4, walking: false })
  const walking = grassLines({ cols: BAND_COLS, step: 4, walking: true })

  assert.notDeepEqual(walking, standing)
})

test('the walk crosses the field and comes back on the other side', () => {
  const seen = new Set()
  for (let step = 0; step < 1000; step++)
    seen.add(walkerColumn(step, BAND_COLS))

  assert.equal(
    walkerColumn(0, BAND_COLS),
    0,
    'a new session starts with a whole person',
  )
  assert.ok(Math.max(...seen) >= BAND_COLS - 10, 'they reach the far side')
  assert.ok(
    Math.min(...seen) < 0,
    'and come back on clipped, rather than turning round',
  )
  assert.equal(
    walkerColumn(BAND_COLS + 10, BAND_COLS),
    0,
    'one crossing of the band and the field repeats',
  )
})

test('the canvas grows with the window and stops at the source resolution', () => {
  const short = fitCanvasCols({ cols: 200, rows: 24 })
  const tall = fitCanvasCols({ cols: 200, rows: 44 })

  assert.ok(tall > short, 'a taller tab is a sharper Pokemon')
  assert.equal(
    fitCanvasCols({ cols: 400, rows: 200 }),
    NATIVE_CANVAS_COLS,
    'and never blur',
  )
})

test('SIZE only ever scales the canvas down, and never out of sight', () => {
  const size = { cols: 200, rows: 60 }
  const full = fitCanvasCols(size, 7, 1)

  assert.equal(full, NATIVE_CANVAS_COLS)
  assert.ok(fitCanvasCols(size, 7, 0.5) < full)

  assert.equal(fitCanvasCols({ cols: 30, rows: 10 }, 7, 0.4), MIN_CANVAS_COLS)
})

function solidImage(width, height, colour = [200, 120, 40]) {
  const pixels = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = colour[0]
    pixels[i * 4 + 1] = colour[1]
    pixels[i * 4 + 2] = colour[2]
    pixels[i * 4 + 3] = 255
  }
  return { width, height, pixels }
}

test('every quadrant combination has its own glyph', () => {
  const seen = new Map()
  for (let mask = 0; mask < 16; mask++) {
    const glyph = BLOCK_GRIDS.quadrant.glyph(mask)
    assert.ok(
      !seen.has(glyph),
      `mask ${mask} draws the same glyph as ${seen.get(glyph)}`,
    )
    seen.set(glyph, mask)
  }
  assert.equal(seen.size, 16)
})

test('the quadrant glyphs all come from Block Elements, which every font has', () => {
  for (let mask = 1; mask < 16; mask++) {
    const glyph = BLOCK_GRIDS.quadrant.glyph(mask)
    const point = glyph.codePointAt(0)
    assert.ok(
      point >= 0x2580 && point <= 0x259f,
      `mask ${mask} draws ${glyph} at U+${point.toString(16)}, outside Block Elements`,
    )
    assert.equal(
      glyph.length,
      1,
      'and inside the BMP, so .length and width agree',
    )
  }
  assert.equal(BLOCK_GRIDS.quadrant.glyph(0), ' ', 'an empty cell is a space')
})

test('the quadrant bits are laid out in reading order', () => {
  assert.equal(BLOCK_GRIDS.quadrant.glyph(1), '▘', 'bit 0 is the top left')
  assert.equal(BLOCK_GRIDS.quadrant.glyph(2), '▝', 'bit 1 is the top right')
  assert.equal(BLOCK_GRIDS.quadrant.glyph(4), '▖', 'bit 2 is the bottom left')
  assert.equal(BLOCK_GRIDS.quadrant.glyph(8), '▗', 'bit 3 is the bottom right')
  assert.equal(
    BLOCK_GRIDS.quadrant.glyph(3),
    '▀',
    'and the pairs agree with the halves',
  )
  assert.equal(BLOCK_GRIDS.quadrant.glyph(12), '▄')
  assert.equal(BLOCK_GRIDS.quadrant.glyph(5), '▌')
  assert.equal(BLOCK_GRIDS.quadrant.glyph(10), '▐')
  assert.equal(BLOCK_GRIDS.quadrant.glyph(15), '█')
})

test('a denser grid costs exactly the same rows and columns', () => {
  const image = solidImage(40, 46)
  for (const cols of [12, 20, 31, 44]) {
    const half = blockRows(image, cols, BLOCK_GRIDS.half)
    const quadrant = blockRows(image, cols, BLOCK_GRIDS.quadrant)
    assert.equal(
      quadrant.length,
      half.length,
      `${cols} columns is the same height either way`,
    )
    for (const row of quadrant) {
      assert.equal(
        visibleLength(row),
        cols,
        `${cols} columns wide, measured in cells`,
      )
    }
  }
})

test('sprites are drawn with quadrants unless something asks for otherwise', () => {
  const image = solidImage(24, 24)
  assert.deepEqual(
    blockRows(image, 10),
    blockRows(image, 10, BLOCK_GRIDS.quadrant),
  )
})

test('a two-colour cell keeps both colours, and a transparent one keeps none behind it', () => {
  const split = solidImage(2, 4)
  for (let y = 0; y < 4; y++) {
    const at = y * 2 * 4
    split.pixels[at] = 20
    split.pixels[at + 1] = 20
    split.pixels[at + 2] = 24
  }
  const opaque = blockRows(split, 1)[0]
  assert.match(opaque, /48;2;/, 'a background colour is used')

  const holed = solidImage(2, 4)
  holed.pixels[3] = 0
  holed.pixels[(1 * 2 + 0) * 4 + 3] = 0
  const transparent = blockRows(holed, 1)[0]
  assert.ok(
    !/48;2;/.test(transparent),
    'no background where something must show through',
  )
  assert.equal(
    stripAnsi(transparent),
    '▟',
    'and the glyph carries the silhouette',
  )
})

function battleMon(species) {
  return {
    species,
    nickname: null,
    hp: 20,
    exp: 200,
    status: null,
    ivs: {
      hp: 15,
      attack: 15,
      defense: 15,
      spAttack: 15,
      spDefense: 15,
      speed: 15,
    },
    stats: {
      hp: 20,
      attack: 10,
      defense: 10,
      spAttack: 10,
      spDefense: 10,
      speed: 10,
    },
    moves: [
      { move: 'tackle', pp: 30, maxPp: 30 },
      { move: 'growl', pp: 40, maxPp: 40 },
    ],
  }
}

function battleCtx({
  foe = 143,
  player = 4,
  menu = 'main',
  ball = null,
  effect = null,
  caught = [],
} = {}) {
  return {
    save: {
      trainer: 'X',
      money: 0,
      dex: { caught, seen: [] },
      bag: { 'poke-ball': 3 },
      party: [battleMon(player)],
      box: [],
      stats: {},
    },
    spriteScale: 1,
    battle: {
      state: {
        foe: { mon: battleMon(foe) },
        player: { mon: battleMon(player) },
        over: false,
      },
      hp: { foe: 20, player: 20 },
      menu,
      message: menu ? null : 'A wild SNORLAX appeared!',
      events: [],
      effect,
      ball,
      selection: 0,
      bagItems: ['poke-ball', 'revive'],
      bagItem: menu === 'target' ? 'revive' : null,
    },
  }
}

function inkSpan(line) {
  const plain = stripAnsi(line)
  const first = plain.search(/\S/)
  if (first < 0) return null
  return { from: first, to: plain.replace(/\s+$/, '').length - 1 }
}

test('sprites only share rows when there is clear air between them', () => {
  let shared = 0

  for (const [foe, player] of [
    [143, 4],
    [4, 143],
    [16, 25],
    [143, 143],
    [25, 143],
  ]) {
    for (const cols of [60, 80, 100, 120, 160]) {
      for (let rows = 24; rows <= 60; rows += 4) {
        const size = { cols, rows }
        const fitted = fitBattleSprites(size, foe, player, { scale: 1 })
        if (fitted.overlap === 0) continue
        shared++

        const width = Math.min(cols - 2, 78)
        const playerRight = 2 + fitted.player.cols
        const foeLeft = Math.max(1, width - fitted.foe.cols - 2)
        assert.ok(
          playerRight + 2 <= foeLeft,
          `${foe} vs ${player} at ${cols}x${rows} shares rows but reaches ` +
            `${playerRight} into a foe starting at ${foeLeft}`,
        )
      }
    }
  }

  assert.ok(shared > 0, 'and the overlap does happen, or this proves nothing')
})

test('the field never grows past the rows the layout can spare', () => {
  for (const [foe, player] of [
    [143, 4],
    [143, 143],
    [16, 25],
  ]) {
    for (let rows = 24; rows <= 60; rows += 2) {
      const size = { cols: 120, rows }
      const fitted = fitBattleSprites(size, foe, player, { scale: 1 })
      const height =
        fitted.foe.rows.length + fitted.player.rows.length - fitted.overlap
      assert.ok(
        height <= Math.max(8, rows - 1 - 11),
        `${foe} vs ${player} at ${rows} rows wants ${height} rows of field`,
      )
    }
  }
})

test('a shared row draws both sprites, and neither over the other', () => {
  const size = { cols: 120, rows: 40 }
  const { lines } = drawBattle(battleCtx(), size)
  const fitted = fitBattleSprites(size, 143, 4, { scale: 1 })
  assert.ok(fitted.overlap > 0, 'this size does share rows')

  const width = Math.min(size.cols - 2, 78)
  const foeLeft = Math.max(1, width - fitted.foe.cols - 2)

  const fieldTop = 2
  const fieldHeight =
    fitted.foe.rows.length + fitted.player.rows.length - fitted.overlap
  const field = lines.slice(fieldTop, fieldTop + fieldHeight)

  const rowsWithBoth = field.filter((line) => {
    const span = inkSpan(line)
    return span && span.from < foeLeft && span.to >= foeLeft
  })
  assert.equal(
    rowsWithBoth.length,
    fitted.overlap,
    'exactly the shared rows hold both',
  )

  for (const line of rowsWithBoth) {
    const plain = stripAnsi(line)
    assert.equal(
      plain.slice(foeLeft - 2, foeLeft),
      '  ',
      'clear air where they meet',
    )
  }
})

test('the message box always fits, whatever is open and however short the window', () => {
  for (const menu of [null, 'main', 'fight', 'bag', 'party', 'target']) {
    for (let rows = 18; rows <= 60; rows += 2) {
      const { lines } = drawBattle(battleCtx({ menu }), { cols: 120, rows })
      assert.ok(
        lines.length <= rows - 1,
        `${menu ?? 'a message'} at ${rows} rows built ${lines.length} lines for ${rows - 1}`,
      )
    }
  }
})

test('the box keeps its bottom border, which the renderer used to cut off', () => {
  const { lines } = drawBattle(battleCtx({ menu: 'fight' }), {
    cols: 120,
    rows: 40,
  })
  const visible = lines.slice(0, 39)
  const last = stripAnsi(visible[visible.length - 1]).trim()
  assert.ok(last.length > 0, 'the last drawn row is not blank')
  assert.ok(
    /^[└┘─╰╯]/.test(last) || /[┘─╯]$/.test(last),
    `a border, not ${JSON.stringify(last)}`,
  )
})

test('a foe already in the Pokedex wears a ball, and a new one does not', () => {
  const size = { cols: 120, rows: 40 }

  const nameRow = (ctx) => stripAnsi(drawBattle(ctx, size).lines[0])

  const fresh = nameRow(battleCtx({ foe: 143 }))
  assert.ok(fresh.includes('SNORLAX'), 'the foe is named')
  assert.ok(!fresh.includes('◓'), 'one you have never caught carries no ball')

  const owned = nameRow(battleCtx({ foe: 143, caught: [143] }))
  assert.match(
    owned,
    /SNORLAX[♂♀]? Lv\d+ ◓/,
    'one you have caught carries a ball after its level',
  )

  const other = nameRow(battleCtx({ foe: 143, caught: [4, 25] }))
  assert.ok(!other.includes('◓'), 'the mark tracks the species on the field')
})

test('the ball stays on the field and off the message box', () => {
  const size = { cols: 120, rows: 40 }
  const steps = ballSteps({ shakes: 3, caught: false })

  for (let frame = 0; frame < steps.length; frame++) {
    const ctx = battleCtx({
      menu: null,
      ball: { shakes: 3, caught: false, frame, done: false },
    })
    const { lines, overlays } = drawBattle(ctx, size)
    const balls = overlays.filter((overlay) =>
      String(overlay.key ?? '').startsWith('ball:'),
    )

    for (const overlay of balls) {
      assert.ok(
        overlay.col >= 1,
        `frame ${frame} starts at column ${overlay.col}`,
      )
      assert.ok(
        overlay.col - 1 + visibleLength(overlay.sequence) <= size.cols,
        `frame ${frame} runs past the right edge`,
      )
      assert.ok(
        overlay.row >= 1 && overlay.row <= lines.length,
        `frame ${frame} is on a real row`,
      )
    }
  }
})

function menuCtx() {
  return {
    save: {
      trainer: { name: 'Tester' },
      money: 3000,
      bag: { 'poke-ball': 5, potion: 2, 'thunder-stone': 1 },
      dex: { seen: [4, 25], caught: [4] },
      party: [battleMon(4), battleMon(25)],
      box: [battleMon(19)],
      stats: {},
    },
    config: { ...DEFAULT_CONFIG },
    spriteScale: 0.65,
    teamSelection: 0,
    boxSelection: 0,
    dexSelection: 0,
    shopSelection: 0,
    optionsSelection: 0,
    bagSelection: null,
    boxMessage: null,
    bagMessage: null,
    shopMessage: null,
    optionsMessage: null,
  }
}

const MENU_SCREENS = [
  ['TEAM', drawTeam, '[b] the box'],
  ['BOX', drawBox, '[enter] take it into your team'],
  ['POKÉDEX', drawDex, 'PgUp/PgDn jump'],
  ['SHOP', drawShop, '[5] buy five'],
  ['OPTION', drawOptions, '← → change'],
]

test('every menu screen puts its hints where the renderer will draw them', () => {
  for (const [name, draw, hint] of MENU_SCREENS) {
    for (const rows of [16, 24, 34, 50]) {
      const size = { cols: 100, rows }
      const { lines, overlays } = draw(menuCtx(), size)

      assert.ok(
        lines.length <= rows - 1,
        `${name} at ${rows} rows built ${lines.length} lines for ${rows - 1}`,
      )

      const term = fakeTerminal({ cols: 100, rows })
      term.screen.render(lines, overlays)
      assert.ok(
        stripAnsi(term.since(0)).includes(hint),
        `${name} at ${rows} rows never drew ${JSON.stringify(hint)}`,
      )
    }
  }
})

test('a box with nothing in it still says how to get out of it', () => {
  const ctx = menuCtx()
  ctx.save.box = []

  const { lines } = drawBox(ctx, { cols: 100, rows: 34 })
  const plain = lines.map(stripAnsi)

  assert.ok(
    plain.some((line) => line.includes('The box is empty')),
    'it says so',
  )
  assert.equal(lines.length, 33, 'and it is closed like every other screen')
  assert.match(plain[plain.length - 1], /\[esc\]/)
})

function bagCtx(key, on = 0) {
  const ctx = menuCtx()
  ctx.teamSelection = on
  ctx.bagSelection = itemsInBag(ctx.save).indexOf(key)
  assert.notEqual(ctx.bagSelection, -1, `${key} should be in the bag`)
  return ctx
}

test('the bag opens over the team, on the Pokemon the cursor was on', () => {
  const { lines } = drawTeam(bagCtx('potion', 1), { cols: 100, rows: 34 })
  const plain = lines.map(stripAnsi)

  assert.match(plain[0], /BAG/, 'the header says which list you are in')
  assert.match(plain[0], /on PIKACHU/, 'and who it is for')
  assert.ok(
    plain.some((line) => /Potion\s+x2/.test(line)),
    'the items are the list now',
  )
  assert.ok(
    plain.some((line) => /Restores 20 HP/.test(line)),
    'with what the one under the cursor does',
  )

  assert.ok(plain.some((line) => /PIKACHU.*Lv/.test(line)))

  assert.equal(lines.length, 33, 'closed like every other screen')
  assert.match(plain[plain.length - 1], /\[enter\] use it/)
})

test('the bag marks the item that would evolve the one you have chosen', () => {
  const stoned = drawTeam(bagCtx('thunder-stone', 1), {
    cols: 100,
    rows: 34,
  }).lines.map(stripAnsi)

  const row = stoned.find((line) => /Thunder Stone/.test(line))
  assert.match(row, /✦/, 'the item that works is marked')
  assert.ok(
    stoned.some((line) => /PIKACHU would become RAICHU/.test(line)),
    'and it says so in words',
  )

  const wasted = drawTeam(bagCtx('thunder-stone', 0), {
    cols: 100,
    rows: 34,
  }).lines.map(stripAnsi)
  assert.doesNotMatch(
    wasted.find((line) => /Thunder Stone/.test(line)),
    /✦/,
  )
  assert.ok(
    !wasted.some((line) => /would become/.test(line)),
    'and promises nothing',
  )
})

test('what an item just did survives a short window', () => {
  const ctx = menuCtx()
  ctx.bagMessage = 'Congratulations! PIKACHU evolved into RAICHU!'

  for (const rows of [16, 20, 26, 34]) {
    const { lines, overlays } = drawTeam(ctx, { cols: 100, rows })
    assert.ok(
      lines.length <= rows - 1,
      `${rows} rows built ${lines.length} lines`,
    )

    const term = fakeTerminal({ cols: 100, rows })
    term.screen.render(lines, overlays)
    assert.ok(
      stripAnsi(term.since(0)).includes('evolved into RAICHU'),
      `at ${rows} rows the row saying what happened never got drawn`,
    )
  }
})

test('a stone that also taught something gets a row for each half of it', () => {
  const ctx = menuCtx()
  ctx.bagMessage = [
    'Congratulations! SHELLDER evolved into CLOYSTER!',
    'Cloyster learned Spike Cannon!',
  ]

  for (const rows of [16, 20, 26, 34]) {
    const { lines, overlays } = drawTeam(ctx, { cols: 100, rows })
    assert.ok(
      lines.length <= rows - 1,
      `${rows} rows built ${lines.length} lines`,
    )

    const term = fakeTerminal({ cols: 100, rows })
    term.screen.render(lines, overlays)
    const drawn = stripAnsi(term.since(0))
    assert.ok(
      drawn.includes('evolved into CLOYSTER'),
      `the evolution went missing at ${rows}`,
    )
    assert.ok(
      drawn.includes('learned Spike Cannon'),
      `the move went missing at ${rows}`,
    )
  }
})

test('a ball in the bag is greyed rather than hidden', () => {
  const ctx = bagCtx('poke-ball')
  const { lines } = drawTeam(ctx, { cols: 100, rows: 34 })

  const row = lines.find((line) => stripAnsi(line).includes('Poké Ball'))
  assert.ok(
    row.includes(gray('Poké Ball')),
    'it is in the bag, so it is on the list',
  )
  assert.ok(
    lines
      .map(stripAnsi)
      .some((line) => /Save it for something in the grass/.test(line)),
    'and the screen says why it is not for use here',
  )
})

test('the team shows a gender symbol beside every Pokemon that has one', () => {
  const ctx = menuCtx()
  const { lines } = drawTeam(ctx, { cols: 100, rows: 34 })
  const plain = lines.map(stripAnsi)

  assert.ok(
    plain.some((line) => /CHARMANDER♂/.test(line)),
    'Charmander is male here',
  )
  assert.ok(
    plain.some((line) => /PIKACHU♀/.test(line)),
    'Pikachu is female here',
  )
})

test('a gender symbol takes one cell, so the name column still lines up', () => {
  assert.equal(visibleLength(genderTag('male')), 1)
  assert.equal(visibleLength(genderTag('female')), 1)
  assert.equal(genderTag(null), '')

  const ctx = menuCtx()
  const { lines } = drawTeam(ctx, { cols: 100, rows: 34 })
  const plain = lines.map(stripAnsi)

  const levelColumns = plain
    .filter((line) => /Lv\d/.test(line) && /CHARMANDER|PIKACHU/.test(line))
    .map((line) => line.indexOf('Lv'))
  assert.equal(levelColumns.length, 2)
  assert.equal(levelColumns[0], levelColumns[1])
})

test('both sides of a battle wear their gender', () => {
  const { lines } = drawBattle(battleCtx({ foe: 25, player: 4 }), {
    cols: 100,
    rows: 34,
  })
  const plain = lines.map(stripAnsi).join('\n')

  assert.match(plain, /PIKACHU♀/)
  assert.match(plain, /CHARMANDER♂/)
})

test('the Pokedex tells the two Nidoran apart without their suffixes', () => {
  const ctx = menuCtx()
  ctx.save.dex.seen = [29, 32]
  ctx.save.dex.caught = [29]

  const { lines } = drawDex(ctx, { cols: 100, rows: 40 })
  const plain = lines.map(stripAnsi).join('\n')

  assert.ok(!/Nidoran-[fm]/.test(plain), 'the PokeAPI suffix is gone')
  assert.match(plain, /Nidoran♀/)
  assert.match(plain, /Nidoran♂/)
})

test('the Pokedex says how many of one you have faced, and stays quiet at none', () => {
  const ctx = menuCtx()
  ctx.dexSelection = 3

  const bare = drawDex(ctx, { cols: 100, rows: 40 })
    .lines.map(stripAnsi)
    .join('\n')
  assert.ok(!/Faced/.test(bare), 'a save with no tally yet says nothing')

  ctx.save.dex.faced = { 4: 1 }
  const once = drawDex(ctx, { cols: 100, rows: 40 })
    .lines.map(stripAnsi)
    .join('\n')
  assert.match(
    once,
    /Faced once/,
    'and one reads as a word rather than "1 times"',
  )

  ctx.save.dex.faced = { 4: 12, 25: 3 }
  const many = drawDex(ctx, { cols: 100, rows: 40 })
    .lines.map(stripAnsi)
    .join('\n')
  assert.match(
    many,
    /Faced 12 times/,
    'the highlighted entry, not somebody else',
  )
})

test('a Pokemon with no gender gets no symbol, and nor does an unreadable one', () => {
  const ctx = menuCtx()
  ctx.save.party = [battleMon(81), battleMon(25)]
  delete ctx.save.party[1].ivs

  const { lines } = drawTeam(ctx, { cols: 100, rows: 34 })
  const plain = lines.map(stripAnsi)

  assert.ok(
    plain.some((line) => /MAGNEMITE\s/.test(line)),
    'Magnemite stands alone',
  )
  assert.ok(
    plain.some((line) => /PIKACHU\s/.test(line)),
    'and so does the one we cannot read',
  )
  assert.ok(!plain.join('\n').match(/[♂♀]/), 'no symbol anywhere on the screen')
})
