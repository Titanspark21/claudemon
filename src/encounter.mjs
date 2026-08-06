import {
  DEFAULT_CAPTURE_RATE,
  FALLBACK_SPECIES,
  LEGENDARY_LEVEL_GATE,
  STAGE_LEVEL_GATES,
  WILD_LEVEL_SPREAD,
} from './constants.mjs'
import { loadPokedex } from './data.mjs'
import { chance, randInt, weightedPick } from './rng.mjs'

export const speciesTableFromDex = (dex, leadLevel = 5) => {
  const table = []

  for (const mon of dex) {
    const stageGate = STAGE_LEVEL_GATES[mon.stage ?? 0]

    if (stageGate && leadLevel < stageGate) continue
    if (mon.legendary && leadLevel < LEGENDARY_LEVEL_GATE) continue

    table.push({
      id: mon.id,
      name: mon.name,
      weight: Math.max(
        1,
        Math.round(Math.sqrt(mon.captureRate ?? DEFAULT_CAPTURE_RATE) * 2),
      ),
    })
  }

  if (table.length === 0) return FALLBACK_SPECIES

  return table
}

export const loadSpeciesTable = (leadLevel = 5) => {
  try {
    return speciesTableFromDex(loadPokedex(), leadLevel)
  } catch {
    return FALLBACK_SPECIES
  }
}

const pickLevel = (rng, leadLevel) => {
  if (!leadLevel)
    return randInt(rng, WILD_LEVEL_SPREAD.min, WILD_LEVEL_SPREAD.fallbackMax)

  const min = Math.max(
    WILD_LEVEL_SPREAD.min,
    leadLevel - WILD_LEVEL_SPREAD.below,
  )
  const max = Math.min(
    WILD_LEVEL_SPREAD.ceiling,
    Math.max(min, leadLevel + WILD_LEVEL_SPREAD.above),
  )

  return randInt(rng, min, max)
}

export const stepsFromPrompt = (promptLength, config) => {
  return Math.min(
    config.maxSteps,
    Math.max(1, Math.ceil(promptLength / config.charsPerStep)),
  )
}

export const stepsWhileWorking = (elapsedMs, config) => {
  const stepMs = (config.workStepSeconds ?? 0) * 1000

  if (stepMs <= 0 || !(elapsedMs > 0)) return { steps: 0, taken: 0 }

  const walked = Math.floor(elapsedMs / stepMs)
  const steps = Math.min(config.maxSteps, walked)

  return { steps, taken: walked > steps ? elapsedMs : steps * stepMs }
}

export const rollEncounters = ({ steps, leadLevel, rng, config, species }) => {
  const encounters = []

  for (let step = 0; step < steps; step++) {
    if (!chance(rng, config.encounterChance)) continue

    const chosen = weightedPick(rng, species, (entry) => entry.weight)

    encounters.push({
      v: 1,
      species: chosen.id,
      name: chosen.name,
      level: pickLevel(rng, leadLevel),
      seed: randInt(rng, 0, 0xffffffff),
    })
  }

  return encounters
}
