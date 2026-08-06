// The battle screen.
//
// Foe details top left with its sprite to the right, your Pokemon lower left with
// its details to the right, and the message box along the bottom — the arrangement
// the games have used since Red. The two sprites share a band of rows in the middle,
// which is what being on opposite sides of the field buys.

import { move as moveData } from '../../data.mjs'
import { expProgress } from '../../exp.mjs'
import { spriteFile } from '../../paths.mjs'
import { displayName, genderOf, levelOf } from '../../pokemon.mjs'
import { ITEMS } from '../../shop.mjs'
import { bold, brightGreen, brightYellow, dim, gray, visibleLength } from '../ansi.mjs'
import { ballOverlays, ballScale, ballSteps } from '../ball.mjs'
import { NATIVE_CANVAS_COLS, loadSprite, spriteHeight } from '../sprite.mjs'
import {
  expBar,
  genderTag,
  hpBar,
  menuGrid,
  menuList,
  padLeft,
  padRight,
  panel,
  statusTag,
  typeBadge,
  wrap,
} from '../widgets.mjs'

/** Name and HP bar for the foe; name, HP and EXP for yours. */
const FOE_INFO_ROWS = 2
const PLAYER_INFO_ROWS = 3

/**
 * The tallest the message box gets, borders included.
 *
 * The move menu is what sets it: two rows of moves, a blank, and the type line,
 * inside a box that costs two of its own. Every other menu is shorter, and the
 * sprites are sized against the worst case rather than what happens to be open —
 * a screen where the Pokemon resize when you press a key is worse than one where
 * they are slightly small.
 */
const MESSAGE_BOX_ROWS = 6

/**
 * Rows the layout needs for everything that is not a sprite.
 *
 * Added up from the parts rather than written down as a number, so a menu that
 * grows a row cannot quietly start pushing the message box off the bottom of the
 * screen — which is exactly what it used to do.
 */
const CHROME_ROWS = FOE_INFO_ROWS + PLAYER_INFO_ROWS + MESSAGE_BOX_ROWS

/**
 * Rows this view may actually draw into.
 *
 * The renderer never writes the last row of the terminal, so a layout that budgets
 * for the full height loses its bottom row — for this screen, the bottom border of
 * the message box, in every battle at every size.
 */
function usableRows(size) {
  return size.rows - 1
}

const MIN_CANVAS = 16

/** Columns the field is laid out across, which is also what the chrome uses. */
function fieldWidth(size) {
  return Math.min(size.cols - 2, 78)
}

/** Where your own Pokemon stands, and the clear air the two of them need between them. */
const FIELD_LEFT = 2
const FIELD_GAP = 2

/**
 * How much of the shorter sprite the two of them may share rows over.
 *
 * The games put the foe upper-right and yours lower-left precisely so their boxes
 * can overlap: on opposite sides of the field, one can stand in rows the other also
 * occupies without either being drawn over. Stacking them instead — which is what
 * this screen used to do — means every row the foe takes is a row yours cannot have,
 * and on a short window that halves both of them.
 *
 * Two fifths, because it is the head-and-feet band that overlaps in the games and
 * not the bodies. More than this and yours starts to read as standing in front of
 * the foe rather than nearer the camera.
 */
const OVERLAP_FRACTION = 0.4

/**
 * Rows the two sprites may share, which is zero unless there is room between them.
 *
 * The whole thing rests on them not touching horizontally: two sprites wide enough
 * to meet in the middle cannot share a row at all, however much vertical room that
 * would save.
 */
function overlapRows(foe, player, width) {
  const playerRight = FIELD_LEFT + player.cols
  const foeLeft = Math.max(1, width - foe.cols - 2)
  if (playerRight + FIELD_GAP > foeLeft) return 0

  const shorter = Math.min(spriteHeight(foe), spriteHeight(player))
  return Math.floor(shorter * OVERLAP_FRACTION)
}

/** Stands in for art we could not draw, so the layout still has something to size. */
const NO_SPRITE = { rows: ['', '(no sprite)', ''], cols: 12 }

/**
 * The hit effect: one explosion, drawn over whoever just took damage.
 *
 * Deliberately the same every time. A move-specific animation for 145 moves is a
 * different project, and what was actually missing was any sign at all that a
 * blow had landed on something.
 *
 * Only 💥 and spaces, and that is a constraint rather than a style: the column
 * arithmetic below measures the row with `visibleLength`, which knows an emoji takes
 * two cells and a space one. A glyph it does not know the width of would drift the
 * burst sideways.
 *
 * Each frame is written as the shape it draws, one row per line, so the burst can be
 * seen opening out down the page.
 */
// prettier-ignore
export const HIT_FRAMES = [
  ['💥'],
  ['💥💥💥'],
  ['  💥💥💥  ',
    '💥💥💥💥💥',
    '  💥💥💥  '],
  ['💥  💥  💥',
    '  💥💥💥  ',
    '💥  💥  💥'],
  ['💥      💥',
    '          ',
    '💥      💥'],
]

/**
 * Turns a frame of the explosion into overlays over a sprite already placed.
 *
 * One overlay per run of emoji rather than one per row, so the gaps in the art
 * are genuinely gaps: a space written over a sprite would punch a black hole in
 * it, but a column nothing is written to still shows the Pokemon underneath.
 *
 * @param {number} top first row of the sprite, as a 0-based index into `lines`
 * @param {number} height rows the sprite occupies
 * @param {number} centre the column to centre the explosion on
 */
export function hitOverlays(top, height, centre, frame) {
  const art = HIT_FRAMES[frame]
  if (!art || height <= 0) return []

  const start = top + Math.max(0, Math.floor((height - art.length) / 2))
  const overlays = []

  art.forEach((row, index) => {
    const line = start + index
    if (line < top || line >= top + height) return

    const indent = Math.max(0, centre - Math.floor(visibleLength(row) / 2))

    for (const run of row.matchAll(/\S+/gu)) {
      overlays.push({
        // Rows and columns are 1-based here; `top` and `indent` are not.
        row: line + 1,
        col: indent + run.index + 1,
        sequence: bold(brightYellow(run[0])),
        rows: 1,
        // The frame is what makes this overlay different from the last one, and
        // so what tells the renderer to put the sprite back before redrawing.
        key: `hit:${frame}`,
      })
    }
  })

  return overlays
}

function spriteRows(speciesId, side, canvasCols) {
  return loadSprite(spriteFile(side, speciesId, 'png'), { cols: canvasCols }) ?? NO_SPRITE
}

/**
 * Sizes both sprites to fill the space that is actually free.
 *
 * A fixed canvas cannot do this: sprites are cropped, so how many rows a canvas
 * costs depends on which two Pokemon are on screen — a Pidgey and a Snorlax fill
 * wildly different fractions of it. So measure, then grow into whatever is left,
 * keeping the last size that fit.
 *
 * @param {{scale?: number}} options `scale` is the OPTION screen's SIZE setting,
 *   applied to the widest canvas rather than to the winner, so turning it down
 *   really does hand rows back to the rest of the screen.
 */
export function fitBattleSprites(size, foeId, playerId, { scale = 1 } = {}) {
  const budget = Math.max(8, usableRows(size) - CHROME_ROWS)
  const width = fieldWidth(size)
  const room = Math.min(NATIVE_CANVAS_COLS, size.cols - 8)
  const maxCanvas = Math.max(MIN_CANVAS, Math.round(room * scale))

  // Binary search on the canvas width. Height is monotonic in it, so this finds
  // the largest size that fits in about seven steps — and every render is cached,
  // so the winning size costs nothing to draw afterwards.
  //
  // What is measured is the field's height rather than the two sprites added
  // together, which is what lets them grow into rows they share.
  let low = MIN_CANVAS
  let high = maxCanvas
  let best = null

  while (low <= high) {
    const canvas = Math.floor((low + high) / 2)
    const foe = spriteRows(foeId, 'front', canvas)
    const player = spriteRows(playerId, 'back', canvas)
    const overlap = overlapRows(foe, player, width)

    if (spriteHeight(foe) + spriteHeight(player) - overlap <= budget) {
      best = { canvas, foe, player, overlap }
      low = canvas + 1
    } else {
      high = canvas - 1
    }
  }

  if (best) return best

  const foe = spriteRows(foeId, 'front', MIN_CANVAS)
  const player = spriteRows(playerId, 'back', MIN_CANVAS)
  return { canvas: MIN_CANVAS, foe, player, overlap: overlapRows(foe, player, width) }
}

/**
 * Lays both sprites out on one field and returns where everything ended up.
 *
 * The foe goes in at the top right and yours below on the left, sharing `overlap`
 * rows between them. Both are composed into the same strings — they are on opposite
 * sides of the field, so a row can hold both.
 *
 * @param {number} maxRows the most the field may take, so a window too short for
 *   both sprites cuts a Pokemon off rather than pushing the message box off-screen.
 * @returns {{foeTop: number, foeRows: number, playerTop: number, playerRows: number,
 *            foeIndent: number, playerIndent: number}} 0-based rows into `lines`.
 */
function placeField(lines, fitted, { width, hideFoe = false, maxRows = Infinity }) {
  const foeHeight = spriteHeight(fitted.foe)
  const playerHeight = spriteHeight(fitted.player)
  const overlap = Math.min(fitted.overlap ?? 0, foeHeight, playerHeight)

  const top = lines.length
  const playerOffset = foeHeight - overlap
  const height = Math.min(playerOffset + playerHeight, maxRows)

  const foeIndent = Math.max(1, width - fitted.foe.cols - 2)
  const playerIndent = FIELD_LEFT

  // Whichever rows each sprite gets, once the field has been trimmed to fit.
  const foeDrawn = Math.max(0, Math.min(foeHeight, height))
  const playerDrawn = Math.max(0, Math.min(playerHeight, height - playerOffset))

  const left = new Array(height).fill(null)
  const right = new Array(height).fill(null)

  if (!hideFoe) {
    for (let row = 0; row < foeDrawn; row++) right[row] = fitted.foe.rows[row]
  }
  for (let row = 0; row < playerDrawn; row++) left[playerOffset + row] = fitted.player.rows[row]

  for (let row = 0; row < height; row++) {
    lines.push(joinField(left[row], playerIndent, right[row], foeIndent))
  }

  return {
    foeTop: top,
    foeRows: foeDrawn,
    playerTop: top + playerOffset,
    playerRows: playerDrawn,
    foeIndent,
    playerIndent,
  }
}

/** One row of the field: yours on the left, the foe's on the right, clear air between. */
function joinField(left, leftIndent, right, rightIndent) {
  const line = left === null ? '' : ' '.repeat(leftIndent) + left
  if (right === null) return line

  // At least one column, so a field too narrow to hold both runs them together
  // rather than splicing one into the middle of the other.
  return line + ' '.repeat(Math.max(1, rightIndent - visibleLength(line))) + right
}

/**
 * The mark that says this species is already in the Pokédex.
 *
 * The same glyph the Pokédex titles itself with, so the two screens agree on what
 * a ball means, and green because that is the colour the dex list already gives a
 * caught entry. Only drawn when it is caught: the games put a ball on the wild
 * Pokemon you own and nothing on the one you do not, and a marker for "new" would
 * be on screen far more often than the one worth noticing.
 */
const CAUGHT_MARK = brightGreen('◓')

/**
 * `hp` is what the bar shows, which trails the real value: the engine resolves a
 * whole turn at once, and the interface plays it back one blow at a time.
 *
 * @param {boolean} caught whether this species is in the Pokédex already, which is
 *   what decides whether spending a ball here is worth it.
 */
function foeInfo(mon, hp, width, caught) {
  const name = `${bold(displayName(mon).toUpperCase())}${genderTag(genderOf(mon))} ${dim(`Lv${levelOf(mon)}`)}`
  const tag = statusTag(mon.status)
  const mark = caught ? ` ${CAUGHT_MARK}` : ''
  return [
    padRight(`${name}${mark}${tag ? ` ${tag}` : ''}`, width),
    padRight(`${hpBar(hp, mon.stats.hp, 20)}`, width),
  ]
}

function playerInfo(mon, hp, width) {
  const name = `${bold(displayName(mon).toUpperCase())}${genderTag(genderOf(mon))} ${dim(`Lv${levelOf(mon)}`)}`
  const tag = statusTag(mon.status)
  const progress = expProgress(mon.species, mon.exp)

  return [
    padLeft(`${name}${tag ? ` ${tag}` : ''}`, width),
    padLeft(`${hpBar(hp, mon.stats.hp, 20)} ${dim(`${hp}/${mon.stats.hp}`)}`, width),
    padLeft(`${dim('EXP')} ${expBar(progress.fraction, 16)}`, width),
  ]
}

/** The four move buttons, with PP and type. */
function moveMenu(mon, rawSelection, width) {
  // Clamp rather than trust: a forgotten move can leave the cursor past the end,
  // and an out-of-range index would silently drop the detail line.
  const selected = Math.max(0, Math.min(rawSelection, mon.moves.length - 1))

  const labels = mon.moves.map((slot) => {
    const data = moveData(slot.move)
    const low = slot.pp === 0 ? gray : (text) => text
    return low(`${padRight(data.name, 15)} ${dim(`${slot.pp}/${slot.maxPp}`)}`)
  })

  const rows = menuGrid(labels, selected, { columns: 2, width })
  const chosen = mon.moves[selected]
  if (chosen) {
    const data = moveData(chosen.move)
    const power = data.power ? `Power ${data.power}` : 'Status'
    rows.push('')
    rows.push(`${typeBadge(data.type)}  ${dim(`${power} · Acc ${data.accuracy ?? '—'}`)}`)
  }
  return rows
}

/**
 * One row per party member: name, level and a health bar.
 *
 * Shared by the two menus that ask you to point at one of your own — who to send out,
 * and who an item is for. The same Pokemon should read the same way in both.
 */
function partyLabels(save) {
  return save.party.map((mon) => {
    const fainted = mon.hp <= 0 ? gray(' FNT') : ''
    const name = `${displayName(mon).toUpperCase()}${genderTag(genderOf(mon))}`
    return `${padRight(name, 14)} ${dim(`Lv${levelOf(mon)}`)} ${hpBar(
      mon.hp,
      mon.stats.hp,
      10,
    )}${fainted}`
  })
}

export function draw(ctx, size) {
  const { cols, rows: totalRows } = size
  const battle = ctx.battle
  const lines = []
  const overlays = []

  const width = fieldWidth(size)

  const foe = battle.state.foe.mon
  const player = battle.state.player.mon
  const fitted = fitBattleSprites(size, foe.species, player.species, { scale: ctx.spriteScale })

  const ballStep = battle.ball ? ballSteps(battle.ball)[battle.ball.frame] : null

  // Foe: details on the left, sprite pushed to the right. The ball goes up the
  // moment the catch lands, since the Pokedex is written before the battle ends.
  const caught = ctx.save.dex.caught.includes(foe.species)
  for (const line of foeInfo(foe, battle.hp.foe, width, caught)) lines.push(` ${line}`)

  // Both of them on one field. A Pokemon inside a ball is not standing on it, but
  // its rows are held back either way, so nothing else on screen moves while it is
  // in there.
  const body = messageBody(ctx, width)
  const { foeTop, foeRows, playerTop, playerRows, foeIndent, playerIndent } = placeField(
    lines,
    fitted,
    {
      width,
      hideFoe: ballStep?.hideFoe === true,
      // Whatever is left once the chrome above and below has had its share. Without
      // this a window too short for both sprites pushes the message box off the
      // bottom, and the message box is the part you cannot play without.
      maxRows: Math.max(1, usableRows(size) - FOE_INFO_ROWS - PLAYER_INFO_ROWS - body.length - 2),
    },
  )

  for (const line of playerInfo(player, battle.hp.player, width)) lines.push(` ${line}`)

  if (battle.effect) {
    const hit =
      battle.effect.side === 'foe'
        ? { top: foeTop, rows: foeRows, indent: foeIndent, cols: fitted.foe.cols }
        : { top: playerTop, rows: playerRows, indent: playerIndent, cols: fitted.player.cols }

    // Pushed last so it lands on top: overlays are drawn in the order they arrive,
    // and in image mode the sprite is an overlay too.
    overlays.push(
      ...hitOverlays(hit.top, hit.rows, hit.indent + Math.floor(hit.cols / 2), battle.effect.frame),
    )
  }

  if (ballStep) {
    overlays.push(
      ...ballOverlays(
        ballStep,
        {
          foe: { top: foeTop, rows: foeRows, indent: foeIndent, cols: fitted.foe.cols },
          player: {
            top: playerTop,
            rows: playerRows,
            indent: playerIndent,
            cols: fitted.player.cols,
          },
          scale: ballScale(fitted.canvas),
          cols,
          // The message box goes in below this, and a ball in the middle of a
          // sentence is worse than a ball that flew off the top of the field.
          maxRow: lines.length - 1,
        },
        battle.ball.frame,
      ),
    )
  }

  // Message box, pinned to the bottom.
  while (lines.length < usableRows({ rows: totalRows }) - body.length - 2) lines.push('')
  for (const line of panel(body, width)) lines.push(` ${line}`)

  return { lines, overlays }
}

/** What goes inside the box: a message, or whichever menu is open. */
function messageBody(ctx, width) {
  const battle = ctx.battle
  const inner = width - 2

  if (battle.message) {
    const lines = [battle.message]
    if (battle.events.length > 0) lines.push(dim('  ▾ press any key'))
    return lines
  }

  const player = battle.state.player.mon

  switch (battle.menu) {
    case 'main':
      return [
        `What will ${bold(displayName(player).toUpperCase())} do?`,
        ...menuGrid(['FIGHT', 'BAG', 'POKÉMON', 'RUN'], battle.selection, {
          columns: 2,
          width: inner,
        }),
      ]
    case 'fight':
      return moveMenu(player, battle.selection, inner)
    case 'bag': {
      const labels = battle.bagItems.map(
        (key) => `${padRight(ITEMS[key].name, 16)} ${dim(`x${ctx.save.bag[key]}`)}`,
      )
      if (labels.length === 0) return ['Your bag is empty.', dim('  [esc] back')]
      return ['Use which item?', ...menuList(labels, battle.selection, { height: 4, width: inner })]
    }
    case 'party':
      return [
        'Switch to which Pokémon?',
        ...menuList(partyLabels(ctx.save), battle.selection, { height: 4, width: inner }),
      ]
    case 'target': {
      // The same rows as the switch menu, fainted ones included and not dimmed out:
      // for a Revive, the one lying down is the whole point of the list.
      const item = ITEMS[battle.bagItem]
      return [
        `Use the ${bold(item ? item.name : 'item')} on which Pokémon?`,
        ...menuList(partyLabels(ctx.save), battle.selection, { height: 4, width: inner }),
      ]
    }
    case 'learn': {
      const step = battle.learnStep
      // The moves belong to whoever levelled up, which is not always the one on
      // the field: everyone who took part in the fight earns the experience.
      const labels = step.mon.moves.map((slot) => moveData(slot.move).name)
      return [
        `Which move should ${bold(displayName(step.mon).toUpperCase())} forget to learn ${bold(
          moveData(step.move).name,
        )}?`,
        ...menuList([...labels, 'Do not learn it'], battle.selection, { height: 5, width: inner }),
      ]
    }
    default:
      return ['']
  }
}

export function onKey(ctx, key) {
  const battle = ctx.battle

  // Any key advances a message, which is how the games pace their text.
  if (battle.message) {
    ctx.advanceMessage()
    return
  }

  const options = menuLength(ctx)

  if (key.name === 'up') battle.selection = wrap(battle.selection - stride(battle.menu), options)
  else if (key.name === 'down')
    battle.selection = wrap(battle.selection + stride(battle.menu), options)
  else if (key.name === 'left') battle.selection = wrap(battle.selection - 1, options)
  else if (key.name === 'right') battle.selection = wrap(battle.selection + 1, options)
  else if (key.name === 'enter' || key.name === 'space') ctx.chooseBattleOption()
  else if (key.name === 'escape') ctx.backOutOfBattleMenu()
}

/** Grid menus move two at a time vertically; lists move one. */
function stride(menu) {
  return menu === 'main' || menu === 'fight' ? 2 : 1
}

export function menuLength(ctx) {
  const battle = ctx.battle
  switch (battle.menu) {
    case 'main':
      return 4
    case 'fight':
      return battle.state.player.mon.moves.length
    case 'bag':
      return battle.bagItems.length
    // Both of the menus that ask you to point at one of your own.
    case 'target':
    case 'party':
      return ctx.save.party.length
    case 'learn':
      return battle.learnStep.mon.moves.length + 1
    default:
      return 0
  }
}
