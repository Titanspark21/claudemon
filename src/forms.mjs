import { battleSpecies, battleStats } from './battleActor.mjs'
import {
  baseSpeciesIdentity,
  sourceSpeciesIdentity,
  species,
  speciesIdentity,
} from './data.mjs'
import { levelOf } from './pokemon.mjs'
import { statsAtLevel } from './stats.mjs'

export const normalizeFormName = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

export const isPersistentSpecies = (speciesId) =>
  speciesIdentity(speciesId).battleOnly !== true

export const assertPersistentSpecies = (speciesId) => {
  if (!isPersistentSpecies(speciesId))
    throw new Error(`battle-only species cannot be persisted: ${speciesId}`)

  return speciesId
}

export const familyRoot = (speciesId) => {
  let current = speciesId
  const visited = new Set()

  for (;;) {
    if (visited.has(current))
      throw new Error(`cyclic evolution family at ${current}`)
    visited.add(current)

    const parent = species(current).evolvesFrom
    if (parent == null) return current
    current = parent
  }
}

export const baseFamilyRoot = (speciesId) => {
  return familyRoot(baseSpeciesIdentity(speciesId).id)
}

export const regionalEggRoot = (mon) => {
  const identity = speciesIdentity(mon.species)

  if (identity.formKey && mon.heldItem === 'everstone') {
    const regionalRoot = familyRoot(mon.species)
    const rootIdentity = speciesIdentity(regionalRoot)

    if (rootIdentity.formKey === identity.formKey && rootIdentity.collectible)
      return regionalRoot
  }

  return baseFamilyRoot(mon.species)
}

export const speciesIdFromFormName = (name) => {
  return sourceSpeciesIdentity(normalizeFormName(name)).id
}

const primaryAbility = (speciesId) => {
  const slots = species(speciesId).abilities ?? []
  return (slots.find((slot) => !slot.hidden) ?? slots[0])?.ability ?? null
}

export const changeBattleForm = (battle, side, targetId, cause = 'form') => {
  const actor = battle?.[side]
  if (!actor?.mon) return []

  const identity = speciesIdentity(targetId)
  if (!identity.battleOnly)
    throw new Error(`battle form must use a battle-only species: ${targetId}`)

  const previousStats = battleStats(actor)
  const wasFainted = actor.mon.hp <= 0
  const fraction = previousStats?.hp > 0 ? actor.mon.hp / previousStats.hp : 1
  const target = species(targetId)
  const stats = statsAtLevel(
    targetId,
    levelOf(actor.mon),
    actor.mon.ivs,
    actor.mon.nature,
  )
  const from = battleSpecies(actor)

  delete actor.mon.battleTypes
  actor.battleForm = {
    mon: actor.mon,
    species: targetId,
    stats,
    types: [...target.types],
    ability: primaryAbility(targetId),
    cause,
  }
  actor.mon.hp = wasFainted
    ? 0
    : Math.max(1, Math.min(stats.hp, Math.round(stats.hp * fraction)))

  return [{ type: 'form-change', side, from, to: targetId, cause }]
}

export const revertBattleForm = (battle, side) => {
  const actor = battle?.[side]
  if (!actor?.battleForm) return []

  const previous = actor.battleForm
  const mon = previous.mon ?? actor.mon
  if (!mon) return []

  const wasFainted = mon.hp <= 0
  const fraction = previous.stats?.hp > 0 ? mon.hp / previous.stats.hp : 1
  const permanentStats = mon.stats

  delete actor.battleForm
  delete mon.battleTypes
  mon.hp = wasFainted
    ? 0
    : Math.max(
        1,
        Math.min(permanentStats.hp, Math.round(permanentStats.hp * fraction)),
      )

  return [
    {
      type: 'form-revert',
      side,
      from: previous.species,
      to: mon.species,
      cause: previous.cause,
    },
  ]
}
