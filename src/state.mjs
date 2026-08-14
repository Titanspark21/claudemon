import { readFileSync } from 'node:fs'
import { recordAchievements } from './achievements.mjs'
import {
  DAY_MS,
  EMPTY_STATS,
  PARTY_LIMIT,
  SAVE_VERSION,
  STARTER_CAUGHT_COUNT,
  STARTER_LEVEL,
  STARTING_BAG,
  STARTING_MONEY,
} from './constants.mjs'
import { updateJsonFile as updateFile } from './fileLock.mjs'
import { allPokemon, pokemonList } from './helpers.mjs'
import { createExpedition, normalizeExpedition } from './expedition.mjs'
import { SAVE_FILE } from './paths.mjs'
import {
  createPokemon,
  displayName,
  healFully,
  isFainted,
  levelOf,
  refreshStats,
  rollShiny,
} from './pokemon.mjs'
import { writeStatus, writeStatusSnapshot } from './status.mjs'
import { randomSeed, seedFromRng } from './rng.mjs'
import { countOfKind } from './shop.mjs'
import { advanceStreak } from './streak.mjs'
import {
  transformRequestSaveGame,
  transformResponseSave,
} from './transformers.mjs'
import { readWorked } from './worked.mjs'

const saveBaselines = new WeakMap()

const saveFingerprint = (save) => {
  return JSON.stringify(transformRequestSaveGame(save))
}

export const recordPlayday = (save, now = Date.now()) => {
  const next = advanceStreak(save.stats, now)

  if (next.lastPlayedAt === save.stats.lastPlayedAt) return false

  save.stats.streak = next.streak
  save.stats.lastPlayedAt = next.lastPlayedAt

  return true
}

export const createSave = ({ trainer, starterId, rng }) => {
  const starter = createPokemon(starterId, STARTER_LEVEL, rng, rollShiny(rng))
  const workedMs = readWorked().totalMs
  const save = {
    version: SAVE_VERSION,
    trainer: { name: trainer, startedAt: new Date().toISOString() },
    party: [starter],
    box: [],
    daycare: { slots: [], egg: null },
    bag: { ...STARTING_BAG },
    money: STARTING_MONEY,
    badges: [],
    dex: {
      seen: [starterId],
      caught: [starterId],
      shiny: starter.shiny ? [starterId] : [],
      faced: {},
    },
    stats: { ...EMPTY_STATS, caught: STARTER_CAUGHT_COUNT },
    achievements: [],
    trades: { received: [] },
    expedition: createExpedition(seedFromRng(rng), workedMs),
  }

  recordPlayday(save)

  return save
}

export const daysOnTheRoad = (save, now = Date.now()) => {
  const started = Date.parse(save.trainer.startedAt)

  if (Number.isNaN(started)) return 1

  return Math.max(1, Math.floor((now - started) / DAY_MS) + 1)
}

export const hasBadge = (save, gymId) => save.badges.includes(gymId)

export const awardBadge = (save, gymId) => {
  if (!hasBadge(save, gymId)) save.badges.push(gymId)

  return save
}

export const markSeen = (save, speciesId) => {
  if (!save.dex.seen.includes(speciesId)) save.dex.seen.push(speciesId)

  return save
}

export const timesFaced = (save, speciesId) => {
  return save.dex.faced[speciesId] ?? 0
}

export const markFaced = (save, speciesId) => {
  markSeen(save, speciesId)

  save.dex.faced[speciesId] = timesFaced(save, speciesId) + 1

  return save
}

export const markCaught = (save, speciesId) => {
  markSeen(save, speciesId)

  if (!save.dex.caught.includes(speciesId)) save.dex.caught.push(speciesId)

  return save
}

export const markShiny = (save, speciesId) => {
  markCaught(save, speciesId)

  if (!save.dex.shiny.includes(speciesId)) save.dex.shiny.push(speciesId)

  return save
}

export const recordInDex = (save, mon) => {
  if (mon.shiny) return markShiny(save, mon.species)

  return markCaught(save, mon.species)
}

const migrate = (save) => {
  for (const mon of allPokemon(save)) {
    mon.heldItem ??= null
    recordInDex(save, mon)
    refreshStats(mon)
  }

  const worked = readWorked()

  save.expedition = normalizeExpedition(
    save.expedition,
    worked.totalMs,
    randomSeed(),
  )
  recordAchievements(save, worked)

  save.version = SAVE_VERSION

  return save
}

const readSaveFile = () => {
  try {
    return JSON.parse(readFileSync(SAVE_FILE, 'utf8'))
  } catch {
    return null
  }
}

export const loadSave = () => {
  const save = transformResponseSave(readSaveFile())

  if (!save) return null

  const baseline = saveFingerprint(save)

  saveBaselines.set(save, baseline)
  migrate(save)

  return save
}

export const activePokemon = (save) => {
  return save.party.find((mon) => !isFainted(mon)) ?? null
}

export const partyIsWipedOut = (save) => {
  return save.party.length > 0 && save.party.every(isFainted)
}

export const healParty = (save) => {
  for (const mon of allPokemon(save)) healFully(mon)

  return save
}

export const partyNeedsHealing = (save) => {
  return save.party.some(
    (mon) =>
      mon.hp < mon.stats.hp ||
      mon.status != null ||
      mon.moves.some((slot) => slot.pp < slot.maxPp),
  )
}

export const totalBalls = (save) => countOfKind(save, 'ball')

const getLead = (save) => {
  if (!save.party.length) return null

  return activePokemon(save) ?? save.party[0]
}

const describeLead = (lead) => {
  if (!lead) return null

  return { name: displayName(lead), level: levelOf(lead) }
}

const biomeOf = (save) => {
  if (!save.expedition || save.expedition.pendingDeparture) return null

  return save.expedition.biome ?? null
}

const visitRevisionOf = (save) => {
  if (!save.expedition) return 0

  return save.expedition.visitRevision ?? 0
}

const statusOf = (save) => ({
  lead: describeLead(getLead(save)),
  balls: totalBalls(save),
  money: save.money,
  caught: save.dex.caught.length,
  biome: biomeOf(save),
  visitRevision: visitRevisionOf(save),
})

export const publishStatus = (save) => writeStatus(statusOf(save))

export const publishStatusSnapshot = (save, heartbeat = 0) => {
  return writeStatusSnapshot(statusOf(save), heartbeat)
}

const chooseSave = (current, incoming) => {
  if (!current) return incoming

  const baseline = saveBaselines.get(incoming)

  if (!baseline) return incoming
  if (saveFingerprint(current) !== baseline) return current

  return incoming
}

export const saveGame = (save, { publish = true } = {}) => {
  const saved = updateFile({
    path: SAVE_FILE,
    incoming: save,
    transformResponse: transformResponseSave,
    transformRequest: transformRequestSaveGame,
    merge: chooseSave,
  })
  const baseline = saveFingerprint(saved)

  saveBaselines.set(saved, baseline)

  if (saved !== save) migrate(saved)

  if (publish) {
    try {
      publishStatus(saved)
    } catch {}
  }

  return saved
}

export const stow = (save, mon) => {
  const where = save.party.length < PARTY_LIMIT ? 'party' : 'box'

  pokemonList(save, where).push(mon)

  return where
}

export const addPokemon = (save, mon) => {
  recordInDex(save, mon)
  save.stats.caught++

  return stow(save, mon)
}

export const withdrawPokemon = (save, index) => {
  if (index < 0 || index >= save.box.length) return false
  if (save.party.length >= PARTY_LIMIT) return false

  const [mon] = save.box.splice(index, 1)

  save.party.push(mon)

  return true
}

export const depositPokemon = (save, index) => {
  if (index < 0 || index >= save.party.length) return false
  if (save.party.length <= 1) return false

  const [mon] = save.party.splice(index, 1)

  save.box.push(mon)

  return true
}

export const setLead = (save, index) => {
  if (index <= 0 || index >= save.party.length) return save

  const [mon] = save.party.splice(index, 1)

  save.party.unshift(mon)

  return save
}
