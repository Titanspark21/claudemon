import { PARTY_LIMIT } from '../../constants.mjs'
import { monSpriteFile } from '../../paths.mjs'
import { displayName, genderOf, isFainted, levelOf } from '../../pokemon.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { monDetail } from '../detail.mjs'
import { fitCanvasCols, loadSprite } from '../sprite.mjs'
import {
  evolutionTag,
  genderTag,
  menuList,
  padRight,
  shinyTag,
  withFooter,
  wrap,
} from '../widgets.mjs'
import {
  BOX_HINTS,
  BOX_MESSAGES,
  BOX_SORT_LABELS,
  BOX_TITLE,
  COLUMN_DIVIDER,
  LIST_HEIGHT_FLOOR,
  LIST_WIDTH,
  MON_NAME_WIDTH,
  MON_SPRITE_RESERVED_ROWS,
  TRADE_KEY_HINTS,
} from './constants.mjs'
import {
  nextPartySort,
  partyEntryAt,
  partySelectionAfterSort,
  sortedPartyEntries,
  zipColumns,
} from './helpers.mjs'

export const draw = (ctx, size) => {
  const { rows } = size
  const lines = []
  const overlays = []

  const box = ctx.save.box
  const party = ctx.save.party
  const sort = ctx.boxSort
  const sortLabel = BOX_SORT_LABELS[sort]

  lines.push(
    ` ${brightYellow('◓')} ${bold(BOX_TITLE)}   ${dim(
      `${box.length} stored · team ${party.length}/${PARTY_LIMIT} · sort ${sortLabel}`,
    )}`,
  )
  lines.push('')

  if (box.length === 0) {
    lines.push(' ' + gray(BOX_MESSAGES.empty))
    lines.push(' ' + gray(BOX_MESSAGES.waitingHere))

    return {
      lines: withFooter(lines, dim(BOX_MESSAGES.back), rows),
      overlays,
    }
  }

  const entries = sortedPartyEntries(box, sort)
  const selected = partyEntryAt(box, ctx.boxSelection, sort).mon

  const listEntries = entries.map((entry) => {
    const mon = entry.mon
    const name = isFainted(mon)
      ? gray(displayName(mon).toUpperCase())
      : displayName(mon).toUpperCase()

    return `${padRight(`${name}${genderTag(genderOf(mon))}${shinyTag(mon.shiny)}`, MON_NAME_WIDTH)} ${dim(`Lv${levelOf(mon)}`)}${evolutionTag(mon)}`
  })

  const list = menuList(listEntries, ctx.boxSelection, {
    height: Math.max(LIST_HEIGHT_FLOOR, box.length),
    width: LIST_WIDTH,
  })

  const sprite = loadSprite(
    monSpriteFile('front', selected.species, selected.shiny),
    { cols: fitCanvasCols(size, MON_SPRITE_RESERVED_ROWS, ctx.spriteScale) },
  )
  const spriteBlock = sprite ? sprite.rows : []
  const right = [...monDetail(selected), '', ...spriteBlock]

  for (const [listRow, detailRow] of zipColumns(list, right)) {
    lines.push(
      ` ${padRight(listRow, LIST_WIDTH)}  ${dim(COLUMN_DIVIDER)}  ${detailRow}`,
    )
  }

  if (ctx.boxMessage) {
    lines.push('')
    lines.push(` ${ctx.boxMessage}`)
  }

  return {
    lines: withFooter(lines, [dim(BOX_HINTS), dim(TRADE_KEY_HINTS)], rows),
    overlays,
  }
}

export const onKey = (ctx, key) => {
  if (key.name === 'escape' || key.name === 'q') {
    ctx.boxMessage = null
    ctx.setMode('team')
    return
  }

  if (key.name === 'r') {
    ctx.openTradeReceive('box')
    return
  }

  const box = ctx.save.box

  if (box.length === 0) return

  const sort = ctx.boxSort
  const total = box.length

  if (key.name === 'up' || key.name === 'k') {
    ctx.boxSelection = wrap(ctx.boxSelection - 1, total)
    ctx.boxMessage = null
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.boxSelection = wrap(ctx.boxSelection + 1, total)
    ctx.boxMessage = null
  } else if (key.name === 's') {
    const nextSort = nextPartySort(sort)

    ctx.boxSelection = partySelectionAfterSort(
      box,
      ctx.boxSelection,
      sort,
      nextSort,
    )
    ctx.boxSort = nextSort
    ctx.boxMessage = null
  } else if (key.name === 't') {
    const entry = partyEntryAt(box, ctx.boxSelection, sort)

    ctx.askToGiveAway({
      from: 'box',
      source: 'box',
      index: entry.index,
      mon: entry.mon,
    })
  } else if (key.name === 'enter' || key.name === 'space')
    ctx.withdrawFromBox(partyEntryAt(box, ctx.boxSelection, sort).index)
}
