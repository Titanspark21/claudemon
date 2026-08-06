// The shop. Spend what you won.

import { ITEMS, SHOP_STOCK, countOf } from '../../shop.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { menuList, money, padLeft, padRight, panel, withFooter, wrap } from '../widgets.mjs'

export function draw(ctx, size) {
  const { cols, rows } = size
  const lines = []
  const width = Math.min(cols - 2, 68)

  lines.push(
    ` ${brightYellow('◓')} ${bold('SHOP')}   ${dim('you have')} ${bold(money(ctx.save.money))}`,
  )
  lines.push('')

  const entries = SHOP_STOCK.map((key) => {
    const item = ITEMS[key]
    const owned = countOf(ctx.save, key)
    const affordable = ctx.save.money >= item.price
    const price = money(item.price)
    const name = affordable ? item.name : gray(item.name)
    return `${padRight(name, 18)} ${padLeft(affordable ? price : gray(price), 8)}  ${
      owned > 0 ? dim(`have ${owned}`) : ''
    }`
  })

  const height = Math.max(6, rows - 12)
  for (const row of menuList(entries, ctx.shopSelection, { height, width: width - 2 })) {
    lines.push(` ${row}`)
  }

  const chosen = ITEMS[SHOP_STOCK[ctx.shopSelection]]
  lines.push('')
  for (const row of panel(
    [chosen.description, ctx.shopMessage ?? dim('[enter] buy one · [5] buy five')],
    width,
  )) {
    lines.push(` ${row}`)
  }

  const hints = ' ↑ ↓ browse · [enter] buy one · [5] buy five · [esc] back'
  return { lines: withFooter(lines, dim(hints), rows), overlays: [] }
}

export function onKey(ctx, key) {
  const total = SHOP_STOCK.length

  if (key.name === 'up' || key.name === 'k') {
    ctx.shopSelection = wrap(ctx.shopSelection - 1, total)
    ctx.shopMessage = null
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.shopSelection = wrap(ctx.shopSelection + 1, total)
    ctx.shopMessage = null
  } else if (key.name === 'enter' || key.name === 'space') {
    ctx.buyItem(SHOP_STOCK[ctx.shopSelection], 1)
  } else if (key.name === '5') {
    ctx.buyItem(SHOP_STOCK[ctx.shopSelection], 5)
  } else if (key.name === 'escape' || key.name === 'q') {
    ctx.shopMessage = null
    ctx.setMode('home')
  }
}
