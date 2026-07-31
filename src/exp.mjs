// Levels, stats and experience.
//
// Stats use the modern formula with individual values but no effort values or
// natures: it behaves like the games people remember without asking a terminal
// game to model EV training.

import { loadData, move, species } from './data.mjs'
import { randInt } from './rng.mjs'

export const MAX_LEVEL = 100

/** How many moves a Pokemon can know at once. */
export const MOVE_LIMIT = 4

/**
 * The stats every Pokemon has, in display order.
 *
 * This is the shape of every `ivs` and `stats` object in a save, so anything
 * building one by hand should build it from here.
 */
export const STAT_NAMES = ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed']

/** Individual values, 0-31 per stat, rolled once when a Pokemon comes into being. */
export function rollIvs(rng) {
  const ivs = {}
  for (const stat of STAT_NAMES) ivs[stat] = randInt(rng, 0, 31)
  return ivs
}

export function statsAtLevel(speciesId, level, ivs) {
  const base = species(speciesId).stats
  const stats = {}

  // HP gets its own formula, with the flat +level +10 that makes low-level HP
  // pools survivable.
  stats.hp = Math.floor(((2 * base.hp + ivs.hp) * level) / 100) + level + 10

  for (const stat of STAT_NAMES) {
    if (stat === 'hp') continue
    stats[stat] = Math.floor(((2 * base[stat] + ivs[stat]) * level) / 100) + 5
  }
  return stats
}

export function expForLevel(speciesId, level) {
  const curve = loadData().growth[species(speciesId).growthRate]
  return curve[Math.min(Math.max(level, 1), MAX_LEVEL)]
}

/** The level a total experience figure corresponds to. */
export function levelFromExp(speciesId, exp) {
  const curve = loadData().growth[species(speciesId).growthRate]
  let level = 1
  while (level < MAX_LEVEL && exp >= curve[level + 1]) level++
  return level
}

/** Progress through the current level, for drawing the exp bar. */
export function expProgress(speciesId, exp) {
  const level = levelFromExp(speciesId, exp)
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, fraction: 1 }

  const start = expForLevel(speciesId, level)
  const next = expForLevel(speciesId, level + 1)
  const into = exp - start
  const needed = next - start
  return { level, into, needed, fraction: needed > 0 ? into / needed : 1 }
}

/**
 * Experience for beating a wild Pokemon.
 *
 * The Gen 5 formula without the participation and trainer multipliers, which is
 * the shape most people remember: a level 20 foe is worth a lot more than two
 * level 10 ones.
 */
export function expFromDefeating(foeSpeciesId, foeLevel) {
  return Math.max(1, Math.floor((species(foeSpeciesId).baseExp * foeLevel) / 7))
}

/** Prize money. Scales with level so late fights stay worth having. */
export function moneyFromDefeating(foeLevel, rng) {
  return foeLevel * 12 + randInt(rng, 0, foeLevel * 4)
}

/**
 * Learn order, with damaging moves ahead of status moves at the same level.
 *
 * The dataset sorts ties alphabetically, which would put Growl in Charmander's
 * first slot ahead of Scratch. Beyond being wrong about the games, it means the
 * first move a new Pokemon offers you does not attack.
 */
function byLearnOrder(a, b) {
  if (a.level !== b.level) return a.level - b.level
  const aIsStatus = move(a.move).damageClass === 'status'
  const bIsStatus = move(b.move).damageClass === 'status'
  if (aIsStatus !== bIsStatus) return aIsStatus ? 1 : -1
  return a.move.localeCompare(b.move)
}

/**
 * The moves a species knows if it reached `level` naturally: the last four it
 * would have learned.
 */
export function movesAtLevel(speciesId, level) {
  const learnable = species(speciesId)
    .learnset.filter((entry) => entry.level <= level)
    .sort(byLearnOrder)
    .map((entry) => entry.move)

  // Keep the most recent few, dropping duplicates from the far end so an early
  // move relearned later does not take two slots.
  return [...new Set(learnable.reverse())].slice(0, MOVE_LIMIT).reverse()
}

/** Moves newly available on reaching exactly this level. */
export function movesLearnedAt(speciesId, level) {
  return species(speciesId)
    .learnset.filter((entry) => entry.level === level)
    .map((entry) => entry.move)
}
