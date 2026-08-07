import { PARTY_LIMIT } from '../../constants.mjs'
import { spriteFile } from '../../paths.mjs'
import { displayName, genderOf, isFainted, levelOf } from '../../pokemon.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { monDetail } from '../detail.mjs'
import { fitCanvasCols, loadSprite } from '../sprite.mjs'
import { genderTag, menuList, padRight, withFooter, wrap } from '../widgets.mjs'
import {
  BOX_HINTS,
  BOX_MESSAGES,
  BOX_SORT,
  BOX_SORT_LABELS,
  BOX_TITLE,
  COLUMN_DIVIDER,
  LIST_HEIGHT_FLOOR,
  LIST_WIDTH,
  MON_NAME_WIDTH,
  MON_SPRITE_RESERVED_ROWS,
} from './constants.mjs'
import {
  partyEntryAt,
  partyEvoTag,
  sortedPartyEntries,
  zipColumns,
} from './helpers.mjs'

export const draw = (ctx, size) => {
  const { rows } = size
  const lines = []
  const overlays = []

  const box = ctx.save.box
  const party = ctx.save.party
  const sort = ctx.boxSort ?? BOX_SORT.order
  const sortLabel = BOX_SORT_LABELS[sort] ?? BOX_SORT_LABELS.order

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
  const selected = partyEntryAt(box, ctx.boxSelection, sort)?.mon ?? box[0]

  const listEntries = entries.map((entry) => {
    const mon = entry.mon
    const name = isFainted(mon)
      ? gray(displayName(mon).toUpperCase())
      : displayName(mon).toUpperCase()

    return `${padRight(`${name}${genderTag(genderOf(mon))}`, MON_NAME_WIDTH)} ${dim(`Lv${levelOf(mon)}`)}${partyEvoTag(mon)}`
  })

  const list = menuList(listEntries, ctx.boxSelection, {
    height: Math.max(LIST_HEIGHT_FLOOR, box.length),
    width: LIST_WIDTH,
  })

  const sprite = loadSprite(spriteFile('front', selected.species, 'png'), {
    cols: fitCanvasCols(size, MON_SPRITE_RESERVED_ROWS, ctx.spriteScale),
  })
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

  return { lines: withFooter(lines, dim(BOX_HINTS), rows), overlays }
}

export const onKey = (ctx, key) => {
  const box = ctx.save.box
  const sort = ctx.boxSort ?? BOX_SORT.order
  const total = box.length
  const selected = partyEntryAt(box, ctx.boxSelection, sort)

  if (key.name === 'up' || key.name === 'k') {
    ctx.boxSelection = wrap(ctx.boxSelection - 1, total)
    ctx.boxMessage = null
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.boxSelection = wrap(ctx.boxSelection + 1, total)
    ctx.boxMessage = null
  } else if (key.name === 's') {
    const boxIndex = selected?.index ?? 0
    const next = sort === BOX_SORT.level ? BOX_SORT.order : BOX_SORT.level

    ctx.boxSort = next

    const reordered = sortedPartyEntries(box, next)
    const index = reordered.findIndex((entry) => entry.index === boxIndex)

    ctx.boxSelection = index >= 0 ? index : 0
    ctx.boxMessage = null
  } else if (key.name === 'enter' || key.name === 'space') {
    if (selected) ctx.withdrawFromBox(selected.index)
  } else if (key.name === 'escape' || key.name === 'q') {
    ctx.boxMessage = null
    ctx.setMode('team')
  }
}
