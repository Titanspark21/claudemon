import { loadPokedex } from './data.mjs'
import { chance, randInt, weightedPick } from './rng.mjs'

const FALLBACK_SPECIES = [
  { id: 16, name: 'Pidgey', weight: 20 },
  { id: 19, name: 'Rattata', weight: 20 },
  { id: 10, name: 'Caterpie', weight: 14 },
  { id: 13, name: 'Weedle', weight: 14 },
  { id: 21, name: 'Spearow', weight: 12 },
  { id: 41, name: 'Zubat', weight: 12 },
  { id: 74, name: 'Geodude', weight: 10 },
  { id: 129, name: 'Magikarp', weight: 10 },
  { id: 43, name: 'Oddish', weight: 8 },
  { id: 69, name: 'Bellsprout', weight: 8 },
  { id: 46, name: 'Paras', weight: 7 },
  { id: 48, name: 'Venonat', weight: 7 },
  { id: 52, name: 'Meowth', weight: 6 },
  { id: 54, name: 'Psyduck', weight: 6 },
  { id: 60, name: 'Poliwag', weight: 6 },
  { id: 27, name: 'Sandshrew', weight: 5 },
  { id: 25, name: 'Pikachu', weight: 3 },
  { id: 133, name: 'Eevee', weight: 2 },
  { id: 143, name: 'Snorlax', weight: 1 },
]

export function speciesTableFromDex(dex, leadLevel = 5) {
  const table = []
  for (const mon of dex) {
    const stage = mon.stage ?? 0
    if (stage === 1 && leadLevel < 16) continue
    if (stage === 2 && leadLevel < 32) continue
    if (mon.legendary && leadLevel < 40) continue

    table.push({
      id: mon.id,
      name: mon.name,
      weight: Math.max(1, Math.round(Math.sqrt(mon.captureRate ?? 45) * 2)),
    })
  }
  return table.length > 0 ? table : FALLBACK_SPECIES
}

export function loadSpeciesTable(leadLevel = 5) {
  try {
    return speciesTableFromDex(loadPokedex(), leadLevel)
  } catch {
    return FALLBACK_SPECIES
  }
}

function pickLevel(rng, leadLevel) {
  if (!leadLevel) return randInt(rng, 2, 5)
  const min = Math.max(2, leadLevel - 3)
  const max = Math.min(100, Math.max(min, leadLevel + 2))
  return randInt(rng, min, max)
}

export function stepsFromPrompt(promptLength, config) {
  return Math.min(
    config.maxSteps,
    Math.max(1, Math.ceil(promptLength / config.charsPerStep)),
  )
}

export function stepsWhileWorking(elapsedMs, config) {
  const stepMs = (config.workStepSeconds ?? 0) * 1000
  if (stepMs <= 0 || !(elapsedMs > 0)) return { steps: 0, taken: 0 }

  const walked = Math.floor(elapsedMs / stepMs)
  const steps = Math.min(config.maxSteps, walked)
  return { steps, taken: walked > steps ? elapsedMs : steps * stepMs }
}

export function rollEncounters({ steps, leadLevel, rng, config, species }) {
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
