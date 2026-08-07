import { GYMS } from '../../constants.mjs'
import { hasBadge } from '../../state.mjs'
import { brightGreen, brightYellow, dim, gray } from '../ansi.mjs'
import {
  BADGE_MARKS,
  DEX_MARKS,
  EVOLUTION_WORDING,
  OPTIONS_PREVIEW_SPECIES,
  UPDATE_FOOTERS,
  UPDATE_HEADINGS,
} from './constants.mjs'

export const clampSelection = (selection, total) => {
  return Math.max(0, Math.min(selection, total - 1))
}

export const zipColumns = (left, right) => {
  const depth = Math.max(left.length, right.length)
  const rows = []

  for (let row = 0; row < depth; row++) {
    rows.push([left[row] ?? '', right[row] ?? ''])
  }

  return rows
}

export const noteRows = (note) => {
  if (!note) return []
  if (Array.isArray(note)) return note

  return [note]
}

export const dexMark = (isCaught, isSeen) => {
  if (isCaught) return brightGreen(DEX_MARKS.caught)
  if (isSeen) return dim(DEX_MARKS.seen)

  return gray(DEX_MARKS.unseen)
}

export const menuColumns = (count, width, cell) => {
  const perRow = Math.max(1, Math.floor(width / cell))
  const rows = Math.ceil(count / perRow)

  return Math.min(count, Math.ceil(count / Math.max(1, rows)))
}

export const badgeMark = (earned) => {
  if (earned) return brightYellow(BADGE_MARKS.earned)

  return gray(BADGE_MARKS.missing)
}

export const badgeStrip = (save) => {
  return GYMS.map((gym) => badgeMark(hasBadge(save, gym.id))).join('')
}

export const levelRangeLabel = (range) => {
  if (range.min === range.max) return `Lv${range.min}`

  return `Lv${range.min}-${range.max}`
}

export const evolutionWording = (evolution) => {
  if (evolution.trigger === 'level-up')
    return `${EVOLUTION_WORDING.level} ${evolution.level}`

  if (evolution.trigger === 'use-item')
    return `${EVOLUTION_WORDING.item} ${evolution.item.replace(/-/g, ' ')}`

  return EVOLUTION_WORDING.trade
}

export const updateHeading = (run) => {
  if (run.state === 'running')
    return `v${run.from} ${dim('→')} ${UPDATE_HEADINGS.newest}`

  if (!run.to)
    return `v${run.from} ${dim('→')} ${dim(UPDATE_HEADINGS.unchanged)}`

  return `v${run.from} ${dim('→')} v${run.to}`
}

export const updateFooter = (run) => {
  if (run.state === 'running') return UPDATE_FOOTERS.running

  return UPDATE_FOOTERS.done
}

export const currentIndex = (setting, config) => {
  const index = setting.values.findIndex(
    (entry) => entry.value === setting.read(config),
  )

  return index < 0 ? 0 : index
}

export const noteText = (note) => {
  if (typeof note === 'function') return note()

  return note
}

export const previewSpecies = (save) => {
  return save.party[0]?.species ?? OPTIONS_PREVIEW_SPECIES
}
