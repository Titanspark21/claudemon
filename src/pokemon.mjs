// Creating and levelling individual Pokemon.
//
// A Pokemon in the save is plain data: everything derived (stats, level) is
// recomputed from species, experience and IVs, so a dataset fix rolls through to
// existing saves instead of leaving them stale.

import { move as moveData, species } from './data.mjs'
import { expForLevel, levelFromExp, movesAtLevel, rollIvs, statsAtLevel } from './exp.mjs'

export function makeMoveSlot(name) {
  const data = moveData(name)
  return { move: name, pp: data.pp, maxPp: data.pp }
}

/** A fresh Pokemon at a given level, with the moveset it would naturally have. */
export function createPokemon(speciesId, level, rng, { nickname = null } = {}) {
  const ivs = rollIvs(rng)
  const stats = statsAtLevel(speciesId, level, ivs)

  return {
    species: speciesId,
    nickname,
    exp: expForLevel(speciesId, level),
    ivs,
    stats,
    hp: stats.hp,
    moves: movesAtLevel(speciesId, level).map(makeMoveSlot),
    status: null,
    statusTurns: 0,
  }
}

export function displayName(mon) {
  return mon.nickname ?? species(mon.species).name
}

export function levelOf(mon) {
  return levelFromExp(mon.species, mon.exp)
}

export function isFainted(mon) {
  return mon.hp <= 0
}

/**
 * Recomputes stats after a level change, carrying the HP gain over to current HP.
 *
 * Gaining a level in the real games tops you up by exactly the maximum HP you
 * gained, rather than healing you.
 */
export function refreshStats(mon) {
  const previousMax = mon.stats.hp
  mon.stats = statsAtLevel(mon.species, levelOf(mon), mon.ivs)
  const gained = mon.stats.hp - previousMax
  if (gained > 0 && mon.hp > 0) mon.hp = Math.min(mon.stats.hp, mon.hp + gained)
  return mon
}

export function healFully(mon) {
  mon.hp = mon.stats.hp
  mon.status = null
  mon.statusTurns = 0
  for (const slot of mon.moves) slot.pp = slot.maxPp
  return mon
}

/**
 * Which species this one becomes at its current level, or null.
 *
 * Only level-up evolutions happen on their own; stones are used from the bag.
 */
export function pendingEvolution(mon) {
  const level = levelOf(mon)
  for (const evolution of species(mon.species).evolutions) {
    if (evolution.trigger !== 'level-up') continue
    if (evolution.level !== null && level >= evolution.level) return evolution.to
  }
  return null
}

/** The species a stone would turn this into, or null if that stone does nothing. */
export function stoneEvolution(mon, item) {
  for (const evolution of species(mon.species).evolutions) {
    if (evolution.trigger === 'use-item' && evolution.item === item) return evolution.to
  }
  return null
}

/**
 * Evolves in place, keeping level, experience, IVs and HP proportion.
 *
 * An evolution that arrives at 1 HP should not become a full heal.
 */
export function evolveInto(mon, speciesId) {
  const fraction = mon.stats.hp > 0 ? mon.hp / mon.stats.hp : 1
  mon.species = speciesId
  mon.stats = statsAtLevel(speciesId, levelOf(mon), mon.ivs)
  mon.hp = Math.max(1, Math.round(mon.stats.hp * fraction))
  return mon
}
