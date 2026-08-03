// Your team: who is in it, how they are doing, and what they know.
//
// Also where the bag is. Every item is used on somebody, so the somebody comes first
// and the bag opens over this screen rather than beside it — the Pokemon whose details
// are already on the right is the one it is for. `ctx.bagSelection` is null while the
// bag is shut and an index into it once it is open, which is what tells the two halves
// of this file apart.

import { spriteFile } from '../../paths.mjs'
import {
  displayName, genderOf, isFainted, levelOf, speciesName, stoneEvolution,
} from '../../pokemon.mjs'
import { ITEMS, countOf, itemsInBag, usableOnParty } from '../../shop.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { monDetail } from '../detail.mjs'
import { fitCanvasCols, loadSprite } from '../sprite.mjs'
import { genderTag, menuList, padRight, withFooter, wrap } from '../widgets.mjs'

const HINTS = ' ↑ ↓ browse · [enter] lead · [i] items · [b] the box · [d] send it there · [esc] back'
const BAG_HINTS = ' ↑ ↓ choose an item · [enter] use it · [esc] put the bag away'

/** The mark on an item that would evolve the one you have chosen. */
const EVOLVES = '✦'

/** What is in the bag, or null when it is shut. */
function bagItems(ctx) {
  return ctx.bagSelection === null ? null : itemsInBag(ctx.save)
}

/**
 * Which item the cursor is on. Clamped rather than trusted: using the last of something
 * takes a row out of the list under a cursor that was already sitting on it.
 */
function bagIndex(ctx, bag) {
  return Math.min(Math.max(0, ctx.bagSelection), Math.max(0, bag.length - 1))
}

/**
 * What the highlighted item would do to the one you have chosen, under the two lists.
 *
 * The mark and this line are the same fact said twice, on purpose: a stone fits exactly
 * one species out of the six in front of you, and finding out by spending it costs
 * 2,100₽ a go.
 */
function bagNote(ctx, bag, mon) {
  if (ctx.bagMessage) return ctx.bagMessage

  const key = bag[bagIndex(ctx, bag)]
  if (!key) return gray('Your bag is empty.')

  const target = stoneEvolution(mon, key)
  if (target) {
    return `${brightYellow(EVOLVES)} ${displayName(mon).toUpperCase()} would become ${
      speciesName(target).toUpperCase()}.`
  }
  // The same words the refusal uses, because they are the same fact: one arrives before
  // you press it and one after, and two phrasings would read as two different rules.
  return dim(usableOnParty(key) ? ITEMS[key].description : 'Save it for something in the grass.')
}

export function draw(ctx, size) {
  const { rows } = size
  const lines = []
  const overlays = []

  const party = ctx.save.party
  const listWidth = 30

  const teamHeader = ` ${brightYellow('◓')} ${bold('TEAM')}   ${dim(
    `${party.length}/6 · ${ctx.save.box.length} in the box`)}`

  if (party.length === 0) {
    lines.push(teamHeader)
    lines.push('')
    lines.push(' ' + gray('You have no Pokémon.'))
    return { lines: withFooter(lines, dim(' [esc] back'), rows), overlays }
  }

  const selected = party[Math.min(ctx.teamSelection, party.length - 1)]
  const bag = bagItems(ctx)

  // The header says which of the two lists is under the cursor, and who the bag is for:
  // one screen doing two jobs has to be plain about which one it is doing.
  lines.push(bag
    ? ` ${brightYellow('◓')} ${bold('BAG')}    ${dim(`on ${displayName(selected).toUpperCase()}`)}`
    : teamHeader)
  lines.push('')

  const entries = bag
    ? bag.map((key) => {
      const name = usableOnParty(key) ? ITEMS[key].name : gray(ITEMS[key].name)
      const mark = stoneEvolution(selected, key) ? brightYellow(EVOLVES) : ' '
      return `${mark} ${padRight(name, 15)} ${dim(`x${countOf(ctx.save, key)}`)}`
    })
    : party.map((mon, index) => {
      const name = isFainted(mon) ? gray(displayName(mon).toUpperCase()) : displayName(mon).toUpperCase()
      const leadMark = index === 0 ? brightYellow('★') : ' '
      // The symbol goes inside the padded cell: the longest name in Kanto is ten
      // characters, so it still lands clear of the level.
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

  // One row for both of this screen's answers: what the bag is about to do, or how the
  // last thing you asked for went.
  const note = bag ? bagNote(ctx, bag, selected) : (ctx.bagMessage ?? ctx.boxMessage)

  // And it is paid for before the sprite rather than after it. `withFooter` drops
  // whatever will not fit, which on a short window was this row — an item used, a
  // Pokemon evolved, and nothing on screen saying so. The bottom of a sprite is the
  // cheapest thing here to lose, and losing it is what the trimming was always for.
  const budget = Math.max(1, rows - 2 - lines.length - (note ? 2 : 0))
  const depth = Math.min(Math.max(list.length, right.length), budget)

  for (let row = 0; row < depth; row++) {
    lines.push(` ${padRight(list[row] ?? '', listWidth)}  ${dim('│')}  ${right[row] ?? ''}`)
  }

  if (note) {
    lines.push('')
    lines.push(` ${note}`)
  }

  return { lines: withFooter(lines, dim(bag ? BAG_HINTS : HINTS), rows), overlays }
}

export function onKey(ctx, key) {
  const bag = bagItems(ctx)
  // Nothing gets past this into the team's own keys: `d` sends a Pokemon to the box, and
  // a stray one of those while you were choosing a potion would be somebody's Charizard.
  if (bag) return bagKey(ctx, key, bag)

  const total = ctx.save.party.length

  if (key.name === 'up' || key.name === 'k') {
    ctx.teamSelection = wrap(ctx.teamSelection - 1, total)
    ctx.clearTeamMessages()
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.teamSelection = wrap(ctx.teamSelection + 1, total)
    ctx.clearTeamMessages()
  } else if (key.name === 'enter' || key.name === 'space') ctx.makeLead(ctx.teamSelection)
  else if (key.name === 'i') ctx.openBag()
  else if (key.name === 'b') ctx.openBox()
  else if (key.name === 'd') ctx.depositToBox(ctx.teamSelection)
  else if (key.name === 'escape' || key.name === 'q') {
    ctx.clearTeamMessages()
    ctx.setMode('home')
  }
}

/** The keys while the bag is open over the team. */
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
