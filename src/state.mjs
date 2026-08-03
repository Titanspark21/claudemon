// The save file.
//
// Written only by the companion process, and always atomically: a crash mid-write
// must never cost someone their team. Everything derived (levels, stats) is
// recomputed on load, so a dataset fix reaches existing saves.

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { BALLS } from './capture.mjs'
import { HOME, SAVE_FILE } from './paths.mjs'
import { createPokemon, displayName, healFully, isFainted, levelOf, refreshStats } from './pokemon.mjs'
import { writeStatus } from './status.mjs'
import { countOf } from './shop.mjs'

export const SAVE_VERSION = 1
export const PARTY_LIMIT = 6
export const STARTERS = [1, 4, 7]

export function createSave({ trainer, starterId, rng }) {
  const starter = createPokemon(starterId, 5, rng)

  return {
    version: SAVE_VERSION,
    trainer: { name: trainer, startedAt: new Date().toISOString() },
    party: [starter],
    box: [],
    bag: { 'poke-ball': 5, potion: 3 },
    money: 3000,
    // The starter is caught without ever having been faced, so its tally starts empty
    // like everything else's.
    dex: { seen: [starterId], caught: [starterId], faced: {} },
    stats: { battles: 0, wins: 0, losses: 0, caught: 1, runs: 0 },
  }
}

export function loadSave() {
  try {
    const save = JSON.parse(readFileSync(SAVE_FILE, 'utf8'))
    return migrate(save)
  } catch {
    return null
  }
}

/**
 * Brings an older save up to date.
 *
 * Only ever adds what is missing. A save is someone's hours of play; losing one
 * to a schema change would be unforgivable, so nothing here removes anything.
 */
function migrate(save) {
  save.version ??= SAVE_VERSION
  save.party ??= []
  save.box ??= []
  save.bag ??= {}
  save.money ??= 0
  save.dex ??= { seen: [], caught: [] }
  save.dex.seen ??= []
  save.dex.caught ??= []
  // A save from before the tally existed starts counting from here. How many of each
  // it had already faced was never written down, and a number invented now would read
  // on screen as if it had been.
  save.dex.faced ??= {}
  save.stats ??= { battles: 0, wins: 0, losses: 0, caught: 0, runs: 0 }

  // Anything you are holding is caught, whatever route it took to get there. Saves
  // from before evolution filled in its own entry are missing every species that was
  // raised into rather than thrown a ball at, and the standing invariant repairs them
  // without having to know which ones.
  for (const mon of [...save.party, ...save.box]) markCaught(save, mon.species)

  // Stats come from species data, so a dataset correction reaches old saves.
  for (const mon of [...save.party, ...save.box]) refreshStats(mon)

  save.version = SAVE_VERSION
  return save
}

export function saveGame(save) {
  mkdirSync(HOME, { recursive: true })
  const tmp = `${SAVE_FILE}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(save))
    renameSync(tmp, SAVE_FILE)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {
      // The temp file is already gone, which is the state we wanted.
    }
    throw error
  }
  // The save is already on disk by this point. The status file is cosmetic, so a
  // problem building it must never turn a successful save into a thrown error.
  try {
    publishStatus(save)
  } catch {
    // Nothing to do: the next save will refresh it.
  }
  return save
}

/** The first party member still standing, or null if the whole team is out. */
export function activePokemon(save) {
  return save.party.find((mon) => !isFainted(mon)) ?? null
}

export function partyIsWipedOut(save) {
  return save.party.length > 0 && save.party.every(isFainted)
}

export function healParty(save) {
  for (const mon of save.party) healFully(mon)
  return save
}

/**
 * Whether healing would change anything: hurt, ailing, or out of PP.
 *
 * PP counts because a full heal restores it, and a team standing at full health with
 * nothing left to throw is one that still needs the rest. Used to decide whether the
 * home screen owes anyone an explanation, so it has to agree with `healParty`.
 */
export function partyNeedsHealing(save) {
  return save.party.some((mon) => mon.hp < mon.stats.hp
    || mon.status != null
    || mon.moves.some((slot) => slot.pp < slot.maxPp))
}

export function markSeen(save, speciesId) {
  if (!save.dex.seen.includes(speciesId)) save.dex.seen.push(speciesId)
  return save
}

/**
 * One more of a species on its tally, and seen along with it.
 *
 * Counted where an encounter is consumed rather than where it appears, so the number
 * is how many of them you have actually stood in front of. The ones that wandered
 * back into the grass while you were busy are seen, not faced.
 */
export function markFaced(save, speciesId) {
  markSeen(save, speciesId)
  save.dex.faced ??= {}
  save.dex.faced[speciesId] = timesFaced(save, speciesId) + 1
  return save
}

/**
 * How many of a species you have faced.
 *
 * Zero for anything only ever seen, and for every entry in a save that predates the
 * tally. JSON turns the keys into strings on the way to disk, which a numeric lookup
 * reads back regardless.
 */
export function timesFaced(save, speciesId) {
  return save.dex?.faced?.[speciesId] ?? 0
}

export function markCaught(save, speciesId) {
  markSeen(save, speciesId)
  if (!save.dex.caught.includes(speciesId)) save.dex.caught.push(speciesId)
  return save
}

/**
 * Adds a caught Pokemon to the party, or to the box when the party is full.
 *
 * @returns {'party' | 'box'} where it ended up, so the player can be told.
 */
export function addPokemon(save, mon) {
  markCaught(save, mon.species)
  save.stats.caught++

  if (save.party.length < PARTY_LIMIT) {
    save.party.push(mon)
    return 'party'
  }
  save.box.push(mon)
  return 'box'
}

/**
 * Moves a boxed Pokemon into the party.
 *
 * @returns {boolean} whether it moved, so the screen can say why it did not.
 */
export function withdrawPokemon(save, index) {
  if (index < 0 || index >= save.box.length) return false
  if (save.party.length >= PARTY_LIMIT) return false

  const [mon] = save.box.splice(index, 1)
  save.party.push(mon)
  return true
}

/**
 * Moves a party member into the box.
 *
 * Never the last one: a team of nobody cannot fight, cannot heal and cannot get
 * anything back out of the box, which would be a save with no way forward.
 *
 * @returns {boolean} whether it moved.
 */
export function depositPokemon(save, index) {
  if (index < 0 || index >= save.party.length) return false
  if (save.party.length <= 1) return false

  const [mon] = save.party.splice(index, 1)
  save.box.push(mon)
  return true
}

/** Moves a party member to the front, so it leads the next battle. */
export function setLead(save, index) {
  if (index <= 0 || index >= save.party.length) return save
  const [mon] = save.party.splice(index, 1)
  save.party.unshift(mon)
  return save
}

export function totalBalls(save) {
  return Object.keys(BALLS).reduce((total, key) => total + countOf(save, key), 0)
}

/** Publishes the summary the status line reads. */
export function publishStatus(save, extra = {}) {
  const lead = activePokemon(save) ?? save.party[0] ?? null

  writeStatus({
    lead: lead ? { name: displayName(lead), level: levelOf(lead) } : null,
    balls: totalBalls(save),
    money: save.money,
    caught: save.dex.caught.length,
    ...extra,
  })
}
