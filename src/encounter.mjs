import {
  DEFAULT_CAPTURE_RATE,
  ENCOUNTER_VERSION,
  FALLBACK_SPECIES,
  LEGENDARY_LEVEL_GATE,
  STAGE_LEVEL_GATES,
  WILD_LEVEL_SPREAD,
} from './constants.mjs'
import { loadValidatedData } from './data.mjs'
import { pickLevel } from './helpers.mjs'
import { rollShiny } from './pokemon.mjs'
import { chance, randInt, weightedPick } from './rng.mjs'
import { rollTrainer } from './trainer.mjs'

const DEFAULT_LEAD_LEVEL = 5
const STAGE_WEIGHT = { 0: 1, 1: 0.7, 2: 0.45 }
const SPECIAL_WEIGHT = 0.15
const AFFINITY_LOG_DIVISOR = 5
const MAX_AFFINITY_MULTIPLIER = 4

const legalEncounterRecord = (record) => {
  if (record.collectible === false) return false
  if (record.battleOnly === true) return false

  return true
}

const stageIsOpen = (record, leadLevel) => {
  const gate = STAGE_LEVEL_GATES[record.stage ?? 0]

  return !gate || leadLevel >= gate
}

const specialIsOpen = (record, leadLevel) => {
  if (!record.legendary && !record.mythical) return true

  return leadLevel >= LEGENDARY_LEVEL_GATE
}

const affinityMultiplier = (assignment) => {
  if (!assignment) return 1

  const affinity = Number(assignment.affinity)

  if (!Number.isFinite(affinity) || affinity <= 0) return 1

  const scaled = 1 + Math.log10(affinity) / AFFINITY_LOG_DIVISOR

  return Math.min(MAX_AFFINITY_MULTIPLIER, scaled)
}

const stageMultiplier = (record) => STAGE_WEIGHT[record.stage ?? 0] ?? 0.35

const captureWeight = (record) => {
  const captureRate = record.captureRate ?? DEFAULT_CAPTURE_RATE

  return Math.sqrt(Math.max(1, captureRate)) * 2
}

export const encounterWeight = (record, assignment, context = {}) => {
  const leadLevel = Number.isFinite(context.leadLevel)
    ? context.leadLevel
    : DEFAULT_LEAD_LEVEL

  if (!legalEncounterRecord(record)) return 0
  if (!stageIsOpen(record, leadLevel)) return 0
  if (!specialIsOpen(record, leadLevel)) return 0

  if (context.legacyWeights === true) {
    return Math.max(1, Math.round(captureWeight(record)))
  }

  const specialWeight = record.legendary || record.mythical ? SPECIAL_WEIGHT : 1
  const combined =
    captureWeight(record) *
    stageMultiplier(record) *
    specialWeight *
    affinityMultiplier(assignment)

  return Math.max(1, Math.round(combined))
}

const tableEntry = (record, assignment, context) => ({
  id: record.id,
  name: record.name,
  weight: encounterWeight(record, assignment, context),
})

const globalSpeciesTable = (dex, context) => {
  const table = []

  for (const record of dex) {
    const entry = tableEntry(record, null, context)

    if (entry.weight > 0) table.push(entry)
  }

  return table
}

const biomePool = (biomeData, biome) => {
  if (!biome || !Array.isArray(biomeData?.biomes)) return null

  const pool = biomeData.biomes.find((entry) => entry.id === biome)

  if (!pool) return null
  if (!Array.isArray(pool.ordinary) || !Array.isArray(pool.special)) return null

  return [...pool.ordinary, ...pool.special]
}

const biomeSpeciesTable = (dex, pool, context) => {
  const byId = new Map(dex.map((record) => [record.id, record]))
  const table = []
  const seen = new Set()

  for (const assignment of pool) {
    if (!assignment || seen.has(assignment.id)) continue

    const record = byId.get(assignment.id)

    if (!record) continue

    const entry = tableEntry(record, assignment, context)

    if (entry.weight <= 0) continue

    seen.add(assignment.id)
    table.push(entry)
  }

  return table
}

const encounterContext = (options) => {
  if (typeof options === 'number') {
    return { leadLevel: options, biome: null, legacyWeights: true }
  }

  const leadLevel = Number.isFinite(options?.leadLevel)
    ? options.leadLevel
    : DEFAULT_LEAD_LEVEL
  const biome = typeof options?.biome === 'string' ? options.biome : null

  return { leadLevel, biome, legacyWeights: false }
}

export const speciesTableFromDex = (
  dex,
  options = DEFAULT_LEAD_LEVEL,
  biomeData,
) => {
  const context = encounterContext(options)
  const global = globalSpeciesTable(dex, context)
  const pool = biomePool(biomeData, context.biome)

  if (!pool) return global.length > 0 ? global : FALLBACK_SPECIES

  const local = biomeSpeciesTable(dex, pool, context)

  if (local.length > 0) return local

  return global.length > 0 ? global : FALLBACK_SPECIES
}

export const loadSpeciesTable = (
  leadLevel = DEFAULT_LEAD_LEVEL,
  biome = null,
) => {
  const data = loadValidatedData()

  return speciesTableFromDex(data.pokedex, { leadLevel, biome }, data.biomes)
}

export const encounterSpecies = (encounter) => {
  if (encounter.kind === 'trainer') return encounter.trainer.team[0].species

  return encounter.species
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

const rollWild = (rng, leadLevel, species) => {
  const chosen = weightedPick(rng, species, (entry) => entry.weight)

  return {
    v: ENCOUNTER_VERSION,
    kind: 'wild',
    species: chosen.id,
    name: chosen.name,
    level: pickLevel(rng, leadLevel, WILD_LEVEL_SPREAD),
    seed: randInt(rng, 0, 0xffffffff),
    shiny: rollShiny(rng),
  }
}

const rollTrainerEncounter = (rng, leadLevel, species) => {
  return {
    v: ENCOUNTER_VERSION,
    kind: 'trainer',
    trainer: rollTrainer({ rng, leadLevel, species }),
    seed: randInt(rng, 0, 0xffffffff),
  }
}

export const rollEncounters = ({ steps, leadLevel, rng, config, species }) => {
  const encounters = []

  for (let step = 0; step < steps; step++) {
    if (!chance(rng, config.encounterChance)) continue

    if (chance(rng, config.trainerChance)) {
      encounters.push(rollTrainerEncounter(rng, leadLevel, species))
      continue
    }

    encounters.push(rollWild(rng, leadLevel, species))
  }

  return encounters
}
