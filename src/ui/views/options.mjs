// The OPTION screen.
//
// Every setting here redraws the Pokemon underneath it — you change a value and
// immediately see what it did, which is the only honest way to offer a choice about
// how something looks. It is also why there is no setting for *how* sprites are
// drawn any more: there is one way now, it works in every font, and a choice whose
// wrong answer is a screenful of tofu was never a choice worth offering.

import { spriteScale, updateCheckMode } from '../../config.mjs'
import { spriteFile } from '../../paths.mjs'
import { hasPlayer } from '../../sound.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import {
  NATIVE_CANVAS_COLS, fitCanvasCols, loadSprite, placeSprite, spriteHeight,
} from '../sprite.mjs'
import { centre, padRight, withFooter, wrap } from '../widgets.mjs'

/** The Pokemon in the preview when there is no team to show one from. */
const FALLBACK_SPECIES = 25

/**
 * Every setting on the screen, with the values it cycles through.
 *
 * `read` exists because a value on disk is not always one of ours: the file is
 * hand-editable, and `spriteScale` is a number that could be anything. Whatever
 * does not match falls back to the first entry, so the cursor always starts
 * somewhere real.
 *
 * `note` is usually the line to print, but may be a function where what there is to
 * say depends on the machine rather than on the setting.
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
    key: 'sound',
    label: 'SOUND',
    read: (config) => config?.sound !== false,
    values: [
      {
        value: true,
        label: 'ON',
        // Asked of the machine rather than written down, because turning this on
        // where nothing can play a file is the one case someone would otherwise sit
        // pressing keys at a silent terminal wondering which end was broken.
        note: () => (hasPlayer()
          ? 'Blips in the menus and a theme under a battle. One switch for every sound the game makes.'
          : 'No player on this machine (afplay, paplay, aplay, ffplay), so nothing will come of it.'),
      },
      { value: false, label: 'OFF', note: 'No blips. The bell below is a separate thing.' },
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
  {
    key: 'updateCheck',
    label: 'UPDATE',
    // The stored value is what goes back on disk, so the three modes are mapped
    // onto it rather than to names of their own — see config.mjs for why `true`
    // and `false` are still two of them.
    read: (config) => ({ off: false, launch: 'launch', daily: true })[updateCheckMode(config)],
    values: [
      { value: true, label: 'DAILY', note: 'Ask once a day whether a new claudemon is out. The only network this game uses.' },
      { value: 'launch', label: 'LAUNCH', note: 'Ask every time claudemon starts. One request a launch, and never while you play.' },
      { value: false, label: 'OFF', note: 'Never look. Nothing here opens a socket, and no new version is offered.' },
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
  const written = setting.values[currentIndex(setting, ctx.config)].note
  const note = typeof written === 'function' ? written() : written
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

  return { lines: withFooter(lines, dim(' ↑ ↓ choose · ← → change · [esc] back'), rows), overlays }
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
    ctx.playSound?.('cursor')
  } else if (key.name === 'down' || key.name === 'j') {
    ctx.optionsSelection = wrap(ctx.optionsSelection + 1, SETTINGS.length)
    ctx.optionsMessage = null
    ctx.playSound?.('cursor')
  } else if (key.name === 'left' || key.name === 'h') {
    change(ctx, -1)
    // After the change rather than before it, which is what makes SOUND answer for
    // itself: switching it on plays, switching it off does not, and either way the
    // press you just made is the thing you hear the result of.
    ctx.playSound?.('select')
  } else if (key.name === 'right' || key.name === 'l' || key.name === 'enter' || key.name === 'space') {
    change(ctx, 1)
    ctx.playSound?.('select')
  } else if (key.name === 'escape' || key.name === 'q') {
    ctx.optionsMessage = null
    ctx.playSound?.('back')
    ctx.setMode('home')
  }
}
