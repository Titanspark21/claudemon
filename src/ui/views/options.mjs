import { spriteScale, updateCheckMode } from '../../config.mjs'
import { spriteFile } from '../../paths.mjs'
import { hasPlayer } from '../../sound.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import {
  NATIVE_CANVAS_COLS,
  fitCanvasCols,
  loadSprite,
  placeSprite,
  spriteHeight,
} from '../sprite.mjs'
import { centre, padRight, withFooter, wrap } from '../widgets.mjs'

const FALLBACK_SPECIES = 25

export const SETTINGS = [
  {
    key: 'spriteScale',
    label: 'SIZE',
    read: (config) => spriteScale(config),
    values: [
      {
        value: 1,
        label: 'FULL',
        note: 'As big as the window allows, which is also as sharp as it gets.',
      },
      {
        value: 0.8,
        label: 'LARGE',
        note: 'A little smaller than the window could manage.',
      },
      {
        value: 0.65,
        label: 'MEDIUM',
        note: 'Leaves more of the screen to the menus and the message box.',
      },
      {
        value: 0.5,
        label: 'SMALL',
        note: 'Half size. Chunky, but it fits in a short tab.',
      },
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
        note: () =>
          hasPlayer()
            ? 'Blips in the menus and a theme under a battle. One switch for every sound the game makes.'
            : 'No player on this machine (afplay, paplay, aplay, ffplay), so nothing will come of it.',
      },
      {
        value: false,
        label: 'OFF',
        note: 'No blips. The bell below is a separate thing.',
      },
    ],
  },
  {
    key: 'bell',
    label: 'BELL',
    read: (config) => config?.bell !== false,
    values: [
      {
        value: true,
        label: 'ON',
        note: 'Ring the terminal bell when Claude finishes or needs you.',
      },
      { value: false, label: 'OFF', note: 'Never make a sound.' },
    ],
  },
  {
    key: 'updateCheck',
    label: 'UPDATE',
    read: (config) =>
      ({ off: false, launch: 'launch', daily: true })[updateCheckMode(config)],
    values: [
      {
        value: true,
        label: 'DAILY',
        note: 'Ask once a day whether a new claudemon is out. The only network this game uses.',
      },
      {
        value: 'launch',
        label: 'LAUNCH',
        note: 'Ask every time claudemon starts. One request a launch, and never while you play.',
      },
      {
        value: false,
        label: 'OFF',
        note: 'Never look. Nothing here opens a socket, and no new version is offered.',
      },
    ],
  },
]

export function currentIndex(setting, config) {
  const index = setting.values.findIndex(
    (entry) => entry.value === setting.read(config),
  )
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
  lines.push(
    ` ${ctx.optionsMessage ? brightYellow(ctx.optionsMessage) : dim(note)}`,
  )
  lines.push('')

  const canvas = fitCanvasCols(size, lines.length + 4, ctx.spriteScale)
  const species = ctx.save?.party?.[0]?.species ?? FALLBACK_SPECIES
  const sprite = loadSprite(spriteFile('front', species, 'png'), {
    cols: canvas,
  })

  if (sprite) {
    const free = rows - 2 - lines.length - spriteHeight(sprite)
    for (let row = 0; row < Math.floor(Math.max(0, free) / 2); row++)
      lines.push('')
    placeSprite(
      lines,
      sprite,
      Math.max(1, Math.floor((cols - sprite.cols) / 2)),
    )
  } else {
    lines.push(centre(gray('(sprite unavailable)'), cols))
  }

  const share = Math.round(
    (Math.min(canvas, NATIVE_CANVAS_COLS) / NATIVE_CANVAS_COLS) * 100,
  )
  lines.push(
    centre(
      dim(
        `${canvas}-column canvas · ${share === 100 ? 'pixel for pixel' : `${share}% of native`}` +
          ' · quadrant blocks · 4px per cell',
      ),
      cols,
    ),
  )

  return {
    lines: withFooter(
      lines,
      dim(' ↑ ↓ choose · ← → change · [esc] back'),
      rows,
    ),
    overlays,
  }
}

function change(ctx, delta) {
  const setting = SETTINGS[ctx.optionsSelection]
  const next = wrap(
    currentIndex(setting, ctx.config) + delta,
    setting.values.length,
  )
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
    ctx.playSound?.('select')
  } else if (
    key.name === 'right' ||
    key.name === 'l' ||
    key.name === 'enter' ||
    key.name === 'space'
  ) {
    change(ctx, 1)
    ctx.playSound?.('select')
  } else if (key.name === 'escape' || key.name === 'q') {
    ctx.optionsMessage = null
    ctx.playSound?.('back')
    ctx.setMode('home')
  }
}
