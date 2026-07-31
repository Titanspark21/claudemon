// Deciding what appears in the grass, and at what level.

import { loadPokedex } from './data.mjs'
import { chance, randInt, weightedPick } from './rng.mjs'

/**
 * Used until tools/fetch-data.mjs has generated the real dataset. These are the
 * species you actually meet on the early routes, so the game feels right even
 * before the full Pokedex exists.
 */
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

/**
 * Builds the encounter table from the generated Pokedex.
 *
 * Rarity comes from the real capture_rate, which conveniently tracks how common
 * a species is meant to be. Evolved forms are held back until your team is high
 * enough that meeting one is not absurd.
 */
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
      // capture_rate spans 3..255; the square root keeps common species common
      // without making rare ones effectively unreachable.
      weight: Math.max(1, Math.round(Math.sqrt(mon.captureRate ?? 45) * 2)),
    })
  }
  return table.length > 0 ? table : FALLBACK_SPECIES
}

export function loadSpeciesTable(leadLevel = 5) {
  try {
    return speciesTableFromDex(loadPokedex(), leadLevel)
  } catch {
    // The dataset has not been built yet.
    return FALLBACK_SPECIES
  }
}

/** Wild levels track your lead Pokemon, so encounters stay worth fighting. */
function pickLevel(rng, leadLevel) {
  if (!leadLevel) return randInt(rng, 2, 5)
  const min = Math.max(2, leadLevel - 3)
  const max = Math.min(100, Math.max(min, leadLevel + 2))
  return randInt(rng, min, max)
}

/**
 * How far a prompt walks you. Every prompt is at least one step, so even a "yes"
 * has a chance of turning something up.
 */
export function stepsFromPrompt(promptLength, config) {
  return Math.min(config.maxSteps, Math.max(1, Math.ceil(promptLength / config.charsPerStep)))
}

/**
 * How far Claude working walks you.
 *
 * Waiting is the other half of the loop: a turn that thinks for three minutes is
 * three minutes you are stood in the grass, and the tab should not be dead for
 * all of it. Time is the step here rather than the tool call, so a burst of
 * thirty instant greps does not spawn a swarm while a single slow build still
 * counts for something.
 *
 * `taken` is how much of `elapsedMs` was actually spent, which the caller adds to
 * its own clock: rounding it up to now would throw away the remainder every time
 * and a steady stream of quick tool calls would never walk anywhere.
 */
export function stepsWhileWorking(elapsedMs, config) {
  const stepMs = (config.workStepSeconds ?? 0) * 1000
  if (stepMs <= 0 || !(elapsedMs > 0)) return { steps: 0, taken: 0 }

  const walked = Math.floor(elapsedMs / stepMs)
  const steps = Math.min(config.maxSteps, walked)
  // Anything beyond the cap is time we are deliberately not paying out, so it is
  // dropped rather than banked for the next call.
  return { steps, taken: walked > steps ? elapsedMs : steps * stepMs }
}

/**
 * Rolls the encounters a number of steps produce.
 *
 * Each step gets its own independent roll, so walking further can genuinely turn
 * up more than one.
 */
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
      // Seeding the battle here means the fight plays out the same way whenever
      // you get round to it.
      seed: randInt(rng, 0, 0xffffffff),
    })
  }
  return encounters
}
