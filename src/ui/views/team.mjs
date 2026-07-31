// Your team: who is in it, how they are doing, and what they know.

import { move as moveData, species } from '../../data.mjs'
import { expProgress } from '../../exp.mjs'
import { spriteFile } from '../../paths.mjs'
import { displayName, isFainted, levelOf } from '../../pokemon.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { fitCanvasCols, loadSprite } from '../sprite.mjs'
import { expBar, hpBar, menuList, padRight, statusTag, typeBadge, wrap } from '../widgets.mjs'

export function draw(ctx, size) {
  const { cols, rows } = size
  const lines = []
  const overlays = []

  const party = ctx.save.party
  const listWidth = 30

  lines.push(` ${brightYellow('◓')} ${bold('TEAM')}   ${dim(`${party.length}/6 · ${ctx.save.box.length} in the box`)}`)
  lines.push('')

  if (party.length === 0) {
    lines.push(' ' + gray('You have no Pokémon.'))
    return { lines, overlays }
  }

  const selected = party[Math.min(ctx.teamSelection, party.length - 1)]

  const entries = party.map((mon, index) => {
    const name = isFainted(mon) ? gray(displayName(mon).toUpperCase()) : displayName(mon).toUpperCase()
    const leadMark = index === 0 ? brightYellow('★') : ' '
    return `${leadMark} ${padRight(name, 12)} ${dim(`Lv${levelOf(mon)}`)}`
  })

  const list = menuList(entries, ctx.teamSelection, { height: Math.max(6, party.length), width: listWidth })

  const detail = []
  detail.push(`${bold(displayName(selected).toUpperCase())} ${dim(`Lv${levelOf(selected)}`)} ${statusTag(selected.status)}`)
  detail.push(species(selected.species).types.map(typeBadge).join(' '))
  detail.push('')
  detail.push(`HP  ${hpBar(selected.hp, selected.stats.hp, 22)} ${dim(`${selected.hp}/${selected.stats.hp}`)}`)

  const progress = expProgress(selected.species, selected.exp)
  detail.push(`EXP ${expBar(progress.fraction, 22)} ${dim(
    progress.needed > 0 ? `${progress.into}/${progress.needed}` : 'max',
  )}`)
  detail.push('')

  detail.push(dim('Stats'))
  detail.push(
    `  Atk ${String(selected.stats.attack).padStart(3)}   Def ${String(selected.stats.defense).padStart(3)}   Spd ${String(selected.stats.speed).padStart(3)}`,
  )
  detail.push(
    `  SpA ${String(selected.stats.spAttack).padStart(3)}   SpD ${String(selected.stats.spDefense).padStart(3)}`,
  )
  detail.push('')

  detail.push(dim('Moves'))
  for (const slot of selected.moves) {
    const data = moveData(slot.move)
    const power = data.power ? `${data.power}` : '—'
    detail.push(
      `  ${padRight(data.name, 15)} ${typeBadge(data.type)} ${dim(`pow ${padRight(power, 4)} pp ${slot.pp}/${slot.maxPp}`)}`,
    )
  }

  const sprite = loadSprite(spriteFile('front', selected.species, 'png'), {
    cols: fitCanvasCols(size, 24, ctx.spriteScale),
  })
  const spriteBlock = sprite ? sprite.rows : []

  const right = [...detail, '', ...spriteBlock]
  for (let row = 0; row < Math.max(list.length, right.length); row++) {
    lines.push(` ${padRight(list[row] ?? '', listWidth)}  ${dim('│')}  ${right[row] ?? ''}`)
  }

  while (lines.length < rows - 1) lines.push('')
  lines.push(dim(' ↑ ↓ browse · [enter] make it your lead · [esc] back'))

  return { lines, overlays }
}

export function onKey(ctx, key) {
  const total = ctx.save.party.length

  if (key.name === 'up' || key.name === 'k') ctx.teamSelection = wrap(ctx.teamSelection - 1, total)
  else if (key.name === 'down' || key.name === 'j') ctx.teamSelection = wrap(ctx.teamSelection + 1, total)
  else if (key.name === 'enter' || key.name === 'space') ctx.makeLead(ctx.teamSelection)
  else if (key.name === 'escape' || key.name === 'q') ctx.setMode('home')
}
