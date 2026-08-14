import { AILMENT_IMMUNE_TYPES, SHINY_ODDS } from './constants.mjs'
import { move as moveData, species } from './data.mjs'
import { expForLevel, levelFromExp } from './exp.mjs'
import { movesAtLevel } from './learnset.mjs'
import { rollNature } from './natures.mjs'
import { chance, makeRng, pick } from './rng.mjs'
import { rollIvs, statsAtLevel } from './stats.mjs'

export const makeMoveSlot = (name) => {
  const data = moveData(name)

  return { move: name, pp: data.pp, maxPp: data.pp }
}

export const rollShiny = (rng) => chance(rng, SHINY_ODDS)

export const rollAbility = (speciesId, rng, hiddenChance = 0.05) => {
  const slots = species(speciesId).abilities ?? []
  const hidden = slots.filter((slot) => slot.hidden)
  const normal = slots.filter((slot) => !slot.hidden)

  if (hidden.length > 0 && chance(rng, hiddenChance))
    return pick(rng, hidden).ability
  if (normal.length > 0) return pick(rng, normal).ability
  if (hidden.length > 0) return pick(rng, hidden).ability

  return null
}

export const legalAbilityAfterEvolution = (mon, targetSpecies) => {
  const targetSlots = species(targetSpecies).abilities ?? []

  if (targetSlots.length === 0) return null

  const alreadyLegal = targetSlots.find((slot) => slot.ability === mon.ability)

  if (alreadyLegal) return alreadyLegal.ability

  const sourceSlot = (species(mon.species).abilities ?? []).find(
    (slot) => slot.ability === mon.ability,
  )
  const matchingSlot = sourceSlot
    ? targetSlots.find((slot) => slot.slot === sourceSlot.slot)
    : null

  if (matchingSlot) return matchingSlot.ability

  return (targetSlots.find((slot) => !slot.hidden) ?? targetSlots[0]).ability
}

const identityRngFor = (speciesId, ivs) => {
  let seed = speciesId >>> 0

  for (const value of [
    ivs.hp,
    ivs.attack,
    ivs.defense,
    ivs.spAttack,
    ivs.spDefense,
    ivs.speed,
  ]) {
    seed = Math.imul(seed ^ value, 0x01000193) >>> 0
  }

  return makeRng(seed)
}

export const createPokemon = (speciesId, level, rng, shiny = false) => {
  const ivs = rollIvs(rng)
  const identityRng = identityRngFor(speciesId, ivs)
  const nature = rollNature(identityRng)
  const ability = rollAbility(speciesId, identityRng)
  const stats = statsAtLevel(speciesId, level, ivs, nature)

  return {
    species: speciesId,
    nickname: null,
    exp: expForLevel(speciesId, level),
    ivs,
    nature,
    ability,
    heldItem: null,
    stats,
    hp: stats.hp,
    moves: movesAtLevel(speciesId, level).map(makeMoveSlot),
    status: null,
    statusTurns: 0,
    shiny,
  }
}

export const speciesName = (id) => species(id).name.replace(/-[fm]$/, '')

export const displayName = (mon) => mon.nickname ?? speciesName(mon.species)

export const genderOf = (mon) => {
  const rate = species(mon.species).genderRate

  if (!Number.isInteger(rate) || rate < 0) return null
  if (!Number.isInteger(mon.ivs?.attack)) return null

  return mon.ivs.attack < rate * 4 ? 'female' : 'male'
}

export const speciesGender = (id) => {
  const rate = species(id).genderRate

  if (rate === 0) return 'male'
  if (rate === 8) return 'female'

  return null
}

export const levelOf = (mon) => levelFromExp(mon.species, mon.exp)

export const isFainted = (mon) => mon.hp <= 0

export const hpFraction = (mon, denominator) => {
  return Math.max(1, Math.floor(mon.stats.hp / denominator))
}

export const isImmuneToAilment = (mon, ailment) => {
  const immune = AILMENT_IMMUNE_TYPES[ailment]

  if (!immune) return false

  return species(mon.species).types.some((type) => immune.includes(type))
}

export const refreshStats = (mon) => {
  const previousMax = mon.stats.hp

  mon.stats = statsAtLevel(mon.species, levelOf(mon), mon.ivs, mon.nature)

  const gained = mon.stats.hp - previousMax

  if (gained > 0 && mon.hp > 0) mon.hp = Math.min(mon.stats.hp, mon.hp + gained)

  return mon
}

export const healFully = (mon) => {
  mon.hp = mon.stats.hp
  mon.status = null
  mon.statusTurns = 0

  for (const slot of mon.moves) slot.pp = slot.maxPp

  return mon
}

export const pendingEvolution = (mon, level = levelOf(mon)) => {
  for (const evolution of species(mon.species).evolutions) {
    if (evolution.trigger !== 'level-up') continue
    if (evolution.level !== null && level >= evolution.level)
      return evolution.to
  }

  return null
}

export const stoneEvolution = (mon, item) => {
  for (const evolution of species(mon.species).evolutions) {
    if (evolution.trigger === 'use-item' && evolution.item === item)
      return evolution.to
  }

  return null
}

export const canEvolveByStone = (mon) => {
  return species(mon.species).evolutions.some(
    (evolution) => evolution.trigger === 'use-item',
  )
}

export const levelUpEvolution = (mon) => {
  const evolution = species(mon.species).evolutions.find(
    (candidate) => candidate.trigger === 'level-up' && candidate.level != null,
  )

  return evolution ?? null
}

export const evolveInto = (mon, speciesId) => {
  const previousMax = mon.stats?.hp ?? 0
  const wasFainted = mon.hp <= 0
  const fraction = previousMax > 0 ? mon.hp / previousMax : 1
  const ability = legalAbilityAfterEvolution(mon, speciesId)

  mon.species = speciesId
  mon.ability = ability
  mon.stats = statsAtLevel(speciesId, levelOf(mon), mon.ivs, mon.nature)
  mon.hp = wasFainted
    ? 0
    : Math.max(1, Math.min(mon.stats.hp, Math.round(mon.stats.hp * fraction)))

  return mon
}
