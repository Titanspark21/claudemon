import { PARTY_LIMIT } from '../../constants.mjs'
import { spriteFile } from '../../paths.mjs'
import { displayName, genderOf, isFainted, levelOf } from '../../pokemon.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { monDetail } from '../detail.mjs'
import { fitCanvasCols, loadSprite } from '../sprite.mjs'
import {
  evolutionTag,
  genderTag,
  menuList,
  padRight,
  withFooter,
  wrap,
} from '../widgets.mjs'
import {
  COLUMN_DIVIDER,
  LEAD_MARK,
  LIST_HEIGHT_FLOOR,
  LIST_WIDTH,
  MON_NAME_WIDTH,
  MON_SPRITE_RESERVED_ROWS,
  TEAM_HINTS,
  TEAM_MESSAGES,
  TEAM_SORT_LABELS,
  TEAM_TITLE,
} from './constants.mjs'
import {
  nextPartySort,
  noteRows,
  partyEntryAt,
  partySelectionAfterSort,
  sortedPartyEntries,
  zipColumns,
} from './helpers.mjs'

const partyRow = (mon, partyIndex) => {
  const name = isFainted(mon)
    ? gray(displayName(mon).toUpperCase())
    : displayName(mon).toUpperCase()
  const leadMark = partyIndex === 0 ? brightYellow(LEAD_MARK) : ' '

  return `${leadMark} ${padRight(`${name}${genderTag(genderOf(mon))}`, MON_NAME_WIDTH)} ${dim(`Lv${levelOf(mon)}`)}${evolutionTag(mon)}`
}

export const draw = (ctx, size) => {
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
      lines: withFooter(lines, dim(TEAM_MESSAGES.back), rows),
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

  const sprite = loadSprite(spriteFile('front', selected.species, 'png'), {
    cols: fitCanvasCols(size, MON_SPRITE_RESERVED_ROWS, ctx.spriteScale),
  })
  const spriteBlock = sprite ? sprite.rows : []
  const right = [...monDetail(selected), '', ...spriteBlock]

  const note = noteRows(ctx.bagMessage ?? ctx.boxMessage)
  const noteHeight = note.length > 0 ? note.length + 1 : 0

  const budget = Math.max(1, rows - 2 - lines.length - noteHeight)

  for (const [listRow, detailRow] of zipColumns(list, right).slice(0, budget)) {
    lines.push(
      ` ${padRight(listRow, LIST_WIDTH)}  ${dim(COLUMN_DIVIDER)}  ${detailRow}`,
    )
  }

  if (note.length > 0) {
    lines.push('')
    for (const row of note) lines.push(` ${row}`)
  }

  return {
    lines: withFooter(lines, dim(TEAM_HINTS), rows),
    overlays,
  }
}

export const onKey = (ctx, key) => {
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
  } else if (key.name === 'i') ctx.openBag()
  else if (key.name === 'b') ctx.openBox()
  else if (key.name === 'd') ctx.depositToBox(selected.index)
}
