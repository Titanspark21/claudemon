import {
  item as itemData,
  loadData,
  move as moveData,
  species,
} from '../data.mjs'
import { expProgress } from '../exp.mjs'
import { natureModifiers } from '../natures.mjs'
import { displayName, genderOf, levelOf } from '../pokemon.mjs'
import { bold, dim } from './ansi.mjs'
import { truncate, visibleLength } from './text.mjs'
import {
  evolutionTag,
  expBar,
  genderTag,
  hpBar,
  padRight,
  shinyTag,
  statusTag,
  typeBadge,
} from './widgets.mjs'

const IV_KEYS = ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed']
const MAX_IV_TOTAL = IV_KEYS.length * 31
const STAT_LABELS = {
  hp: 'HP',
  attack: 'Atk',
  defense: 'Def',
  spAttack: 'SpA',
  spDefense: 'SpD',
  speed: 'Spd',
}

const titleCase = (value) =>
  String(value ?? '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')

const ivValue = (ivs, key) => {
  const value = Number(ivs?.[key])

  if (!Number.isFinite(value)) return 0

  return Math.max(0, Math.min(31, value))
}

const ivTotal = (ivs) =>
  IV_KEYS.reduce((total, key) => total + ivValue(ivs, key), 0)

export const ivPercentage = (ivs) =>
  Math.round((ivTotal(ivs) / MAX_IV_TOTAL) * 1000) / 10

export const natureLabel = (nature) => {
  if (!nature) return 'Unknown'

  const name = titleCase(nature)
  let modifiers

  try {
    modifiers = natureModifiers(nature)
  } catch {
    return `${name} (unknown)`
  }

  if (!modifiers.raised || !modifiers.lowered) return `${name} (neutral)`

  return `${name} (+${STAT_LABELS[modifiers.raised]} / -${STAT_LABELS[modifiers.lowered]})`
}

export const abilityLabel = (mon) => {
  if (!mon?.ability) return 'Unknown'

  const data = loadData().abilities?.[mon.ability]
  const name = data?.name ?? titleCase(mon.ability)
  const slot = (species(mon.species).abilities ?? []).find(
    (candidate) => candidate.ability === mon.ability,
  )

  return slot?.hidden ? `${name} (Hidden)` : name
}

export const heldItemLabel = (mon) => {
  if (!mon?.heldItem) return 'None'

  try {
    return itemData(mon.heldItem).name
  } catch {
    return titleCase(mon.heldItem)
  }
}

const formLabel = (mon) => {
  const form = species(mon.species).formKey

  return form ? titleCase(form) : 'Base'
}

const fitRow = (row, width) => {
  if (!Number.isFinite(width) || visibleLength(row) <= width) return row
  if (width <= 1) return '…'.slice(0, Math.max(0, width))

  return truncate(row, width - 1)
}

const pairRows = (first, second, width) => {
  const combined = `  ${first} · ${second}`

  if (!Number.isFinite(width) || visibleLength(combined) <= width)
    return [combined]

  return [fitRow(`  ${first}`, width), fitRow(`  ${second}`, width)]
}

const ivRows = (mon, width) => {
  const total = ivTotal(mon.ivs)
  const first = `  HP ${String(ivValue(mon.ivs, 'hp')).padStart(2)}   Atk ${String(
    ivValue(mon.ivs, 'attack'),
  ).padStart(2)}   Def ${String(ivValue(mon.ivs, 'defense')).padStart(2)}`
  const second = `  SpA ${String(ivValue(mon.ivs, 'spAttack')).padStart(2)}   SpD ${String(
    ivValue(mon.ivs, 'spDefense'),
  ).padStart(2)}   Spd ${String(ivValue(mon.ivs, 'speed')).padStart(2)}`

  return [
    dim(`IVs · ${total}/${MAX_IV_TOTAL} · ${ivPercentage(mon.ivs)}%`),
    fitRow(first, width),
    fitRow(second, width),
  ]
}

const moveRows = (slot, width) => {
  const data = moveData(slot.move)
  const power = data.power ? `${data.power}` : '—'
  const metadata = `${typeBadge(data.type)} ${dim(
    `pow ${padRight(power, 4)} pp ${slot.pp}/${slot.maxPp}`,
  )}`
  const combined = `  ${padRight(data.name, 15)} ${metadata}`

  if (!Number.isFinite(width) || visibleLength(combined) <= width)
    return [combined]

  return [fitRow(`  ${data.name}`, width), fitRow(`    ${metadata}`, width)]
}

export const monDetail = (mon, { width = Infinity } = {}) => {
  const lines = []

  lines.push(
    fitRow(
      `${bold(displayName(mon).toUpperCase())}${genderTag(
        genderOf(mon),
      )}${shinyTag(mon.shiny)} ${dim(
        `Lv${levelOf(mon)}`,
      )}${evolutionTag(mon)} ${statusTag(mon.status)}`,
      width,
    ),
  )
  lines.push(fitRow(species(mon.species).types.map(typeBadge).join(' '), width))

  lines.push(dim('Identity'))
  lines.push(
    ...pairRows(
      `Form ${formLabel(mon)}`,
      `Nature ${natureLabel(mon.nature)}`,
      width,
    ),
  )
  lines.push(
    ...pairRows(
      `Ability ${abilityLabel(mon)}`,
      `Item ${heldItemLabel(mon)}`,
      width,
    ),
  )
  lines.push(...ivRows(mon, width))

  lines.push(
    fitRow(
      `HP  ${hpBar(mon.hp, mon.stats.hp, 22)} ${dim(`${mon.hp}/${mon.stats.hp}`)}`,
      width,
    ),
  )

  const progress = expProgress(mon.species, mon.exp)
  lines.push(
    fitRow(
      `EXP ${expBar(progress.fraction, 22)} ${dim(
        progress.needed > 0 ? `${progress.into}/${progress.needed}` : 'max',
      )}`,
      width,
    ),
  )

  lines.push(dim('Stats'))
  lines.push(
    fitRow(
      `  Atk ${String(mon.stats.attack).padStart(3)}   Def ${String(mon.stats.defense).padStart(3)}   Spd ${String(mon.stats.speed).padStart(3)}`,
      width,
    ),
  )
  lines.push(
    fitRow(
      `  SpA ${String(mon.stats.spAttack).padStart(3)}   SpD ${String(mon.stats.spDefense).padStart(3)}`,
      width,
    ),
  )

  lines.push(dim('Moves'))

  for (const slot of mon.moves) lines.push(...moveRows(slot, width))

  return lines
}
