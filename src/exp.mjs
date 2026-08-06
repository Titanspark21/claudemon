import { loadData, move, species } from './data.mjs'
import { randInt } from './rng.mjs'

export const MAX_LEVEL = 100

export const MOVE_LIMIT = 4

export const STAT_NAMES = [
  'hp',
  'attack',
  'defense',
  'spAttack',
  'spDefense',
  'speed',
]

export function rollIvs(rng) {
  const ivs = {}
  for (const stat of STAT_NAMES) ivs[stat] = randInt(rng, 0, 31)
  return ivs
}

export function statsAtLevel(speciesId, level, ivs) {
  const base = species(speciesId).stats
  const stats = {}

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

export function levelFromExp(speciesId, exp) {
  const curve = loadData().growth[species(speciesId).growthRate]
  let level = 1
  while (level < MAX_LEVEL && exp >= curve[level + 1]) level++
  return level
}

export function expProgress(speciesId, exp) {
  const level = levelFromExp(speciesId, exp)
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, fraction: 1 }

  const start = expForLevel(speciesId, level)
  const next = expForLevel(speciesId, level + 1)
  const into = exp - start
  const needed = next - start
  return { level, into, needed, fraction: needed > 0 ? into / needed : 1 }
}

export function expFromDefeating(foeSpeciesId, foeLevel) {
  return Math.max(1, Math.floor((species(foeSpeciesId).baseExp * foeLevel) / 7))
}

export function moneyFromDefeating(foeLevel, rng) {
  return foeLevel * 12 + randInt(rng, 0, foeLevel * 4)
}

function byLearnOrder(a, b) {
  if (a.level !== b.level) return a.level - b.level
  const aIsStatus = move(a.move).damageClass === 'status'
  const bIsStatus = move(b.move).damageClass === 'status'
  if (aIsStatus !== bIsStatus) return aIsStatus ? 1 : -1
  return a.move.localeCompare(b.move)
}

export function movesAtLevel(speciesId, level) {
  const learnable = species(speciesId)
    .learnset.filter((entry) => entry.level <= level)
    .sort(byLearnOrder)
    .map((entry) => entry.move)

  return [...new Set(learnable.reverse())].slice(0, MOVE_LIMIT).reverse()
}

export function movesLearnedAt(speciesId, level) {
  return species(speciesId)
    .learnset.filter((entry) => entry.level === level)
    .map((entry) => entry.move)
}
