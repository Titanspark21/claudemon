import { IV_MAX, STAT_NAMES } from './constants.mjs'
import { species } from './data.mjs'
import { natureModifiers } from './natures.mjs'
import { randInt } from './rng.mjs'

export const rollIvs = (rng) => {
  const ivs = {}

  for (const stat of STAT_NAMES) ivs[stat] = randInt(rng, 0, IV_MAX)

  return ivs
}

export const ivPercentage = (ivs) => {
  const total = STAT_NAMES.reduce((sum, stat) => sum + (ivs?.[stat] ?? 0), 0)

  return (total / (IV_MAX * STAT_NAMES.length)) * 100
}

export const statsAtLevel = (speciesId, level, ivs, nature = null) => {
  const base = species(speciesId).stats
  const modifiers = natureModifiers(nature)
  const stats = {}

  stats.hp = Math.floor(((2 * base.hp + ivs.hp) * level) / 100) + level + 10

  for (const stat of STAT_NAMES) {
    if (stat === 'hp') continue

    const raw = Math.floor(((2 * base[stat] + ivs[stat]) * level) / 100) + 5
    const multiplier =
      stat === modifiers.raised ? 1.1 : stat === modifiers.lowered ? 0.9 : 1

    stats[stat] = Math.floor(raw * multiplier)
  }

  return stats
}
