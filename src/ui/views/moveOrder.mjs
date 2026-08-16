import { move as moveData } from '../../data.mjs'
import { displayName } from '../../pokemon.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { menuList, padRight, typeBadge, withFooter } from '../widgets.mjs'
import {
  LIST_HEIGHT_FLOOR,
  LIST_WIDTH,
  MOVE_ORDER_EMPTY,
  MOVE_ORDER_HELD_HINTS,
  MOVE_ORDER_HELD_MARK,
  MOVE_ORDER_HINTS,
  MOVE_ORDER_RULE,
  MOVE_ORDER_TITLE,
} from './constants.mjs'
import { noteRows, partyEntryAt, pushNote, rowsLeftFor } from './helpers.mjs'

const slotRow = (slot, index, held) => {
  const data = moveData(slot.move)
  const label = `${index + 1}  ${padRight(data.name, 16)}`
  const detail = `${typeBadge(data.type)} ${dim(`pp ${slot.pp}/${slot.maxPp}`)}`

  if (!held) return `${label} ${detail}`

  return `${label} ${detail} ${brightYellow(MOVE_ORDER_HELD_MARK)}`
}

export const draw = (ctx, size) => {
  const { rows } = size
  const selected = partyEntryAt(ctx.save.party, ctx.teamSelection, ctx.teamSort)
  const mon = selected.mon
  const slots = mon.moves
  const lines = [
    ` ${brightYellow('◓')} ${bold(MOVE_ORDER_TITLE)}   ${dim(
      displayName(mon).toUpperCase(),
    )}`,
    '',
  ]

  if (slots.length === 0) lines.push(` ${gray(MOVE_ORDER_EMPTY)}`)
  else {
    const items = slots.map((slot, index) => {
      return slotRow(
        slot,
        index,
        ctx.moveOrderHeld && index === ctx.moveOrderSelection,
      )
    })

    for (const line of menuList(items, ctx.moveOrderSelection, {
      height: Math.max(LIST_HEIGHT_FLOOR, items.length),
      width: Math.max(LIST_WIDTH, 46),
    }))
      lines.push(line)
  }

  lines.push('')
  lines.push(` ${dim(MOVE_ORDER_RULE)}`)

  const note = noteRows(ctx.moveOrderMessage)
  const footer = [
    dim(ctx.moveOrderHeld ? MOVE_ORDER_HELD_HINTS : MOVE_ORDER_HINTS),
  ]
  const budget = rowsLeftFor(rows, lines, footer, note)

  if (budget < 0) lines.splice(Math.max(2, lines.length + budget), -budget)

  pushNote(lines, note)

  return { lines: withFooter(lines, footer, rows), overlays: [] }
}

export const onKey = (ctx, key) => {
  if (key.name === 'escape' || key.name === 'q') {
    ctx.cancelMoveOrder()
    return
  }

  if (key.name === 'up' || key.name === 'k') {
    ctx.stepMoveOrder(-1)
    return
  }

  if (key.name === 'down' || key.name === 'j') {
    ctx.stepMoveOrder(1)
    return
  }

  if (key.name === 'enter' || key.name === 'space') ctx.toggleMoveHold()
}
