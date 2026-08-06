import { move as moveData } from '../../data.mjs'
import { expProgress } from '../../exp.mjs'
import { spriteFile } from '../../paths.mjs'
import { displayName, genderOf, levelOf } from '../../pokemon.mjs'
import { ITEMS } from '../../shop.mjs'
import {
  bold,
  brightGreen,
  brightYellow,
  dim,
  gray,
  visibleLength,
} from '../ansi.mjs'
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

const FOE_INFO_ROWS = 2
const PLAYER_INFO_ROWS = 3

const MESSAGE_BOX_ROWS = 6

const CHROME_ROWS = FOE_INFO_ROWS + PLAYER_INFO_ROWS + MESSAGE_BOX_ROWS

function usableRows(size) {
  return size.rows - 1
}

const MIN_CANVAS = 16

function fieldWidth(size) {
  return Math.min(size.cols - 2, 78)
}

const FIELD_LEFT = 2
const FIELD_GAP = 2

const OVERLAP_FRACTION = 0.4

function overlapRows(foe, player, width) {
  const playerRight = FIELD_LEFT + player.cols
  const foeLeft = Math.max(1, width - foe.cols - 2)
  if (playerRight + FIELD_GAP > foeLeft) return 0

  const shorter = Math.min(spriteHeight(foe), spriteHeight(player))
  return Math.floor(shorter * OVERLAP_FRACTION)
}

const NO_SPRITE = { rows: ['', '(no sprite)', ''], cols: 12 }

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
        row: line + 1,
        col: indent + run.index + 1,
        sequence: bold(brightYellow(run[0])),
        rows: 1,
        key: `hit:${frame}`,
      })
    }
  })

  return overlays
}

function spriteRows(speciesId, side, canvasCols) {
  return (
    loadSprite(spriteFile(side, speciesId, 'png'), { cols: canvasCols }) ??
    NO_SPRITE
  )
}

export function fitBattleSprites(size, foeId, playerId, { scale = 1 } = {}) {
  const budget = Math.max(8, usableRows(size) - CHROME_ROWS)
  const width = fieldWidth(size)
  const room = Math.min(NATIVE_CANVAS_COLS, size.cols - 8)
  const maxCanvas = Math.max(MIN_CANVAS, Math.round(room * scale))

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
  return {
    canvas: MIN_CANVAS,
    foe,
    player,
    overlap: overlapRows(foe, player, width),
  }
}

function placeField(
  lines,
  fitted,
  { width, hideFoe = false, maxRows = Infinity },
) {
  const foeHeight = spriteHeight(fitted.foe)
  const playerHeight = spriteHeight(fitted.player)
  const overlap = Math.min(fitted.overlap ?? 0, foeHeight, playerHeight)

  const top = lines.length
  const playerOffset = foeHeight - overlap
  const height = Math.min(playerOffset + playerHeight, maxRows)

  const foeIndent = Math.max(1, width - fitted.foe.cols - 2)
  const playerIndent = FIELD_LEFT

  const foeDrawn = Math.max(0, Math.min(foeHeight, height))
  const playerDrawn = Math.max(0, Math.min(playerHeight, height - playerOffset))

  const left = new Array(height).fill(null)
  const right = new Array(height).fill(null)

  if (!hideFoe) {
    for (let row = 0; row < foeDrawn; row++) right[row] = fitted.foe.rows[row]
  }
  for (let row = 0; row < playerDrawn; row++)
    left[playerOffset + row] = fitted.player.rows[row]

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

function joinField(left, leftIndent, right, rightIndent) {
  const line = left === null ? '' : ' '.repeat(leftIndent) + left
  if (right === null) return line

  return (
    line + ' '.repeat(Math.max(1, rightIndent - visibleLength(line))) + right
  )
}

const CAUGHT_MARK = brightGreen('◓')

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
    padLeft(
      `${hpBar(hp, mon.stats.hp, 20)} ${dim(`${hp}/${mon.stats.hp}`)}`,
      width,
    ),
    padLeft(`${dim('EXP')} ${expBar(progress.fraction, 16)}`, width),
  ]
}

function moveMenu(mon, rawSelection, width) {
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
    rows.push(
      `${typeBadge(data.type)}  ${dim(`${power} · Acc ${data.accuracy ?? '—'}`)}`,
    )
  }
  return rows
}

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
  const fitted = fitBattleSprites(size, foe.species, player.species, {
    scale: ctx.spriteScale,
  })

  const ballStep = battle.ball
    ? ballSteps(battle.ball)[battle.ball.frame]
    : null

  const caught = ctx.save.dex.caught.includes(foe.species)
  for (const line of foeInfo(foe, battle.hp.foe, width, caught))
    lines.push(` ${line}`)

  const body = messageBody(ctx, width)
  const { foeTop, foeRows, playerTop, playerRows, foeIndent, playerIndent } =
    placeField(lines, fitted, {
      width,
      hideFoe: ballStep?.hideFoe === true,
      maxRows: Math.max(
        1,
        usableRows(size) - FOE_INFO_ROWS - PLAYER_INFO_ROWS - body.length - 2,
      ),
    })

  for (const line of playerInfo(player, battle.hp.player, width))
    lines.push(` ${line}`)

  if (battle.effect) {
    const hit =
      battle.effect.side === 'foe'
        ? {
            top: foeTop,
            rows: foeRows,
            indent: foeIndent,
            cols: fitted.foe.cols,
          }
        : {
            top: playerTop,
            rows: playerRows,
            indent: playerIndent,
            cols: fitted.player.cols,
          }

    overlays.push(
      ...hitOverlays(
        hit.top,
        hit.rows,
        hit.indent + Math.floor(hit.cols / 2),
        battle.effect.frame,
      ),
    )
  }

  if (ballStep) {
    overlays.push(
      ...ballOverlays(
        ballStep,
        {
          foe: {
            top: foeTop,
            rows: foeRows,
            indent: foeIndent,
            cols: fitted.foe.cols,
          },
          player: {
            top: playerTop,
            rows: playerRows,
            indent: playerIndent,
            cols: fitted.player.cols,
          },
          scale: ballScale(fitted.canvas),
          cols,
          maxRow: lines.length - 1,
        },
        battle.ball.frame,
      ),
    )
  }

  while (lines.length < usableRows({ rows: totalRows }) - body.length - 2)
    lines.push('')
  for (const line of panel(body, width)) lines.push(` ${line}`)

  return { lines, overlays }
}

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
        (key) =>
          `${padRight(ITEMS[key].name, 16)} ${dim(`x${ctx.save.bag[key]}`)}`,
      )
      if (labels.length === 0)
        return ['Your bag is empty.', dim('  [esc] back')]
      return [
        'Use which item?',
        ...menuList(labels, battle.selection, { height: 4, width: inner }),
      ]
    }
    case 'party':
      return [
        'Switch to which Pokémon?',
        ...menuList(partyLabels(ctx.save), battle.selection, {
          height: 4,
          width: inner,
        }),
      ]
    case 'target': {
      const item = ITEMS[battle.bagItem]
      return [
        `Use the ${bold(item ? item.name : 'item')} on which Pokémon?`,
        ...menuList(partyLabels(ctx.save), battle.selection, {
          height: 4,
          width: inner,
        }),
      ]
    }
    case 'learn': {
      const step = battle.learnStep
      const labels = step.mon.moves.map((slot) => moveData(slot.move).name)
      return [
        `Which move should ${bold(displayName(step.mon).toUpperCase())} forget to learn ${bold(
          moveData(step.move).name,
        )}?`,
        ...menuList([...labels, 'Do not learn it'], battle.selection, {
          height: 5,
          width: inner,
        }),
      ]
    }
    default:
      return ['']
  }
}

export function onKey(ctx, key) {
  const battle = ctx.battle

  if (battle.message) {
    ctx.advanceMessage()
    return
  }

  const options = menuLength(ctx)

  if (key.name === 'up')
    battle.selection = wrap(battle.selection - stride(battle.menu), options)
  else if (key.name === 'down')
    battle.selection = wrap(battle.selection + stride(battle.menu), options)
  else if (key.name === 'left')
    battle.selection = wrap(battle.selection - 1, options)
  else if (key.name === 'right')
    battle.selection = wrap(battle.selection + 1, options)
  else if (key.name === 'enter' || key.name === 'space')
    ctx.chooseBattleOption()
  else if (key.name === 'escape') ctx.backOutOfBattleMenu()
}

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
    case 'target':
    case 'party':
      return ctx.save.party.length
    case 'learn':
      return battle.learnStep.mon.moves.length + 1
    default:
      return 0
  }
}
