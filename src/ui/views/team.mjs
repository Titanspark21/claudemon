import { spriteFile } from '../../paths.mjs'
import {
  displayName,
  genderOf,
  isFainted,
  levelOf,
  speciesName,
  stoneEvolution,
} from '../../pokemon.mjs'
import { ITEMS, countOf, itemsInBag, usableOnParty } from '../../shop.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { monDetail } from '../detail.mjs'
import { fitCanvasCols, loadSprite } from '../sprite.mjs'
import { genderTag, menuList, padRight, withFooter, wrap } from '../widgets.mjs'

const HINTS =
  ' ↑ ↓ browse · [enter] lead · [i] items · [b] the box · [d] send it there · [esc] back'
const BAG_HINTS =
  ' ↑ ↓ choose an item · [enter] use it · [esc] put the bag away'

const EVOLVES = '✦'

function bagItems(ctx) {
  return ctx.bagSelection === null ? null : itemsInBag(ctx.save)
}

function bagIndex(ctx, bag) {
  return Math.min(Math.max(0, ctx.bagSelection), Math.max(0, bag.length - 1))
}

function bagNote(ctx, bag, mon) {
  if (ctx.bagMessage) return ctx.bagMessage

  const key = bag[bagIndex(ctx, bag)]
  if (!key) return gray('Your bag is empty.')

  const target = stoneEvolution(mon, key)
  if (target) {
    return `${brightYellow(EVOLVES)} ${displayName(mon).toUpperCase()} would become ${speciesName(
      target,
    ).toUpperCase()}.`
  }
  return dim(
    usableOnParty(key)
      ? ITEMS[key].description
      : 'Save it for something in the grass.',
  )
}

export function draw(ctx, size) {
  const { rows } = size
  const lines = []
  const overlays = []

  const party = ctx.save.party
  const listWidth = 30

  const teamHeader = ` ${brightYellow('◓')} ${bold('TEAM')}   ${dim(
    `${party.length}/6 · ${ctx.save.box.length} in the box`,
  )}`

  if (party.length === 0) {
    lines.push(teamHeader)
    lines.push('')
    lines.push(' ' + gray('You have no Pokémon.'))
    return { lines: withFooter(lines, dim(' [esc] back'), rows), overlays }
  }

  const selected = party[Math.min(ctx.teamSelection, party.length - 1)]
  const bag = bagItems(ctx)

  lines.push(
    bag
      ? ` ${brightYellow('◓')} ${bold('BAG')}    ${dim(`on ${displayName(selected).toUpperCase()}`)}`
      : teamHeader,
  )
  lines.push('')

  const entries = bag
    ? bag.map((key) => {
        const name = usableOnParty(key)
          ? ITEMS[key].name
          : gray(ITEMS[key].name)
        const mark = stoneEvolution(selected, key) ? brightYellow(EVOLVES) : ' '
        return `${mark} ${padRight(name, 15)} ${dim(`x${countOf(ctx.save, key)}`)}`
      })
    : party.map((mon, index) => {
        const name = isFainted(mon)
          ? gray(displayName(mon).toUpperCase())
          : displayName(mon).toUpperCase()
        const leadMark = index === 0 ? brightYellow('★') : ' '
        return `${leadMark} ${padRight(`${name}${genderTag(genderOf(mon))}`, 12)} ${dim(`Lv${levelOf(mon)}`)}`
      })

  const list = menuList(entries, bag ? bagIndex(ctx, bag) : ctx.teamSelection, {
    height: Math.max(6, entries.length),
    width: listWidth,
  })

  const sprite = loadSprite(spriteFile('front', selected.species, 'png'), {
    cols: fitCanvasCols(size, 24, ctx.spriteScale),
  })
  const spriteBlock = sprite ? sprite.rows : []

  const right = [...monDetail(selected), '', ...spriteBlock]

  const note = bag
    ? bagNote(ctx, bag, selected)
    : (ctx.bagMessage ?? ctx.boxMessage)
  const noteRows = note ? [].concat(note) : []
  const noteHeight = noteRows.length > 0 ? noteRows.length + 1 : 0

  const budget = Math.max(1, rows - 2 - lines.length - noteHeight)
  const depth = Math.min(Math.max(list.length, right.length), budget)

  for (let row = 0; row < depth; row++) {
    lines.push(
      ` ${padRight(list[row] ?? '', listWidth)}  ${dim('│')}  ${right[row] ?? ''}`,
    )
  }

  if (noteRows.length > 0) {
    lines.push('')
    for (const row of noteRows) lines.push(` ${row}`)
  }

  return {
    lines: withFooter(lines, dim(bag ? BAG_HINTS : HINTS), rows),
    overlays,
  }
}

export function onKey(ctx, key) {
  const bag = bagItems(ctx)
  if (bag) return bagKey(ctx, key, bag)

  const total = ctx.save.party.length

  if (key.name === 'up' || key.name === 'k') {
    ctx.teamSelection = wrap(ctx.teamSelection - 1, total)
    ctx.clearTeamMessages()
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.teamSelection = wrap(ctx.teamSelection + 1, total)
    ctx.clearTeamMessages()
  } else if (key.name === 'enter' || key.name === 'space')
    ctx.makeLead(ctx.teamSelection)
  else if (key.name === 'i') ctx.openBag()
  else if (key.name === 'b') ctx.openBox()
  else if (key.name === 'd') ctx.depositToBox(ctx.teamSelection)
  else if (key.name === 'escape' || key.name === 'q') {
    ctx.clearTeamMessages()
    ctx.setMode('home')
  }
}

function bagKey(ctx, key, bag) {
  const index = bagIndex(ctx, bag)

  if (key.name === 'up' || key.name === 'k') {
    ctx.bagSelection = wrap(index - 1, bag.length)
    ctx.bagMessage = null
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.bagSelection = wrap(index + 1, bag.length)
    ctx.bagMessage = null
  } else if (key.name === 'enter' || key.name === 'space') {
    ctx.useFromBag(bag[index], ctx.teamSelection)
  } else if (key.name === 'escape' || key.name === 'q' || key.name === 'i') {
    ctx.closeBag()
  }
}
