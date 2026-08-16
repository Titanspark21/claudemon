import { PARTY_LIMIT } from '../../constants.mjs'
import { move as moveData } from '../../data.mjs'
import {
  moveRecoveryStatusText,
  relearnableMoves,
} from '../../moveRecovery.mjs'
import { displayName } from '../../pokemon.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { monDetail } from '../detail.mjs'
import { menuList, withFooter, wrap } from '../widgets.mjs'
import {
  LEAD_MARK,
  LIST_HEIGHT_FLOOR,
  LIST_WIDTH,
  RELEARN_EMPTY,
  RELEARN_HINTS,
  RELEARN_RULE,
  RELEARN_TITLE,
  TEAM_HINTS,
  TEAM_KEY_HINTS,
  TEAM_MESSAGES,
  TEAM_SORT_LABELS,
  TEAM_TITLE,
} from './constants.mjs'
import {
  columnRows,
  detailColumnWidth,
  monColumn,
  monRow,
  nextPartySort,
  noteRows,
  partyEntryAt,
  partySelectionAfterSort,
  pushNote,
  rowsLeftFor,
  sortedPartyEntries,
  stackedDetailRows,
} from './helpers.mjs'

const partyRow = (mon, partyIndex) => {
  const leadMark = partyIndex === 0 ? brightYellow(LEAD_MARK) : ' '

  return `${leadMark} ${monRow(mon)}`
}

const recoveryRows = (mon) => {
  return relearnableMoves(mon).map((entry) => {
    const status = moveRecoveryStatusText(mon, entry)
    const lock = entry.unlocked ? brightYellow('●') : gray('○')

    return `${lock} ${moveData(entry.move).name}  ${dim(status)}`
  })
}

const drawRelearn = (ctx, size) => {
  const { rows } = size
  const party = ctx.save.party
  const selected = partyEntryAt(party, ctx.teamSelection, ctx.teamSort)
  const mon = selected?.mon
  const moves = mon ? recoveryRows(mon) : []
  const lines = [
    ` ${brightYellow('◓')} ${bold(RELEARN_TITLE)}${
      mon ? `   ${dim(displayName(mon).toUpperCase())}` : ''
    }`,
    '',
  ]

  if (moves.length === 0) lines.push(` ${gray(RELEARN_EMPTY)}`)
  else {
    ctx.relearnSelection = Math.min(ctx.relearnSelection, moves.length - 1)
    for (const line of menuList(moves, ctx.relearnSelection, {
      height: Math.max(LIST_HEIGHT_FLOOR, moves.length),
      width: Math.max(LIST_WIDTH, 44),
    }))
      lines.push(line)
  }

  lines.push('')
  lines.push(` ${dim(RELEARN_RULE)}`)

  const note = noteRows(ctx.relearnMessage)
  const footer = [dim(RELEARN_HINTS)]
  const budget = rowsLeftFor(rows, lines, footer, note)

  if (budget < 0) lines.splice(Math.max(2, lines.length + budget), -budget)

  pushNote(lines, note)

  return { lines: withFooter(lines, footer, rows), overlays: [] }
}

export const draw = (ctx, size) => {
  if (ctx.teamStep === 'relearn') return drawRelearn(ctx, size)

  const { rows } = size
  const lines = []
  const overlays = []

  const party = ctx.save.party
  const sort = ctx.teamSort
  const sortLabel = TEAM_SORT_LABELS[sort]

  lines.push(
    ` ${brightYellow('◓')} ${bold(TEAM_TITLE)}   ${dim(
      `${party.length}/${PARTY_LIMIT} · ${ctx.save.box.length} in the box · sort ${sortLabel}`,
    )}`,
  )

  if (party.length === 0) {
    lines.push('')
    lines.push(' ' + gray(TEAM_MESSAGES.noPokemon))

    return {
      lines: withFooter(lines, [dim(TEAM_MESSAGES.back)], rows),
      overlays,
    }
  }

  lines.push('')

  const entries = sortedPartyEntries(party, sort)
  const selected = partyEntryAt(party, ctx.teamSelection, sort).mon
  const listEntries = entries.map((entry) => partyRow(entry.mon, entry.index))

  const list = menuList(listEntries, ctx.teamSelection, {
    height: Math.max(LIST_HEIGHT_FLOOR, listEntries.length),
    width: LIST_WIDTH,
  })

  const detailWidth = detailColumnWidth(size, LIST_WIDTH)
  const right =
    detailWidth == null
      ? monDetail(selected, { width: Math.max(1, size.cols - 2) })
      : monColumn(selected, size, ctx.spriteScale, detailWidth)
  const note = noteRows(ctx.bagMessage ?? ctx.boxMessage)
  const footer = [dim(TEAM_HINTS), dim(TEAM_KEY_HINTS)]
  const budget = rowsLeftFor(rows, lines, footer, note)
  const body =
    detailWidth == null
      ? stackedDetailRows(list, right)
      : columnRows(list, right, LIST_WIDTH)

  for (const row of body.slice(0, budget)) lines.push(row)

  pushNote(lines, note)

  return {
    lines: withFooter(lines, footer, rows),
    overlays,
  }
}

const onRelearnKey = (ctx, key) => {
  if (key.name === 'escape' || key.name === 'q') {
    ctx.closeRelearnMoves()
    return
  }

  const selected = partyEntryAt(ctx.save.party, ctx.teamSelection, ctx.teamSort)
  const moves = selected ? relearnableMoves(selected.mon) : []

  if (moves.length === 0) return

  if (key.name === 'up' || key.name === 'k') {
    ctx.relearnSelection = wrap(ctx.relearnSelection - 1, moves.length)
    ctx.relearnMessage = null
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.relearnSelection = wrap(ctx.relearnSelection + 1, moves.length)
    ctx.relearnMessage = null
  } else if (key.name === 'enter' || key.name === 'space') {
    const entry = moves[ctx.relearnSelection]

    if (!entry.unlocked) {
      ctx.relearnMessage = `${moveData(entry.move).name}: ${moveRecoveryStatusText(selected.mon, entry)}.`
      return
    }

    ctx.relearnMove(selected.index, entry.move)
  }
}

export const onKey = (ctx, key) => {
  if (ctx.teamStep === 'relearn') return onRelearnKey(ctx, key)

  if (key.name === 'escape' || key.name === 'q') {
    ctx.clearTeamMessages()
    ctx.setMode('home')
    return
  }

  const party = ctx.save.party

  if (party.length === 0) return

  const sort = ctx.teamSort
  const total = party.length
  const selected = partyEntryAt(party, ctx.teamSelection, sort)

  if (key.name === 'up' || key.name === 'k') {
    ctx.teamSelection = wrap(ctx.teamSelection - 1, total)
    ctx.clearTeamMessages()
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.teamSelection = wrap(ctx.teamSelection + 1, total)
    ctx.clearTeamMessages()
  } else if (key.name === 'enter' || key.name === 'space')
    ctx.makeLead(selected.index)
  else if (key.name === 's') {
    const nextSort = nextPartySort(sort)

    ctx.teamSelection = partySelectionAfterSort(
      party,
      ctx.teamSelection,
      sort,
      nextSort,
    )
    ctx.teamSort = nextSort
    ctx.clearTeamMessages()
  } else if (key.name === 'l') ctx.openRelearnMoves()
  else if (key.name === 'i') ctx.openBag()
  else if (key.name === 'b') ctx.openBox()
  else if (key.name === 'c') ctx.openDaycare('team')
  else if (key.name === 't')
    ctx.askToGiveAway({
      from: 'team',
      source: 'party',
      index: selected.index,
      mon: selected.mon,
    })
  else if (key.name === 'r') ctx.openTradeReceive('team')
  else if (key.name === 'd') ctx.depositToBox(selected.index)
}
