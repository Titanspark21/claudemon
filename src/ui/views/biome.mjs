import { MINUTE_MS } from '../../constants.mjs'
import { bold, CLEAR, dim, fg } from '../ansi.mjs'
import { truncate, visibleLength } from '../text.mjs'
import { panel, wrap } from '../widgets.mjs'
import {
  BIOME_FORK_MESSAGES,
  BIOME_STYLES,
  MAX_HOME_WIDTH,
} from './constants.mjs'

const fallbackStyle = (biome) => ({
  name: String(biome ?? 'Unknown biome'),
  mark: '·',
  colour: [150, 150, 150],
})

export const biomeStyle = (biome) => BIOME_STYLES[biome] ?? fallbackStyle(biome)

export const biomeName = (biome) => biomeStyle(biome).name

const viewWidth = (size) => {
  return Math.max(
    8,
    Math.min(Math.max(8, size?.cols ?? 80) - 2, MAX_HOME_WIDTH),
  )
}

const fit = (text, width) => {
  if (visibleLength(text) <= width) return text

  return truncate(text, Math.max(1, width - 1))
}

export const drawBiomeStatus = (expedition, size) => {
  if (!expedition) return []

  const width = viewWidth(size)
  const style = biomeStyle(expedition.biome)
  const elapsedMinutes = Math.max(
    0,
    Math.floor((expedition.elapsedMs ?? 0) / MINUTE_MS),
  )
  const targetMinutes = Math.max(
    1,
    Math.ceil((expedition.forcedTargetMs ?? MINUTE_MS) / MINUTE_MS),
  )
  const percent = Math.min(
    100,
    Math.max(0, Math.floor((elapsedMinutes / targetMinutes) * 100)),
  )
  const mark = `${fg(...style.colour)}${style.mark}${CLEAR}`
  const full = `${mark} ${bold(style.name)} ${dim(`· ${elapsedMinutes}/${targetMinutes} min · ${percent}%`)}`
  const compact = `${mark} ${bold(style.name)} ${dim(`· ${percent}%`)}`

  return [fit(visibleLength(full) <= width ? full : compact, width)]
}

export const forkOptions = (expedition) => {
  if (expedition?.pendingDeparture?.paths?.length === 2) {
    return expedition.pendingDeparture.paths.map((value) => ({
      value,
      label: biomeName(value),
    }))
  }

  if (!expedition?.optionalOffered || expedition?.optionalDismissed) return []
  if (
    !Array.isArray(expedition.optionalPaths) ||
    expedition.optionalPaths.length !== 2
  )
    return []

  return [
    {
      value: expedition.optionalPaths[0],
      label: biomeName(expedition.optionalPaths[0]),
    },
    { value: 'stay', label: BIOME_FORK_MESSAGES.stay },
    {
      value: expedition.optionalPaths[1],
      label: biomeName(expedition.optionalPaths[1]),
    },
  ]
}

export const hasBiomeFork = (expedition) => forkOptions(expedition).length > 0

const choiceLabel = (option, selected) => {
  return `${selected ? '▶ ' : '  '}${selected ? bold(option.label) : option.label}`
}

export const drawFork = (
  expedition,
  selection = 0,
  size = { cols: 80, rows: 24 },
) => {
  const options = forkOptions(expedition)

  if (options.length === 0) return []

  const mandatory = expedition.pendingDeparture != null
  const width = viewWidth(size)
  const chosen = wrap(selection, options.length)
  const title = mandatory
    ? BIOME_FORK_MESSAGES.mandatoryTitle
    : BIOME_FORK_MESSAGES.optionalTitle
  let content

  if (width >= 48) {
    const choices = options
      .map((option, index) => choiceLabel(option, index === chosen))
      .join('   ')
    const note = mandatory
      ? `${BIOME_FORK_MESSAGES.automatic} · ${BIOME_FORK_MESSAGES.hint}`
      : BIOME_FORK_MESSAGES.hint

    content = [choices, dim(note)]
  } else {
    content = options.map((option, index) =>
      choiceLabel(option, index === chosen),
    )

    if (mandatory) content.push(dim(BIOME_FORK_MESSAGES.automatic))
  }

  return panel(content, width, { title })
}

export const onBiomeKey = (ctx, key) => {
  const expedition = ctx.save?.expedition
  const options = forkOptions(expedition)

  if (options.length === 0) return

  ctx.biomeSelection = wrap(ctx.biomeSelection ?? 0, options.length)

  if (['left', 'up', 'right', 'down'].includes(key.name)) {
    const delta = key.name === 'left' || key.name === 'up' ? -1 : 1

    ctx.biomeSelection = wrap(ctx.biomeSelection + delta, options.length)
    ctx.playSound('cursor')
    return
  }

  if (key.name !== 'enter' && key.name !== 'space') return

  ctx.playSound('select')
  ctx.chooseBiomePath(options[ctx.biomeSelection].value)
}
