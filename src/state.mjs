import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { BALLS } from './capture.mjs'
import { HOME, SAVE_FILE } from './paths.mjs'
import {
  createPokemon,
  displayName,
  healFully,
  isFainted,
  levelOf,
  refreshStats,
} from './pokemon.mjs'
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

function migrate(save) {
  save.version ??= SAVE_VERSION
  save.party ??= []
  save.box ??= []
  save.bag ??= {}
  save.money ??= 0
  save.dex ??= { seen: [], caught: [] }
  save.dex.seen ??= []
  save.dex.caught ??= []
  save.dex.faced ??= {}
  save.stats ??= { battles: 0, wins: 0, losses: 0, caught: 0, runs: 0 }

  for (const mon of [...save.party, ...save.box]) markCaught(save, mon.species)

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
    } catch {}
    throw error
  }
  try {
    publishStatus(save)
  } catch {}
  return save
}

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

export function partyNeedsHealing(save) {
  return save.party.some(
    (mon) =>
      mon.hp < mon.stats.hp ||
      mon.status != null ||
      mon.moves.some((slot) => slot.pp < slot.maxPp),
  )
}

export function markSeen(save, speciesId) {
  if (!save.dex.seen.includes(speciesId)) save.dex.seen.push(speciesId)
  return save
}

export function markFaced(save, speciesId) {
  markSeen(save, speciesId)
  save.dex.faced ??= {}
  save.dex.faced[speciesId] = timesFaced(save, speciesId) + 1
  return save
}

export function timesFaced(save, speciesId) {
  return save.dex?.faced?.[speciesId] ?? 0
}

export function markCaught(save, speciesId) {
  markSeen(save, speciesId)
  if (!save.dex.caught.includes(speciesId)) save.dex.caught.push(speciesId)
  return save
}

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

export function withdrawPokemon(save, index) {
  if (index < 0 || index >= save.box.length) return false
  if (save.party.length >= PARTY_LIMIT) return false

  const [mon] = save.box.splice(index, 1)
  save.party.push(mon)
  return true
}

export function depositPokemon(save, index) {
  if (index < 0 || index >= save.party.length) return false
  if (save.party.length <= 1) return false

  const [mon] = save.party.splice(index, 1)
  save.box.push(mon)
  return true
}

export function setLead(save, index) {
  if (index <= 0 || index >= save.party.length) return save
  const [mon] = save.party.splice(index, 1)
  save.party.unshift(mon)
  return save
}

export function totalBalls(save) {
  return Object.keys(BALLS).reduce(
    (total, key) => total + countOf(save, key),
    0,
  )
}

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
