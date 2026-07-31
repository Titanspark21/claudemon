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
    dex: { seen: [starterId], caught: [starterId] },
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
  save.stats ??= { battles: 0, wins: 0, losses: 0, caught: 0, runs: 0 }

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

export function markSeen(save, speciesId) {
  if (!save.dex.seen.includes(speciesId)) save.dex.seen.push(speciesId)
  return save
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
