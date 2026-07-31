// The Pokédex: all 151, with what you have seen and what you have caught.
//
// Anything you have never met shows as a silhouette and a number, which is the
// whole point of a Pokédex.

import { loadData, species } from '../../data.mjs'
import { STAT_NAMES } from '../../exp.mjs'
import { spriteFile } from '../../paths.mjs'
import { bold, brightGreen, brightYellow, dim, gray } from '../ansi.mjs'
import { fitCanvasCols, loadSprite } from '../sprite.mjs'
import { hpBar, menuList, padRight, typeBadge, wrap } from '../widgets.mjs'

/** Three-character labels, so the base-stat bars line up. */
const STAT_GLYPHS = {
  hp: 'HP ', attack: 'Atk', defense: 'Def',
  spAttack: 'SpA', spDefense: 'SpD', speed: 'Spd',
}

export function draw(ctx, size) {
  const { cols, rows } = size
  const lines = []
  const overlays = []

  const dex = loadData().pokedex
  const selected = dex[ctx.dexSelection]
  const caught = ctx.save.dex.caught.includes(selected.id)
  const seen = caught || ctx.save.dex.seen.includes(selected.id)

  const listWidth = 28
  const detailLeft = listWidth + 4

  lines.push(
    ` ${brightYellow('◓')} ${bold('POKÉDEX')}   ${dim(
      `${ctx.save.dex.caught.length} caught · ${ctx.save.dex.seen.length} seen · of 151`,
    )}`,
  )
  lines.push('')

  const entries = dex.map((mon) => {
    const number = dim(String(mon.id).padStart(3, '0'))
    const isCaught = ctx.save.dex.caught.includes(mon.id)
    const isSeen = isCaught || ctx.save.dex.seen.includes(mon.id)
    const mark = isCaught ? brightGreen('●') : isSeen ? dim('◐') : gray('·')
    const name = isSeen ? mon.name : gray('-----')
    return `${number} ${mark} ${name}`
  })

  const listHeight = Math.max(6, rows - 6)
  const list = menuList(entries, ctx.dexSelection, { height: listHeight, width: listWidth })

  // Detail panel drawn alongside the list.
  const detail = []
  if (seen) {
    detail.push(`${bold(selected.name.toUpperCase())}  ${dim(`#${String(selected.id).padStart(3, '0')}`)}`)
    detail.push(selected.types.map(typeBadge).join(' '))
    detail.push('')
    if (caught) {
      const stats = selected.stats
      detail.push(dim('Base stats'))
      for (const key of STAT_NAMES) {
        detail.push(`${STAT_GLYPHS[key]} ${hpBar(stats[key], 160, 18)} ${String(stats[key]).padStart(3)}`)
      }
      detail.push('')
      detail.push(dim(`Catch rate ${selected.captureRate} · Base exp ${selected.baseExp}`))
      const evolves = selected.evolutions
        .map((evolution) => {
          const how = evolution.trigger === 'level-up'
            ? `at level ${evolution.level}`
            : evolution.trigger === 'use-item'
              ? `with a ${evolution.item.replace(/-/g, ' ')}`
              : 'by trading'
          return `${species(evolution.to).name} ${how}`
        })
      if (evolves.length > 0) detail.push(dim(`Evolves into ${evolves.join(', ')}`))
    } else {
      detail.push(dim('Seen, but not yet caught.'))
      detail.push(dim('Catch one to fill in its entry.'))
    }
  } else {
    detail.push(gray('No data.'))
  }

  // Sprite for the highlighted entry.
  const sprite = seen
    ? loadSprite(spriteFile('front', selected.id, 'png'), {
      cols: Math.min(fitCanvasCols(size, 18, ctx.spriteScale), (cols - detailLeft - 4) * 2),
    })
    : null
  const spriteBlock = sprite ? sprite.rows : []

  const rightColumn = [...detail, '', ...spriteBlock]

  for (let row = 0; row < Math.max(list.length, rightColumn.length); row++) {
    const left = padRight(list[row] ?? '', listWidth)
    const right = rightColumn[row] ?? ''
    lines.push(` ${left}  ${dim('│')}  ${right}`)
  }

  while (lines.length < rows - 1) lines.push('')
  lines.push(dim(' ↑ ↓ browse · PgUp/PgDn jump · [esc] back'))

  return { lines, overlays }
}

export function onKey(ctx, key) {
  const total = loadData().pokedex.length
  const step = key.name === 'pageup' || key.name === 'pagedown' ? 10 : 1

  if (key.name === 'up' || key.name === 'k') ctx.dexSelection = wrap(ctx.dexSelection - 1, total)
  else if (key.name === 'down' || key.name === 'j') ctx.dexSelection = wrap(ctx.dexSelection + 1, total)
  else if (key.name === 'pageup') ctx.dexSelection = Math.max(0, ctx.dexSelection - step)
  else if (key.name === 'pagedown') ctx.dexSelection = Math.min(total - 1, ctx.dexSelection + step)
  else if (key.name === 'escape' || key.name === 'q') ctx.setMode('home')
}
