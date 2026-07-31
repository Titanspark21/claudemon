// The OPTION screen.
//
// Every setting here redraws the Pokemon underneath it — you change a value and
// immediately see what it did, which is the only honest way to offer a choice about
// how something looks. It is also why there is no setting for *how* sprites are
// drawn any more: there is one way now, it works in every font, and a choice whose
// wrong answer is a screenful of tofu was never a choice worth offering.

import { spriteScale } from '../../config.mjs'
import { spriteFile } from '../../paths.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import {
  NATIVE_CANVAS_COLS, fitCanvasCols, loadSprite, placeSprite, spriteHeight,
} from '../sprite.mjs'
import { centre, padRight, wrap } from '../widgets.mjs'

/** The Pokemon in the preview when there is no team to show one from. */
const FALLBACK_SPECIES = 25

/**
 * Every setting on the screen, with the values it cycles through.
 *
 * `read` exists because a value on disk is not always one of ours: the file is
 * hand-editable, and `spriteScale` is a number that could be anything. Whatever
 * does not match falls back to the first entry, so the cursor always starts
 * somewhere real.
 */
export const SETTINGS = [
  {
    key: 'spriteScale',
    label: 'SIZE',
    read: (config) => spriteScale(config),
    values: [
      { value: 1, label: 'FULL', note: 'As big as the window allows, which is also as sharp as it gets.' },
      { value: 0.8, label: 'LARGE', note: 'A little smaller than the window could manage.' },
      { value: 0.65, label: 'MEDIUM', note: 'Leaves more of the screen to the menus and the message box.' },
      { value: 0.5, label: 'SMALL', note: 'Half size. Chunky, but it fits in a short tab.' },
    ],
  },
  {
    key: 'bell',
    label: 'BELL',
    read: (config) => config?.bell !== false,
    values: [
      { value: true, label: 'ON', note: 'Ring the terminal bell when Claude finishes or needs you.' },
      { value: false, label: 'OFF', note: 'Never make a sound.' },
    ],
  },
]

/** Which entry of a setting is in force, always a real index. */
export function currentIndex(setting, config) {
  const index = setting.values.findIndex((entry) => entry.value === setting.read(config))
  return index < 0 ? 0 : index
}

function settingRows(ctx) {
  return SETTINGS.map((setting, index) => {
    const chosen = index === ctx.optionsSelection
    const value = setting.values[currentIndex(setting, ctx.config)]
    const cursor = chosen ? '▶ ' : '  '
    const arrows = chosen ? [dim('◀'), dim('▶')] : [' ', ' ']
    const shown = chosen ? bold(value.label) : value.label
    return `${cursor}${padRight(setting.label, 10)}${arrows[0]} ${padRight(shown, 8)}${arrows[1]}`
  })
}

export function draw(ctx, size) {
  const { cols, rows } = size
  const lines = []
  const overlays = []

  lines.push(` ${brightYellow('◓')} ${bold('OPTION')}`)
  lines.push('')
  for (const row of settingRows(ctx)) lines.push(` ${row}`)
  lines.push('')

  const setting = SETTINGS[ctx.optionsSelection]
  const note = setting.values[currentIndex(setting, ctx.config)].note
  lines.push(` ${ctx.optionsMessage ? brightYellow(ctx.optionsMessage) : dim(note)}`)
  lines.push('')

  // The preview is the point of the screen, so it gets whatever is left: the rows
  // already used, plus the caption and the footer still to come.
  const canvas = fitCanvasCols(size, lines.length + 4, ctx.spriteScale)
  const species = ctx.save?.party?.[0]?.species ?? FALLBACK_SPECIES
  const sprite = loadSprite(spriteFile('front', species, 'png'), { cols: canvas })

  if (sprite) {
    // Cropping means a sprite is usually shorter than the canvas it was drawn on —
    // a Pikachu leaves rows over that a Snorlax would not — so it is centred in
    // what is free rather than left hanging under the settings.
    const free = rows - 2 - lines.length - spriteHeight(sprite)
    for (let row = 0; row < Math.floor(Math.max(0, free) / 2); row++) lines.push('')
    placeSprite(lines, sprite, Math.max(1, Math.floor((cols - sprite.cols) / 2)))
  } else {
    lines.push(centre(gray('(sprite unavailable)'), cols))
  }

  // What SIZE actually bought. The canvas is measured against the source art rather
  // than against the window, because that ratio is the whole story: at 100% nothing
  // is thrown away, and below it this is the number saying where the detail went —
  // a shorter tab, or a SIZE turned down.
  const share = Math.round((Math.min(canvas, NATIVE_CANVAS_COLS) / NATIVE_CANVAS_COLS) * 100)
  lines.push(centre(dim(
    `${canvas}-column canvas · ${share === 100 ? 'pixel for pixel' : `${share}% of native`}`
    + ' · quadrant blocks · 4px per cell',
  ), cols))

  while (lines.length < rows - 1) lines.push('')
  lines.push(dim(' ↑ ↓ choose · ← → change · [esc] back'))

  return { lines, overlays }
}

/** Moves the highlighted setting on to its next value, and saves it. */
function change(ctx, delta) {
  const setting = SETTINGS[ctx.optionsSelection]
  const next = wrap(currentIndex(setting, ctx.config) + delta, setting.values.length)
  ctx.applyConfig({ [setting.key]: setting.values[next].value })
}

export function onKey(ctx, key) {
  if (key.name === 'up' || key.name === 'k') {
    ctx.optionsSelection = wrap(ctx.optionsSelection - 1, SETTINGS.length)
    ctx.optionsMessage = null
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.optionsSelection = wrap(ctx.optionsSelection + 1, SETTINGS.length)
    ctx.optionsMessage = null
  } else if (key.name === 'left' || key.name === 'h') {
    change(ctx, -1)
  } else if (key.name === 'right' || key.name === 'l' || key.name === 'enter' || key.name === 'space') {
    change(ctx, 1)
  } else if (key.name === 'escape' || key.name === 'q') {
    ctx.optionsMessage = null
    ctx.setMode('home')
  }
}
