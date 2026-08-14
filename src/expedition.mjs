import {
  BIOME_IDS,
  EXPEDITION_OPTIONAL_MAX_MS,
  EXPEDITION_OPTIONAL_MIN_MS,
  EXPEDITION_OPTIONAL_RATE,
  EXPEDITION_VERSION,
  EXPEDITION_VISIT_MAX_MS,
  EXPEDITION_VISIT_MIN_MS,
  EXPEDITION_VISIT_MODE_MS,
  STARTING_BIOME,
} from './constants.mjs'
import { mixSeed, seedUnit } from './rng.mjs'

const FORCED_TARGET_SALT = 0x15f36b29
const OPTIONAL_ROLL_SALT = 0x6c8e9cf5
const OPTIONAL_TARGET_SALT = 0x2a9d4f17
const OPTIONAL_PATH_A_SALT = 0x42be91d3
const OPTIONAL_PATH_B_SALT = 0xb9310f6d
const FORCED_PATH_A_SALT = 0x731ad24b
const FORCED_PATH_B_SALT = 0xc25f7a19
const AUTO_PATH_SALT = 0x5ed47c83
const NEXT_VISIT_SALT = 0x9e3779b9

export const BIOME_GRAPH = Object.freeze({
  meadow: Object.freeze(['forest', 'wetlands', 'city-powerworks']),
  forest: Object.freeze(['meadow', 'wetlands', 'highlands', 'mystic-ruins']),
  wetlands: Object.freeze(['meadow', 'forest', 'coast', 'mystic-ruins']),
  coast: Object.freeze(['wetlands', 'highlands', 'frostlands']),
  highlands: Object.freeze(['forest', 'coast', 'badlands', 'frostlands']),
  badlands: Object.freeze(['highlands', 'city-powerworks', 'mystic-ruins']),
  frostlands: Object.freeze(['coast', 'highlands', 'mystic-ruins']),
  'city-powerworks': Object.freeze(['meadow', 'badlands', 'mystic-ruins']),
  'mystic-ruins': Object.freeze([
    'forest',
    'wetlands',
    'badlands',
    'frostlands',
    'city-powerworks',
  ]),
})

const isBiome = (biome) => BIOME_IDS.includes(biome)
const nonNegative = (value) =>
  Number.isFinite(value) && value >= 0 ? value : 0
const validSeed = (seed) =>
  Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff
const asSeed = (seed, fallback = 0) =>
  validSeed(seed) ? seed >>> 0 : fallback >>> 0

export const validateBiomeGraph = (graph = BIOME_GRAPH) => {
  for (const biome of BIOME_IDS) {
    const neighbors = graph[biome]

    if (!Array.isArray(neighbors) || neighbors.length < 2) return false
    if (new Set(neighbors).size !== neighbors.length) return false

    for (const neighbor of neighbors) {
      if (!isBiome(neighbor) || neighbor === biome) return false
      if (!graph[neighbor]?.includes(biome)) return false
    }
  }

  const reached = new Set([STARTING_BIOME])
  const pending = [STARTING_BIOME]

  while (pending.length) {
    const biome = pending.shift()

    for (const neighbor of graph[biome]) {
      if (reached.has(neighbor)) continue
      reached.add(neighbor)
      pending.push(neighbor)
    }
  }

  return reached.size === BIOME_IDS.length
}

if (!validateBiomeGraph()) throw new Error('invalid biome travel graph')

const triangular = (unit, min, mode, max) => {
  const split = (mode - min) / (max - min)

  if (unit <= split) {
    return min + Math.sqrt(unit * (max - min) * (mode - min))
  }

  return max - Math.sqrt((1 - unit) * (max - min) * (max - mode))
}

export const forcedVisitTarget = (seed) => {
  const unit = seedUnit(asSeed(seed), FORCED_TARGET_SALT)
  const target = triangular(
    unit,
    EXPEDITION_VISIT_MIN_MS,
    EXPEDITION_VISIT_MODE_MS,
    EXPEDITION_VISIT_MAX_MS,
  )

  return Math.round(target)
}

const optionalRollFor = (seed) => seedUnit(asSeed(seed), OPTIONAL_ROLL_SALT)

const optionalTargetFor = (seed) => {
  const unit = seedUnit(asSeed(seed), OPTIONAL_TARGET_SALT)

  return Math.round(
    EXPEDITION_OPTIONAL_MIN_MS +
      unit * (EXPEDITION_OPTIONAL_MAX_MS - EXPEDITION_OPTIONAL_MIN_MS),
  )
}

export const optionalForkTarget = (seed) => {
  if (optionalRollFor(seed) >= EXPEDITION_OPTIONAL_RATE) return null

  return optionalTargetFor(seed)
}

const pathsFor = (seed, biome, firstSalt, secondSalt) => {
  const neighbors = BIOME_GRAPH[biome]
  const firstIndex = Math.floor(seedUnit(seed, firstSalt) * neighbors.length)
  const offset =
    1 + Math.floor(seedUnit(seed, secondSalt) * (neighbors.length - 1))
  const secondIndex = (firstIndex + offset) % neighbors.length

  return [neighbors[firstIndex], neighbors[secondIndex]]
}

const optionalPathsFor = (seed, biome) => {
  return pathsFor(seed, biome, OPTIONAL_PATH_A_SALT, OPTIONAL_PATH_B_SALT)
}

const forcedPathsFor = (seed, biome) => {
  return pathsFor(seed, biome, FORCED_PATH_A_SALT, FORCED_PATH_B_SALT)
}

const autoPathIndexFor = (seed) =>
  seedUnit(seed, AUTO_PATH_SALT) < 0.5 ? 0 : 1

const nextVisitSeed = (expedition, destination) => {
  const biomeIndex = BIOME_IDS.indexOf(destination) + 1
  const revision = (expedition.visitRevision + 1) >>> 0
  const salt =
    (NEXT_VISIT_SALT ^ Math.imul(biomeIndex, 0x85ebca6b) ^ revision) >>> 0

  return mixSeed(expedition.visitSeed, salt)
}

const createVisit = ({ seed, workedMs, startedWorkedMs, biome, revision }) => {
  const visitSeed = asSeed(seed)
  const observedWorkedMs = nonNegative(workedMs)
  const visitStartedWorkedMs = Math.min(
    observedWorkedMs,
    nonNegative(startedWorkedMs),
  )
  const optionalRoll = optionalRollFor(visitSeed)
  const optionalTargetMs =
    optionalRoll < EXPEDITION_OPTIONAL_RATE
      ? optionalTargetFor(visitSeed)
      : null

  return {
    version: EXPEDITION_VERSION,
    biome,
    visitSeed,
    visitRevision: revision,
    visitStartedWorkedMs,
    workedMs: observedWorkedMs,
    elapsedMs: observedWorkedMs - visitStartedWorkedMs,
    forcedTargetMs: forcedVisitTarget(visitSeed),
    optionalRoll,
    optionalTargetMs,
    optionalPaths: optionalPathsFor(visitSeed, biome),
    forcedPaths: forcedPathsFor(visitSeed, biome),
    autoPathIndex: autoPathIndexFor(visitSeed),
    optionalOffered: false,
    optionalDismissed: false,
    pendingDeparture: null,
  }
}

export const createExpedition = (
  seed,
  workedMs = 0,
  startingBiome = STARTING_BIOME,
) => {
  const biome = isBiome(startingBiome) ? startingBiome : STARTING_BIOME
  const observedWorkedMs = nonNegative(workedMs)

  return createVisit({
    seed,
    workedMs: observedWorkedMs,
    startedWorkedMs: observedWorkedMs,
    biome,
    revision: 0,
  })
}

const validTarget = (value, min, max) => {
  return Number.isFinite(value) && value >= min && value <= max
}

const validPaths = (paths, biome) => {
  if (!Array.isArray(paths) || paths.length !== 2) return false
  if (paths[0] === paths[1]) return false

  return paths.every((path) => BIOME_GRAPH[biome].includes(path))
}

export const normalizeExpedition = (
  expedition,
  workedMs = 0,
  fallbackSeed = 0,
) => {
  const externalWorkedMs = nonNegative(workedMs)

  if (!expedition || typeof expedition !== 'object') {
    return createExpedition(fallbackSeed, externalWorkedMs, STARTING_BIOME)
  }

  const biome = isBiome(expedition.biome) ? expedition.biome : STARTING_BIOME
  const visitSeed = asSeed(expedition.visitSeed, fallbackSeed)
  const storedWorkedMs = Number.isFinite(expedition.workedMs)
    ? nonNegative(expedition.workedMs)
    : externalWorkedMs
  const observedWorkedMs = Math.max(storedWorkedMs, externalWorkedMs)
  const revision =
    Number.isInteger(expedition.visitRevision) && expedition.visitRevision >= 0
      ? expedition.visitRevision
      : 0
  const startIsValid =
    Number.isFinite(expedition.visitStartedWorkedMs) &&
    expedition.visitStartedWorkedMs >= 0 &&
    expedition.visitStartedWorkedMs <= observedWorkedMs
  const visitStartedWorkedMs = startIsValid
    ? expedition.visitStartedWorkedMs
    : observedWorkedMs
  const elapsedMs = observedWorkedMs - visitStartedWorkedMs
  const deterministicForcedTarget = forcedVisitTarget(visitSeed)
  const forcedTargetMs = validTarget(
    expedition.forcedTargetMs,
    EXPEDITION_VISIT_MIN_MS,
    EXPEDITION_VISIT_MAX_MS,
  )
    ? expedition.forcedTargetMs
    : deterministicForcedTarget
  const deterministicRoll = optionalRollFor(visitSeed)
  const optionalRoll =
    Number.isFinite(expedition.optionalRoll) &&
    expedition.optionalRoll >= 0 &&
    expedition.optionalRoll < 1
      ? expedition.optionalRoll
      : deterministicRoll
  const optionalEligible = optionalRoll < EXPEDITION_OPTIONAL_RATE
  const optionalTargetMs = optionalEligible
    ? validTarget(
        expedition.optionalTargetMs,
        EXPEDITION_OPTIONAL_MIN_MS,
        EXPEDITION_OPTIONAL_MAX_MS,
      )
      ? expedition.optionalTargetMs
      : optionalTargetFor(visitSeed)
    : null
  const optionalPaths = validPaths(expedition.optionalPaths, biome)
    ? [...expedition.optionalPaths]
    : optionalPathsFor(visitSeed, biome)
  const forcedPaths = validPaths(expedition.forcedPaths, biome)
    ? [...expedition.forcedPaths]
    : forcedPathsFor(visitSeed, biome)
  const autoPathIndex =
    expedition.autoPathIndex === 0 || expedition.autoPathIndex === 1
      ? expedition.autoPathIndex
      : autoPathIndexFor(visitSeed)
  const optionalDismissed = expedition.optionalDismissed === true
  const canOfferOptional =
    optionalTargetMs != null &&
    elapsedMs >= optionalTargetMs &&
    elapsedMs < forcedTargetMs &&
    !optionalDismissed
  const optionalOffered =
    expedition.optionalOffered === true && canOfferOptional
  const forcedExpired = elapsedMs >= forcedTargetMs
  const forcedAtWorkedMs = visitStartedWorkedMs + forcedTargetMs

  return {
    version: EXPEDITION_VERSION,
    biome,
    visitSeed,
    visitRevision: revision,
    visitStartedWorkedMs,
    workedMs: observedWorkedMs,
    elapsedMs,
    forcedTargetMs,
    optionalRoll,
    optionalTargetMs,
    optionalPaths,
    forcedPaths,
    autoPathIndex,
    optionalOffered: forcedExpired ? false : optionalOffered,
    optionalDismissed,
    pendingDeparture: forcedExpired
      ? { paths: [...forcedPaths], atWorkedMs: forcedAtWorkedMs }
      : null,
  }
}

export const offerOptionalFork = (expedition) => {
  if (expedition.pendingDeparture) return null
  if (expedition.optionalDismissed || expedition.optionalTargetMs == null)
    return null
  if (expedition.elapsedMs < expedition.optionalTargetMs) return null

  expedition.optionalOffered = true

  return { stay: true, paths: [...expedition.optionalPaths] }
}

export const forceDeparture = (expedition) => {
  if (expedition.elapsedMs < expedition.forcedTargetMs) return null

  expedition.optionalOffered = false

  if (!expedition.pendingDeparture) {
    expedition.pendingDeparture = {
      paths: [...expedition.forcedPaths],
      atWorkedMs: expedition.visitStartedWorkedMs + expedition.forcedTargetMs,
    }
  }

  return { paths: [...expedition.pendingDeparture.paths] }
}

export const advanceExpedition = (expedition, workedMs) => {
  const incomingWorkedMs = nonNegative(workedMs)
  const previousWorkedMs = expedition.workedMs

  expedition.workedMs = Math.max(previousWorkedMs, incomingWorkedMs)
  expedition.elapsedMs = Math.max(
    0,
    expedition.workedMs - expedition.visitStartedWorkedMs,
  )

  const events = []

  if (expedition.elapsedMs >= expedition.forcedTargetMs) {
    const wasPending = expedition.pendingDeparture != null
    const departure = forceDeparture(expedition)

    if (!wasPending && departure) {
      events.push({ type: 'forced-departure', departure })
    }

    return events
  }

  if (
    expedition.optionalTargetMs != null &&
    expedition.elapsedMs >= expedition.optionalTargetMs &&
    !expedition.optionalDismissed &&
    !expedition.optionalOffered
  ) {
    const offer = offerOptionalFork(expedition)

    if (offer) events.push({ type: 'optional-fork', offer })
  }

  return events
}

const selectedPath = (paths, choice) => {
  if (choice === 0 || choice === 1) return paths[choice]
  if (typeof choice === 'string' && paths.includes(choice)) return choice

  return null
}

const replaceWithVisit = (expedition, destination, startedWorkedMs) => {
  const observedWorkedMs = expedition.workedMs
  const seed = nextVisitSeed(expedition, destination)
  const revision = expedition.visitRevision + 1
  const next = createVisit({
    seed,
    workedMs: observedWorkedMs,
    startedWorkedMs,
    biome: destination,
    revision,
  })

  Object.assign(expedition, next)
  advanceExpedition(expedition, observedWorkedMs)

  return expedition
}

export const chooseBiomePath = (expedition, choice) => {
  if (expedition.pendingDeparture) {
    const destination = selectedPath(expedition.pendingDeparture.paths, choice)

    if (!destination) return expedition

    return replaceWithVisit(
      expedition,
      destination,
      expedition.pendingDeparture.atWorkedMs,
    )
  }

  if (!expedition.optionalOffered) return expedition

  if (choice === 'stay') {
    expedition.optionalOffered = false
    expedition.optionalDismissed = true
    return expedition
  }

  const destination = selectedPath(expedition.optionalPaths, choice)

  if (!destination) return expedition

  return replaceWithVisit(expedition, destination, expedition.workedMs)
}

export const autoChooseDeparture = (expedition) => {
  let guard = 0

  while (expedition.pendingDeparture && guard < 10_000) {
    const choice = expedition.autoPathIndex

    chooseBiomePath(expedition, choice)
    guard++
  }

  if (expedition.pendingDeparture) {
    throw new Error('expedition could not settle a forced departure')
  }

  return expedition
}
