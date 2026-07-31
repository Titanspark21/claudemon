// First run: your name, then your first Pokemon.

import { species } from '../../data.mjs'
import { STAT_NAMES, statsAtLevel } from '../../exp.mjs'
import { spriteFile } from '../../paths.mjs'
import { STARTERS } from '../../state.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { fitCanvasCols, loadSprite, placeSprite } from '../sprite.mjs'
import { centre, typeBadge, wrap } from '../widgets.mjs'

const MAX_NAME = 12

/** IVs are unknown at this point, so show the average roll. */
const AVERAGE_IV = 15

export function draw(ctx, size) {
  const { cols, rows } = size
  const lines = []
  const overlays = []

  lines.push('')
  lines.push(centre(`${brightYellow('◓')} ${bold('claudemon')}`, cols))
  lines.push('')

  if (ctx.setup.step === 'name') {
    lines.push('')
    lines.push(centre('First things first.', cols))
    lines.push('')
    lines.push(centre("What should people call you?", cols))
    lines.push('')

    const cursor = ctx.setup.blink ? '█' : ' '
    lines.push(centre(`${bold(ctx.setup.name)}${cursor}`, cols))
    lines.push('')
    lines.push(centre(dim(`[enter] confirm · up to ${MAX_NAME} characters`), cols))
    return { lines, overlays }
  }

  const chosenId = STARTERS[ctx.setup.selection]
  const chosen = species(chosenId)

  lines.push(centre('Choose your first Pokémon.', cols))
  lines.push('')

  const sprite = loadSprite(spriteFile('front', chosenId, 'png'), {
    cols: fitCanvasCols(size, 14, ctx.spriteScale),
  })
  if (sprite) placeSprite(lines, sprite, Math.max(1, Math.floor((cols - sprite.cols) / 2)))
  else lines.push(centre(gray('(sprite unavailable)'), cols))

  lines.push('')
  lines.push(centre(bold(chosen.name.toUpperCase()), cols))
  lines.push(centre(chosen.types.map(typeBadge).join(' '), cols))
  lines.push('')

  const stats = statsAtLevel(chosenId, 5, Object.fromEntries(
    STAT_NAMES.map((key) => [key, AVERAGE_IV]),
  ))
  lines.push(centre(
    dim(`at level 5 — HP ${stats.hp} · Atk ${stats.attack} · Def ${stats.defense} · Spd ${stats.speed}`),
    cols,
  ))

  lines.push('')
  const picker = STARTERS.map((id, index) => {
    const name = species(id).name.toUpperCase()
    return index === ctx.setup.selection ? `${brightYellow('▶')} ${bold(name)}` : dim(name)
  }).join('    ')
  lines.push(centre(picker, cols))

  while (lines.length < rows - 2) lines.push('')
  lines.push(centre(dim('← → choose · [enter] take it with you'), cols))

  return { lines, overlays }
}

export function onKey(ctx, key) {
  if (ctx.setup.step === 'name') {
    if (key.name === 'enter') {
      const trimmed = ctx.setup.name.trim()
      if (trimmed.length > 0) ctx.setup.step = 'starter'
      return
    }
    if (key.name === 'backspace') {
      ctx.setup.name = ctx.setup.name.slice(0, -1)
      return
    }
    // Printable characters only, so arrow keys do not end up in the name.
    if (key.char && key.char.length === 1 && key.char >= ' ' && ctx.setup.name.length < MAX_NAME) {
      ctx.setup.name += key.char
    }
    return
  }

  if (key.name === 'left') {
    ctx.setup.selection = wrap(ctx.setup.selection - 1, STARTERS.length)
  } else if (key.name === 'right') {
    ctx.setup.selection = wrap(ctx.setup.selection + 1, STARTERS.length)
  } else if (key.name === 'enter' || key.name === 'space') {
    ctx.finishSetup(STARTERS[ctx.setup.selection])
  }
}
