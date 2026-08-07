import { GYMS } from '../../constants.mjs'
import { levelOf } from '../../pokemon.mjs'
import { hasBadge } from '../../state.mjs'
import { brightGreen, brightYellow, dim, gray } from '../ansi.mjs'
import {
  BADGE_MARKS,
  DEX_MARKS,
  DEX_SORT,
  EVOLUTION_WORDING,
  OPTIONS_PREVIEW_SPECIES,
  PARTY_SORT,
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

export const sortedDex = (pokedex, sort) => {
  if (sort === DEX_SORT.name) {
    return [...pokedex].sort((a, b) => a.name.localeCompare(b.name))
  }

  return pokedex
}

const byLevelThenIndex = (a, b) => {
  const byLevel = levelOf(b.mon) - levelOf(a.mon)

  if (byLevel !== 0) return byLevel

  return a.index - b.index
}

export const sortedPartyEntries = (party, sort) => {
  const entries = party.map((mon, index) => ({ mon, index }))

  if (sort === PARTY_SORT.level) return entries.sort(byLevelThenIndex)

  return entries
}

export const partyEntryAt = (party, selection, sort) => {
  const entries = sortedPartyEntries(party, sort)

  return entries[clampSelection(selection, entries.length)]
}

export const nextPartySort = (sort) => {
  if (sort === PARTY_SORT.level) return PARTY_SORT.order

  return PARTY_SORT.level
}

export const partySelectionAfterSort = (party, selection, sort, nextSort) => {
  const current = partyEntryAt(party, selection, sort)

  return sortedPartyEntries(party, nextSort).findIndex(
    (entry) => entry.index === current.index,
  )
}

export const nextDexSort = (sort) => {
  if (sort === DEX_SORT.name) return DEX_SORT.number

  return DEX_SORT.name
}

export const dexSelectionAfterSort = (pokedex, selection, sort, nextSort) => {
  const current = sortedDex(pokedex, sort)[
    clampSelection(selection, pokedex.length)
  ]

  return sortedDex(pokedex, nextSort).findIndex((mon) => mon.id === current.id)
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
