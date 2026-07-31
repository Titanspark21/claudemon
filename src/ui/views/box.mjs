// The box: whatever you caught with no room left in the team for it.
//
// Reached from the team screen rather than from home, because the box only means
// anything next to the team: it is where a Pokemon waits for a slot, and this is
// the screen that gives it one.

import { spriteFile } from '../../paths.mjs'
import { displayName, isFainted, levelOf } from '../../pokemon.mjs'
import { PARTY_LIMIT } from '../../state.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { monDetail } from '../detail.mjs'
import { fitCanvasCols, loadSprite } from '../sprite.mjs'
import { menuList, padRight, wrap } from '../widgets.mjs'

export function draw(ctx, size) {
  const { rows } = size
  const lines = []
  const overlays = []

  const box = ctx.save.box
  const party = ctx.save.party
  const listWidth = 30

  lines.push(
    ` ${brightYellow('◓')} ${bold('BOX')}   ${dim(
      `${box.length} stored · team ${party.length}/${PARTY_LIMIT}`,
    )}`,
  )
  lines.push('')

  if (box.length === 0) {
    lines.push(' ' + gray('The box is empty.'))
    lines.push(' ' + gray('Anything you catch while your team is full waits in here.'))
    while (lines.length < rows - 1) lines.push('')
    lines.push(dim(' [esc] back to your team'))
    return { lines, overlays }
  }

  const selected = box[Math.min(ctx.boxSelection, box.length - 1)]

  const entries = box.map((mon) => {
    const name = isFainted(mon) ? gray(displayName(mon).toUpperCase()) : displayName(mon).toUpperCase()
    return `${padRight(name, 12)} ${dim(`Lv${levelOf(mon)}`)}`
  })

  const list = menuList(entries, ctx.boxSelection, { height: Math.max(6, box.length), width: listWidth })

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

  while (lines.length < rows - 1) lines.push('')
  lines.push(dim(' ↑ ↓ browse · [enter] take it into your team · [esc] back'))

  return { lines, overlays }
}

export function onKey(ctx, key) {
  const total = ctx.save.box.length

  if (key.name === 'up' || key.name === 'k') {
    ctx.boxSelection = wrap(ctx.boxSelection - 1, total)
    ctx.boxMessage = null
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.boxSelection = wrap(ctx.boxSelection + 1, total)
    ctx.boxMessage = null
  } else if (key.name === 'enter' || key.name === 'space') {
    ctx.withdrawFromBox(ctx.boxSelection)
  } else if (key.name === 'escape' || key.name === 'q') {
    ctx.boxMessage = null
    ctx.setMode('team')
  }
}
