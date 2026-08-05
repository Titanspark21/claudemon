// The screen you leave open while you work.
//
// Quiet when nothing is happening, and loud the moment something is waiting.

import { isWorking } from '../../activity.mjs'
import { spriteFile } from '../../paths.mjs'
import { displayName, genderOf, isFainted, levelOf } from '../../pokemon.mjs'
import { activePokemon, partyIsWipedOut, partyNeedsHealing, totalBalls } from '../../state.mjs'
import { VERSION } from '../../version.mjs'
import { bold, brightGreen, brightYellow, dim, gray, visibleLength } from '../ansi.mjs'
import { bandRows, bandScale, grassLines } from '../grass.mjs'
import { fitCanvasCols, loadSprite, placeSprite } from '../sprite.mjs'
import {
  centre, elapsed, genderTag, hpBar, menuGrid, money, padRight, panel, wrap,
} from '../widgets.mjs'

/**
 * The home menu. `id` is what the state machine acts on and `label` is only ever
 * drawn, so renaming or translating an entry cannot change what it does.
 */
const BASE_MENU = [
  { id: 'dex', label: 'POKÉDEX' },
  { id: 'team', label: 'TEAM' },
  { id: 'shop', label: 'SHOP' },
  { id: 'heal', label: 'HEAL' },
  { id: 'options', label: 'OPTION' },
  { id: 'quit', label: 'QUIT' },
]

/**
 * Columns the longest label plus its cursor needs. A window too narrow to give
 * every entry that much gets a menu on two rows instead of entries running into
 * each other.
 */
const MENU_CELL = 10

/**
 * FIGHT only appears when there is something to fight, and it goes first so the
 * default action is the one you opened the tab for.
 *
 * HEAL is marked rather than dropped while Claude works: healing is what you do in
 * the gaps, and an entry that vanishes reads as a bug where a greyed-out one reads as
 * a rule. `disabled` is the one flag both the drawing and the keys look at, so
 * neither of them gets to decide it on its own.
 */
export function menuItems(ctx) {
  const base = isWorking(ctx.activity)
    ? BASE_MENU.map((item) => (item.id === 'heal' ? { ...item, disabled: true } : item))
    : BASE_MENU
  if (!ctx.encounter) return base

  // Nobody left standing is nobody to send out. The entry stays, because the
  // countdown above it is still counting and the Pokemon is still there — it just
  // says no rather than swallowing the keypress, which is what it used to do.
  const fight = { id: 'fight', label: 'FIGHT', disabled: !activePokemon(ctx.save) }
  return [fight, ...base]
}

/**
 * How long is left to face it, as a line to read.
 *
 * The countdown is the whole point of the row: an encounter that vanishes with no
 * warning reads as a bug, and this is the difference between "it left" and
 * "I let it leave".
 */
export function countdownRow(encounter, now = Date.now()) {
  const left = Math.max(0, Math.ceil(((encounter.expiresAt ?? now) - now) / 1000))
  return dim(`it slips back into the grass in ${left}s`)
}

/**
 * What Claude Code is doing, in one line.
 *
 * Empty when nothing is reporting: a machine without the activity hook installed
 * should see no row at all rather than a confident "Claude is idle".
 */
export function activityRow(activity, now = Date.now()) {
  if (!activity || activity.state === 'unknown') return ''

  const age = typeof activity.since === 'number' ? ` ${dim('·')} ${dim(elapsed(now - activity.since))}` : ''
  const others = activity.sessions > 1 ? dim(` (+${activity.sessions - 1})`) : ''

  if (activity.state === 'waiting') {
    return `${brightYellow('◆')} ${bold('Claude needs you')}${others}${age}`
  }

  if (activity.state === 'working') {
    const tool = activity.tool ? ` ${dim('·')} ${activity.tool}` : ''
    return `${brightGreen('●')} Claude is working${others}${tool}${age}`
  }

  return `${dim('○')} ${dim('Claude is idle')}${others}${age}`
}

/**
 * Why HEAL is greyed out, for the one person looking straight at it.
 *
 * Only when the entry is both blocked and wanted: a team at full health does not need
 * to be told about a button it was not reaching for, and this row sits on a screen
 * somebody leaves open all day.
 */
export function restRow(ctx) {
  if (!isWorking(ctx.activity)) return ''

  // A team that is down cannot fight either, and that is the more urgent half of it:
  // this is the row explaining why the entry you just pressed did nothing.
  if (partyIsWipedOut(ctx.save)) {
    return dim('Your team is down — HEAL comes back when Claude stops working.')
  }
  if (!partyNeedsHealing(ctx.save)) return ''

  return dim('HEAL is a rest — it comes back when Claude stops working.')
}

/**
 * The line about versions, or nothing at all.
 *
 * Nothing at all is the normal case and the one worth protecting: this sits directly
 * under the activity row on a screen somebody leaves open all day, so it only ever
 * appears when there is something to do about it, and it says which key does it.
 */
export function updateRow(notice) {
  if (!notice) return ''

  if (notice.kind === 'stale') {
    return `${brightYellow('◆')} ${bold(`v${notice.version}`)} is installed ${dim('·')} ${dim('quit and run claudemon again')}`
  }
  return `${brightYellow('◆')} ${bold(`v${notice.version}`)} is out ${dim('·')} ${brightGreen('[u]')} ${dim('update')}`
}

/**
 * The bottom row: what the keys do, and which claudemon this is.
 *
 * The version goes hard right, and is the first thing dropped when the window cannot
 * hold both — the hints are how somebody uses the screen, and a wrapped footer would
 * cost a row the game has already spent.
 */
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

  // Where the grass goes, filled in at the end once it is known whether the
  // window has room to spare for it.
  let grassAt

  // Header
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
    lines.push(centre(
      `${brightYellow('✦')} ${bold(`A wild ${encounter.name.toUpperCase()}`)} appeared!`,
      cols,
    ))
    lines.push(centre(countdownRow(encounter), cols))
    lines.push('')

    // A missing sprite must not stop you fighting.
    const sprite = loadSprite(spriteFile('front', encounter.species, 'png'), {
      cols: fitCanvasCols(size, 16, ctx.spriteScale),
    })
    if (sprite) placeSprite(lines, sprite, Math.max(1, Math.floor((cols - sprite.cols) / 2)))
    // The grass it came out of, and you standing still in it: something has
    // jumped out, so this is not a moment you keep walking through.
    grassAt = lines.length
    lines.push('')
    lines.push(centre(`${brightGreen('[enter]')} face it`, cols))
  } else {
    lines.push('')
    // While Claude works you are walking, so the grass is not quiet — it just has
    // not turned anything up yet. Saying otherwise reads as a broken game.
    const working = ctx.activity?.state === 'working'
    lines.push(centre(dim(working ? 'Rustling in the grass...' : 'The grass is quiet.'), cols))
    lines.push('')
    grassAt = lines.length
    lines.push('')
    lines.push(centre(dim(
      working
        ? 'Every moment Claude works is a step further in.'
        : 'Keep working in Claude Code — longer prompts walk further.',
    ), cols))
  }

  // Party strip
  lines.push('')
  if (lead) {
    const party = ctx.save.party.map((mon) => {
      const name = isFainted(mon) ? gray(displayName(mon).toUpperCase()) : displayName(mon).toUpperCase()
      return `${padRight(`${name}${genderTag(genderOf(mon))}`, 12)} ${dim(`Lv${levelOf(mon)}`)} ${
        hpBar(mon.hp, mon.stats.hp, 10)}`
    })
    for (const line of panel(party, width, { title: 'Team' })) lines.push(` ${line}`)
  }

  // Directly under the team it is talking about, and above the entry it explains.
  const rest = restRow(ctx)
  if (rest) lines.push(` ${rest}`)

  const items = menuItems(ctx)
  // A blocked entry is greyed the same way a fainted party member is, so the screen
  // has one way of saying "here, but not right now".
  const labels = items.map((item) => (item.disabled ? gray(item.label) : item.label))
  // Built before the grass so both know how many rows the menu is about to take.
  const menuRows = menuGrid(labels, ctx.homeSelection, {
    columns: Math.min(items.length, Math.max(1, Math.floor(width / MENU_CELL))),
    width,
  })

  // The grass is the last thing in and the first thing to go: everything else on
  // this screen is something you need to be able to read. It lines up with the
  // team panel rather than the window, so the field has an edge to it.
  const scale = bandScale(size)
  if (grassAt >= 0 && rows - 3 - menuRows.length - lines.length >= bandRows(scale)) {
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
  // Only ever a shortcut, and only while the notice above says so: the update screen
  // shells out, so nothing should be able to reach it by a stray keypress.
  if (key.name === 'u' && ctx.updateNotice?.kind === 'available') {
    ctx.startUpdate()
    return
  }

  const items = menuItems(ctx)
  // The menu shrinks on its own the moment an encounter times out, which can happen
  // between two keypresses. Clamping here means the worst case is a key landing on
  // the last entry rather than on nothing at all.
  ctx.homeSelection = Math.min(Math.max(0, ctx.homeSelection), items.length - 1)

  if (key.name === 'left' || key.name === 'right') {
    ctx.homeSelection = wrap(ctx.homeSelection + (key.name === 'left' ? -1 : 1), items.length)
    ctx.playSound?.('cursor')
  } else if (key.name === 'enter' || key.name === 'space') {
    const item = items[ctx.homeSelection]
    // A blocked entry answers rather than doing nothing at all: the two notes that
    // back out of a screen, which already read as "no" everywhere else in the game.
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
