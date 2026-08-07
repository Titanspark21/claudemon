import {
  EXP_DIVISOR,
  MAX_LEVEL,
  MONEY_JITTER_PER_LEVEL,
  MONEY_PER_LEVEL,
  TRAINER_EXP_BONUS,
} from './constants.mjs'
import { loadData, species } from './data.mjs'
import { randInt } from './rng.mjs'

export const expForLevel = (speciesId, level) => {
  const curve = loadData().growth[species(speciesId).growthRate]

  return curve[Math.min(Math.max(level, 1), MAX_LEVEL)]
}

export const levelFromExp = (speciesId, exp) => {
  const curve = loadData().growth[species(speciesId).growthRate]
  let level = 1

  while (level < MAX_LEVEL && exp >= curve[level + 1]) level++

  return level
}

export const expProgress = (speciesId, exp) => {
  const level = levelFromExp(speciesId, exp)

  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, fraction: 1 }

  const start = expForLevel(speciesId, level)
  const next = expForLevel(speciesId, level + 1)
  const into = exp - start
  const needed = next - start

  return { level, into, needed, fraction: needed > 0 ? into / needed : 1 }
}

export const expFromDefeating = (foeSpeciesId, foeLevel) => {
  return Math.max(
    1,
    Math.floor((species(foeSpeciesId).baseExp * foeLevel) / EXP_DIVISOR),
  )
}

export const expFromTrainerMon = (foeSpeciesId, foeLevel) => {
  return Math.floor(
    expFromDefeating(foeSpeciesId, foeLevel) * TRAINER_EXP_BONUS,
  )
}

export const moneyFromDefeating = (foeLevel, rng) => {
  return (
    foeLevel * MONEY_PER_LEVEL +
    randInt(rng, 0, foeLevel * MONEY_JITTER_PER_LEVEL)
  )
}
