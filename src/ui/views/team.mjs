// Your team: who is in it, how they are doing, and what they know.

import { spriteFile } from '../../paths.mjs'
import { displayName, isFainted, levelOf } from '../../pokemon.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { monDetail } from '../detail.mjs'
import { fitCanvasCols, loadSprite } from '../sprite.mjs'
import { menuList, padRight, withFooter, wrap } from '../widgets.mjs'

const HINTS = ' ↑ ↓ browse · [enter] lead · [b] the box · [d] send it there · [esc] back'

export function draw(ctx, size) {
  const { rows } = size
  const lines = []
  const overlays = []

  const party = ctx.save.party
  const listWidth = 30

  lines.push(` ${brightYellow('◓')} ${bold('TEAM')}   ${dim(`${party.length}/6 · ${ctx.save.box.length} in the box`)}`)
  lines.push('')

  if (party.length === 0) {
    lines.push(' ' + gray('You have no Pokémon.'))
    return { lines: withFooter(lines, dim(' [esc] back'), rows), overlays }
  }

  const selected = party[Math.min(ctx.teamSelection, party.length - 1)]

  const entries = party.map((mon, index) => {
    const name = isFainted(mon) ? gray(displayName(mon).toUpperCase()) : displayName(mon).toUpperCase()
    const leadMark = index === 0 ? brightYellow('★') : ' '
    return `${leadMark} ${padRight(name, 12)} ${dim(`Lv${levelOf(mon)}`)}`
  })

  const list = menuList(entries, ctx.teamSelection, { height: Math.max(6, party.length), width: listWidth })

  const sprite = loadSprite(spriteFile('front', selected.species, 'png'), {
    cols: fitCanvasCols(size, 24, ctx.spriteScale),
  })
  const spriteBlock = sprite ? sprite.rows : []

  const right = [...monDetail(selected), '', ...spriteBlock]
  for (let row = 0; row < Math.max(list.length, right.length); row++) {
    lines.push(` ${padRight(list[row] ?? '', listWidth)}  ${dim('│')}  ${right[row] ?? ''}`)
  }

  if (ctx.boxMessage) {
    lines.push('')
    lines.push(` ${ctx.boxMessage}`)
  }

  return { lines: withFooter(lines, dim(HINTS), rows), overlays }
}

export function onKey(ctx, key) {
  const total = ctx.save.party.length

  if (key.name === 'up' || key.name === 'k') {
    ctx.teamSelection = wrap(ctx.teamSelection - 1, total)
    ctx.boxMessage = null
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.teamSelection = wrap(ctx.teamSelection + 1, total)
    ctx.boxMessage = null
  } else if (key.name === 'enter' || key.name === 'space') ctx.makeLead(ctx.teamSelection)
  else if (key.name === 'b') ctx.openBox()
  else if (key.name === 'd') ctx.depositToBox(ctx.teamSelection)
  else if (key.name === 'escape' || key.name === 'q') {
    ctx.boxMessage = null
    ctx.setMode('home')
  }
}
