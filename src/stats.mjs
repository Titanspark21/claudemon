import { IV_MAX, STAT_NAMES } from './constants.mjs'
import { species } from './data.mjs'
import { randInt } from './rng.mjs'

export const rollIvs = (rng) => {
  const ivs = {}

  for (const stat of STAT_NAMES) ivs[stat] = randInt(rng, 0, IV_MAX)

  return ivs
}

export const statsAtLevel = (speciesId, level, ivs) => {
  const base = species(speciesId).stats
  const stats = {}

  stats.hp = Math.floor(((2 * base.hp + ivs.hp) * level) / 100) + level + 10

  for (const stat of STAT_NAMES) {
    if (stat === 'hp') continue

    stats[stat] = Math.floor(((2 * base[stat] + ivs[stat]) * level) / 100) + 5
  }

  return stats
}
