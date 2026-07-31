// Shared pieces of interface: bars, panels, menus, badges.

import { bg, bold, clear, dim, fg, gray, visibleLength } from './ansi.mjs'

/** The series' type colours, so a Fire badge reads as Fire at a glance. */
const TYPE_COLORS = {
  normal: [168, 168, 120], fire: [240, 128, 48], water: [104, 144, 240],
  electric: [248, 208, 48], grass: [120, 200, 80], ice: [152, 216, 216],
  fighting: [192, 48, 40], poison: [160, 64, 160], ground: [224, 192, 104],
  flying: [168, 144, 240], psychic: [248, 88, 136], bug: [168, 184, 32],
  rock: [184, 160, 56], ghost: [112, 88, 152], dragon: [112, 56, 248],
  dark: [112, 88, 72], steel: [184, 184, 208], fairy: [238, 153, 172],
}

export function typeColor(type) {
  return TYPE_COLORS[type] ?? [136, 136, 136]
}

/**
 * Moves a selection index by `delta`, wrapping at both ends.
 *
 * Every menu in the game wraps, and every one of them can be empty at least
 * momentarily — an empty party, a bag with nothing usable — so the zero-length
 * case belongs here rather than in a guard at each call site.
 */
export function wrap(index, length) {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

/** Money, the one way the game writes it. */
export function money(amount) {
  return `${amount.toLocaleString('en-US')}₽`
}

/**
 * A duration, at the coarsest unit that still says something useful. Redrawn
 * every couple of seconds, so it never shows more precision than it has.
 */
export function elapsed(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total}s`

  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes}m${String(total % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

/** A type name on its own coloured background. */
export function typeBadge(type) {
  const [r, g, b] = typeColor(type)
  // Dark text on light backgrounds, light text on dark ones.
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  const text = luminance > 150 ? `${fg(20, 20, 20)}` : `${fg(255, 255, 255)}`
  return `${bg(r, g, b)}${text} ${type.toUpperCase()} ${clear}`
}

export function padRight(text, width) {
  return text + ' '.repeat(Math.max(0, width - visibleLength(text)))
}

export function padLeft(text, width) {
  return ' '.repeat(Math.max(0, width - visibleLength(text))) + text
}

export function centre(text, width) {
  const slack = Math.max(0, width - visibleLength(text))
  return ' '.repeat(Math.floor(slack / 2)) + text
}

/**
 * A health bar that changes colour as it empties, the way the games do.
 */
export function hpBar(current, max, width = 20) {
  const fraction = max > 0 ? Math.max(0, current / max) : 0
  const filled = current > 0 ? Math.max(1, Math.round(fraction * width)) : 0

  const colour = fraction > 0.5 ? [88, 208, 88] : fraction > 0.2 ? [248, 208, 48] : [240, 80, 64]
  const [r, g, b] = colour

  // The trailing reset is not optional: a full bar has no grey tail to close the
  // colour, and everything after it on the line would inherit green.
  return `${fg(r, g, b)}${'█'.repeat(filled)}${clear}${gray('░'.repeat(width - filled))}`
}

export function expBar(fraction, width = 20) {
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)))
  return `${fg(96, 176, 240)}${'▬'.repeat(filled)}${clear}${gray('▬'.repeat(width - filled))}`
}

/**
 * A bordered panel. Content lines are padded to the inner width.
 */
export function panel(lines, width, { title = null } = {}) {
  const inner = Math.max(4, width - 2)
  const out = []

  const heading = title ? `─ ${bold(title)} ` : ''
  const headingWidth = visibleLength(heading)
  out.push(`┌${heading}${'─'.repeat(Math.max(0, inner - headingWidth))}┐`)

  for (const line of lines) {
    out.push(`│${padRight(line, inner)}│`)
  }
  out.push(`└${'─'.repeat(inner)}┘`)
  return out
}

/**
 * A menu laid out in columns, with the selection marked.
 *
 * @param {string[]} items
 * @param {number} selected index into items
 * @param {{columns?: number, width?: number}} options
 */
export function menuGrid(items, selected, { columns = 2, width = 40 } = {}) {
  const cellWidth = Math.floor(width / columns)
  const rows = []

  for (let start = 0; start < items.length; start += columns) {
    let line = ''
    for (let column = 0; column < columns; column++) {
      const index = start + column
      if (index >= items.length) break
      const chosen = index === selected
      const label = `${chosen ? '▶ ' : '  '}${chosen ? bold(items[index]) : items[index]}`
      line += padRight(label, cellWidth)
    }
    rows.push(line)
  }
  return rows
}

/** A single-column list with a cursor, windowed to `height` rows. */
export function menuList(items, selected, { height = 10, width = 40 } = {}) {
  // Keep the selection roughly centred once the list is longer than the window.
  const half = Math.floor(height / 2)
  let start = Math.max(0, Math.min(selected - half, items.length - height))
  if (start < 0) start = 0

  const rows = []
  for (let index = start; index < Math.min(items.length, start + height); index++) {
    const chosen = index === selected
    const label = `${chosen ? '▶ ' : '  '}${chosen ? bold(items[index]) : items[index]}`
    rows.push(padRight(label, width))
  }

  if (start > 0) rows[0] = padRight(`  ${dim('▲ more')}`, width)
  if (start + height < items.length) rows[rows.length - 1] = padRight(`  ${dim('▼ more')}`, width)

  return rows
}

const STATUS_TAGS = {
  burn: ['BRN', [240, 128, 48]], poison: ['PSN', [160, 64, 160]],
  paralysis: ['PAR', [248, 208, 48]], sleep: ['SLP', [136, 136, 136]],
  freeze: ['FRZ', [152, 216, 216]],
}

export function statusTag(status) {
  if (!status) return ''
  const [label, [r, g, b]] = STATUS_TAGS[status] ?? ['???', [136, 136, 136]]
  return `${bg(r, g, b)}${fg(20, 20, 20)} ${label} ${clear}`
}
