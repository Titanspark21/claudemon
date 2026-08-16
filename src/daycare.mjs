import {
  DAYCARE_EXP_PER_STEP,
  DAYCARE_LIMIT,
  DAYCARE_MESSAGES,
  DITTO_ID,
  EGG_LEVEL,
  EGG_SHINY_ODDS,
  EGG_STEPS,
  INCENSE_BABY_ITEMS,
  MAX_LEVEL,
} from './constants.mjs'
import { species } from './data.mjs'
import { isPersistentSpecies, regionalEggRoot } from './forms.mjs'
import { canSpare, pokemonList } from './helpers.mjs'
import { queueMissedDaycareMoves } from './moveRecovery.mjs'
import {
  createPokemon,
  evolutionItemMatches,
  genderOf,
  levelOf,
  refreshStats,
} from './pokemon.mjs'
import { chance } from './rng.mjs'
import { stow } from './state.mjs'

const isDitto = (mon) => mon.species === DITTO_ID

const canBreedAtAll = (mon) => {
  return (
    isPersistentSpecies(mon.species) &&
    !species(mon.species).eggGroups.includes('no-eggs')
  )
}

const sharesEggGroup = (left, right) => {
  const otherGroups = new Set(species(right.species).eggGroups)

  return species(left.species).eggGroups.some((group) => otherGroups.has(group))
}

const areOppositeGenders = (left, right) => {
  const one = genderOf(left)
  const other = genderOf(right)

  if (one === null || other === null) return false

  return one !== other
}

export const areCompatible = (left, right) => {
  if (!canBreedAtAll(left) || !canBreedAtAll(right)) return false
  if (isDitto(left) && isDitto(right)) return false
  if (isDitto(left) || isDitto(right)) return true

  return sharesEggGroup(left, right) && areOppositeGenders(left, right)
}

export const pairIsCompatible = (save) => {
  if (save.daycare.slots.length < DAYCARE_LIMIT) return false

  const [left, right] = save.daycare.slots

  return areCompatible(left, right)
}

const motherOf = (left, right) => {
  if (isDitto(left)) return right
  if (isDitto(right)) return left
  if (genderOf(left) === 'female') return left

  return right
}

const eggSpeciesForParent = (parent) => {
  const root = regionalEggRoot(parent)
  const incense = INCENSE_BABY_ITEMS[root]

  if (!incense || evolutionItemMatches(parent.heldItem, incense)) return root

  return species(root).evolutions[0].to
}

export const eggSpeciesForPair = (left, right) => {
  return eggSpeciesForParent(motherOf(left, right))
}

export const eggFromPair = (save, rng) => {
  if (save.daycare.egg) return null
  if (!pairIsCompatible(save)) return null

  const [left, right] = save.daycare.slots

  save.daycare.egg = {
    species: eggSpeciesForPair(left, right),
    steps: 0,
    shiny: chance(rng, EGG_SHINY_ODDS),
  }

  return save.daycare.egg
}

const raiseOne = (mon) => {
  const before = levelOf(mon)

  mon.exp += DAYCARE_EXP_PER_STEP

  const after = levelOf(mon)

  if (after !== before) {
    queueMissedDaycareMoves(mon, before, after)
    refreshStats(mon)
  }
}

export const raiseDaycare = (save) => {
  for (const mon of save.daycare.slots) {
    if (levelOf(mon) >= MAX_LEVEL) continue

    raiseOne(mon)
  }

  return save
}

export const walkEgg = (egg) => {
  egg.steps = Math.min(EGG_STEPS, egg.steps + 1)

  return egg
}

export const eggIsReady = (egg) => egg.steps >= EGG_STEPS

export const eggProgress = (egg) => egg.steps / EGG_STEPS

export const hatchEgg = (egg, rng) => {
  return createPokemon(egg.species, EGG_LEVEL, rng, egg.shiny)
}

export const daycareCandidates = (save) => {
  return [
    ...save.party.map((mon, index) => ({ mon, source: 'party', index })),
    ...save.box.map((mon, index) => ({ mon, source: 'box', index })),
  ]
}

export const leaveAtDaycare = (save, source, index) => {
  if (save.daycare.slots.length >= DAYCARE_LIMIT) {
    return { ok: false, reason: DAYCARE_MESSAGES.bothTaken }
  }

  if (!canSpare(save, source)) {
    return { ok: false, reason: DAYCARE_MESSAGES.lastOne }
  }

  const candidates = pokemonList(save, source)
  const mon = candidates[index]

  if (!isPersistentSpecies(mon.species)) {
    return { ok: false, reason: DAYCARE_MESSAGES.battleOnly }
  }

  candidates.splice(index, 1)
  save.daycare.slots.push(mon)

  return { ok: true, mon }
}

export const takeBackFromDaycare = (save, slot) => {
  const [mon] = save.daycare.slots.splice(slot, 1)

  return { mon, where: stow(save, mon) }
}
