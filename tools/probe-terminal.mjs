import { existsSync } from 'node:fs'
import { spriteFile } from '../src/paths.mjs'
import { bg, bold, dim, RESET } from '../src/ui/ansi.mjs'
import { NATIVE_CANVAS_COLS } from '../src/ui/constants.mjs'
import { fitCanvasCols, renderSprite } from '../src/ui/sprite.mjs'
import {
  GRADIENT_STEPS,
  PROBE_LABEL_WIDTH,
  PROBE_MESSAGES,
  PROBE_RULE_WIDTH,
  PROBE_SPRITE_ID,
  QUADRANT_SAMPLE,
} from './constants.mjs'

const spritePath = spriteFile('front', PROBE_SPRITE_ID, 'png')

const heading = (text) => console.log(`\n${bold(text)}`)

console.log(bold(PROBE_MESSAGES.title))
console.log(dim('─'.repeat(PROBE_RULE_WIDTH)))

for (const [label, value] of [
  ['TERM_PROGRAM', process.env.TERM_PROGRAM],
  ['TERM', process.env.TERM],
  ['COLORTERM', process.env.COLORTERM],
  ['TMUX', process.env.TMUX ? 'yes' : 'no'],
  ['size', `${process.stdout.columns}x${process.stdout.rows}`],
]) {
  console.log(
    `  ${label.padEnd(PROBE_LABEL_WIDTH)} ${value ?? dim(PROBE_MESSAGES.unset)}`,
  )
}

heading(PROBE_MESSAGES.truecolor)

const lastStep = GRADIENT_STEPS - 1

let gradient = '  '

for (let i = 0; i < GRADIENT_STEPS; i++) {
  gradient +=
    bg(
      Math.round((255 * i) / lastStep),
      90,
      200 - Math.round((120 * i) / lastStep),
    ) + ' '
}

console.log(gradient + RESET)

heading(PROBE_MESSAGES.quadrants)
console.log(QUADRANT_SAMPLE)
console.log(dim(PROBE_MESSAGES.blockElements))
console.log(dim(PROBE_MESSAGES.oldFont))

if (!existsSync(spritePath)) {
  heading(PROBE_MESSAGES.spritesMissing)
  console.log(
    `  Run: ${bold(`node tools/fetch-sprites.mjs ${PROBE_SPRITE_ID}`)}`,
  )
  process.exit(0)
}

heading(PROBE_MESSAGES.native)

const native = renderSprite(spritePath, { cols: NATIVE_CANVAS_COLS })

for (const row of native.rows) console.log(`  ${row}`)

console.log(
  dim(
    `  ${native.cols} columns x ${native.rows.length} rows, one pixel per pixel`,
  ),
)

heading(PROBE_MESSAGES.fitted)

const fitted = renderSprite(spritePath, {
  cols: fitCanvasCols({
    cols: process.stdout.columns ?? 80,
    rows: process.stdout.rows ?? 24,
  }),
})

for (const row of fitted.rows) console.log(`  ${row}`)

console.log(dim(`  ${fitted.cols} columns x ${fitted.rows.length} rows`))

if (fitted.cols < native.cols) {
  console.log(dim(PROBE_MESSAGES.tallerWindow))
}

console.log(dim('─'.repeat(PROBE_RULE_WIDTH)))
console.log(PROBE_MESSAGES.heightBinds)
console.log(PROBE_MESSAGES.tallerTab)
