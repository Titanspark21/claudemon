// Checks what this terminal can actually do.
//
// Run it in the tab you intend to play in — colour support and window size differ
// between the VS Code terminal, iTerm2, Terminal.app and a tmux pane, and between
// them they decide how good a sprite can look.
//
//   node tools/probe-terminal.mjs

import { existsSync } from 'node:fs'
import { spriteFile } from '../src/paths.mjs'
import { bold, dim, bg, reset } from '../src/ui/ansi.mjs'
import { NATIVE_CANVAS_COLS, fitCanvasCols, renderSprite } from '../src/ui/sprite.mjs'

const SPRITE_ID = 25
const spritePath = spriteFile('front', SPRITE_ID, 'png')

function heading(text) {
  console.log(`\n${bold(text)}`)
}

console.log(bold('claudemon terminal probe'))
console.log(dim('─'.repeat(52)))
for (const [label, value] of [
  ['TERM_PROGRAM', process.env.TERM_PROGRAM],
  ['TERM', process.env.TERM],
  ['COLORTERM', process.env.COLORTERM],
  ['TMUX', process.env.TMUX ? 'yes' : 'no'],
  ['size', `${process.stdout.columns}x${process.stdout.rows}`],
]) {
  console.log(`  ${label.padEnd(16)} ${value ?? dim('(unset)')}`)
}

heading('1. Truecolor — should be one smooth gradient, no banding')
let gradient = '  '
for (let i = 0; i < 48; i++) {
  gradient += bg(Math.round((255 * i) / 47), 90, 200 - Math.round((120 * i) / 47)) + ' '
}
console.log(gradient + reset)

heading('2. Quadrant glyphs — should be ten solid corner shapes, not boxes')
console.log(`  ▘ ▝ ▖ ▗ ▚ ▞ ▛ ▜ ▙ ▟`)
console.log(dim('  These are Block Elements, so every monospace font has them.'))
console.log(dim('  If any came out as a box, your font is older than Unicode 1.1.'))

if (!existsSync(spritePath)) {
  heading('Sprites missing')
  console.log(`  Run: ${bold(`node tools/fetch-sprites.mjs ${SPRITE_ID}`)}`)
  process.exit(0)
}

heading('3. A sprite at native resolution — as good as it gets')
const native = renderSprite(spritePath, { cols: NATIVE_CANVAS_COLS })
for (const row of native.rows) console.log(`  ${row}`)
console.log(dim(`  ${native.cols} columns x ${native.rows.length} rows, one pixel per pixel`))

heading('4. The same sprite at the size this window actually allows')
const fitted = renderSprite(spritePath, {
  cols: fitCanvasCols({ cols: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 }),
})
for (const row of fitted.rows) console.log(`  ${row}`)
console.log(dim(`  ${fitted.cols} columns x ${fitted.rows.length} rows`))

if (fitted.cols < native.cols) {
  console.log(dim('  A taller window gets you closer to test 3.'))
}

console.log(dim('─'.repeat(52)))
console.log('Height is what binds, not width: a canvas costs half as many rows as')
console.log(`columns, so a taller tab is what buys a sharper Pokemon.`)
