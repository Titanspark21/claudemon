import { isWorking } from '../../activity.mjs'
import { spriteFile } from '../../paths.mjs'
import { displayName, genderOf, isFainted, levelOf } from '../../pokemon.mjs'
import {
  activePokemon,
  partyIsWipedOut,
  partyNeedsHealing,
  totalBalls,
} from '../../state.mjs'
import { VERSION } from '../../version.mjs'
import {
  bold,
  brightGreen,
  brightYellow,
  dim,
  gray,
  visibleLength,
} from '../ansi.mjs'
import { bandRows, bandScale, grassLines } from '../grass.mjs'
import { fitCanvasCols, loadSprite, placeSprite } from '../sprite.mjs'
import {
  centre,
  elapsed,
  genderTag,
  hpBar,
  menuGrid,
  money,
  padRight,
  panel,
  wrap,
} from '../widgets.mjs'

const BASE_MENU = [
  { id: 'dex', label: 'POKÉDEX' },
  { id: 'team', label: 'TEAM' },
  { id: 'shop', label: 'SHOP' },
  { id: 'heal', label: 'HEAL' },
  { id: 'options', label: 'OPTION' },
  { id: 'quit', label: 'QUIT' },
]

const MENU_CELL = 10

export function menuItems(ctx) {
  const base = isWorking(ctx.activity)
    ? BASE_MENU.map((item) =>
        item.id === 'heal' ? { ...item, disabled: true } : item,
      )
    : BASE_MENU
  if (!ctx.encounter) return base

  const fight = {
    id: 'fight',
    label: 'FIGHT',
    disabled: !activePokemon(ctx.save),
  }
  return [fight, ...base]
}

export function countdownRow(encounter, now = Date.now()) {
  const left = Math.max(
    0,
    Math.ceil(((encounter.expiresAt ?? now) - now) / 1000),
  )
  return dim(`it slips back into the grass in ${left}s`)
}

export function activityRow(activity, now = Date.now()) {
  if (!activity || activity.state === 'unknown') return ''

  const age =
    typeof activity.since === 'number'
      ? ` ${dim('·')} ${dim(elapsed(now - activity.since))}`
      : ''
  const others =
    activity.sessions > 1 ? dim(` (+${activity.sessions - 1})`) : ''

  if (activity.state === 'waiting') {
    return `${brightYellow('◆')} ${bold('Claude needs you')}${others}${age}`
  }

  if (activity.state === 'working') {
    const tool = activity.tool ? ` ${dim('·')} ${activity.tool}` : ''
    return `${brightGreen('●')} Claude is working${others}${tool}${age}`
  }

  return `${dim('○')} ${dim('Claude is idle')}${others}${age}`
}

export function restRow(ctx) {
  if (!isWorking(ctx.activity)) return ''

  if (partyIsWipedOut(ctx.save)) {
    return dim('Your team is down — HEAL comes back when Claude stops working.')
  }
  if (!partyNeedsHealing(ctx.save)) return ''

  return dim('HEAL is a rest — it comes back when Claude stops working.')
}

export function updateRow(notice) {
  if (!notice) return ''

  if (notice.kind === 'stale') {
    return `${brightYellow('◆')} ${bold(`v${notice.version}`)} is installed ${dim('·')} ${dim('quit and run claudemon again')}`
  }
  return `${brightYellow('◆')} ${bold(`v${notice.version}`)} is out ${dim('·')} ${brightGreen('[u]')} ${dim('update')}`
}

export function footerRow(cols, version = VERSION) {
  const hints = ' ← → choose · [enter] open · [q] quit'
  if (!version) return dim(hints)

  const tag = `v${version} `
  const gap = cols - visibleLength(hints) - visibleLength(tag)
  if (gap < 1) return dim(hints)

  return dim(hints + ' '.repeat(gap) + tag)
}

export function draw(ctx, size) {
  const { cols, rows } = size
  const lines = []
  const overlays = []
  const width = Math.min(cols - 2, 72)

  const encounter = ctx.encounter
  const lead = ctx.save.party[0]

  let grassAt

  const title = `${brightYellow('◓')} ${bold('claudemon')}`
  const summary = dim(
    `${ctx.save.dex.caught.length}/151 caught · ${totalBalls(ctx.save)} balls · ${money(ctx.save.money)}`,
  )
  lines.push(` ${padRight(title, width - 40)}${summary}`)

  const activity = activityRow(ctx.activity)
  lines.push(activity ? ` ${activity}` : '')

  const update = updateRow(ctx.updateNotice)
  if (update) lines.push(` ${update}`)

  if (encounter) {
    lines.push(
      centre(
        `${brightYellow('✦')} ${bold(`A wild ${encounter.name.toUpperCase()}`)} appeared!`,
        cols,
      ),
    )
    lines.push(centre(countdownRow(encounter), cols))
    lines.push('')

    const sprite = loadSprite(spriteFile('front', encounter.species, 'png'), {
      cols: fitCanvasCols(size, 16, ctx.spriteScale),
    })
    if (sprite)
      placeSprite(
        lines,
        sprite,
        Math.max(1, Math.floor((cols - sprite.cols) / 2)),
      )
    grassAt = lines.length
    lines.push('')
    lines.push(centre(`${brightGreen('[enter]')} face it`, cols))
  } else {
    lines.push('')
    const working = ctx.activity?.state === 'working'
    lines.push(
      centre(
        dim(working ? 'Rustling in the grass...' : 'The grass is quiet.'),
        cols,
      ),
    )
    lines.push('')
    grassAt = lines.length
    lines.push('')
    lines.push(
      centre(
        dim(
          working
            ? 'Every moment Claude works is a step further in.'
            : 'Keep working in Claude Code — longer prompts walk further.',
        ),
        cols,
      ),
    )
  }

  lines.push('')
  if (lead) {
    const party = ctx.save.party.map((mon) => {
      const name = isFainted(mon)
        ? gray(displayName(mon).toUpperCase())
        : displayName(mon).toUpperCase()
      return `${padRight(`${name}${genderTag(genderOf(mon))}`, 12)} ${dim(`Lv${levelOf(mon)}`)} ${hpBar(
        mon.hp,
        mon.stats.hp,
        10,
      )}`
    })
    for (const line of panel(party, width, { title: 'Team' }))
      lines.push(` ${line}`)
  }

  const rest = restRow(ctx)
  if (rest) lines.push(` ${rest}`)

  const items = menuItems(ctx)
  const labels = items.map((item) =>
    item.disabled ? gray(item.label) : item.label,
  )
  const menuRows = menuGrid(labels, ctx.homeSelection, {
    columns: Math.min(items.length, Math.max(1, Math.floor(width / MENU_CELL))),
    width,
  })

  const scale = bandScale(size)
  if (
    grassAt >= 0 &&
    rows - 3 - menuRows.length - lines.length >= bandRows(scale)
  ) {
    const band = grassLines({
      cols: width,
      step: ctx.scene?.step ?? 0,
      walking: !encounter && ctx.activity?.state === 'working',
      scale,
    })
    lines.splice(grassAt, 0, ...band.map((row) => ` ${row}`))
  }

  while (lines.length < rows - 3 - menuRows.length) lines.push('')
  for (const row of menuRows) lines.push(` ${row}`)
  lines.push(footerRow(cols))

  return { lines, overlays }
}

export function onKey(ctx, key) {
  if (key.name === 'u' && ctx.updateNotice?.kind === 'available') {
    ctx.startUpdate()
    return
  }

  const items = menuItems(ctx)
  ctx.homeSelection = Math.min(Math.max(0, ctx.homeSelection), items.length - 1)

  if (key.name === 'left' || key.name === 'right') {
    ctx.homeSelection = wrap(
      ctx.homeSelection + (key.name === 'left' ? -1 : 1),
      items.length,
    )
    ctx.playSound?.('cursor')
  } else if (key.name === 'enter' || key.name === 'space') {
    const item = items[ctx.homeSelection]
    if (item.disabled) {
      ctx.playSound?.('back')
      return
    }
    ctx.playSound?.('select')
    ctx.openHomeSelection(item.id)
  } else if (key.name === 'q') {
    ctx.quit()
  }
}
