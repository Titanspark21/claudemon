import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import {
  STAT_NAMES,
  TRADE_CODE_PREFIX,
  TRADE_ID_RADIX,
  TRADE_MESSAGES,
  TRADE_VERSION,
} from './constants.mjs'
import {
  hasMove,
  item,
  loadData,
  move as moveData,
  tradeDataset,
  tradeDatasetCompatible,
} from './data.mjs'
import { isPersistentSpecies } from './forms.mjs'
import { canHoldItem } from './heldItems.mjs'
import { allPokemon, canSpare, pokemonList } from './helpers.mjs'
import { MigrationVersionError, migrateTrade } from './migrations.mjs'
import { NATURES } from './natures.mjs'
import { TRADE_FILE } from './paths.mjs'
import { levelOf } from './pokemon.mjs'
import { randomSeed } from './rng.mjs'
import { recordInDex, stow } from './state.mjs'
import { statsAtLevel } from './stats.mjs'
import { transformRequestTrade } from './transformers.mjs'

export const newTradeId = () => {
  return `${randomSeed().toString(TRADE_ID_RADIX)}${randomSeed().toString(
    TRADE_ID_RADIX,
  )}`
}

export const encodeTrade = (mon, trainer, id) => {
  const payload = transformRequestTrade({
    v: TRADE_VERSION,
    id,
    mon,
    from: { name: trainer.name, at: trainer.startedAt },
    dataset: tradeDataset(),
  })
  const body = deflateSync(JSON.stringify(payload)).toString('base64url')

  return `${TRADE_CODE_PREFIX}${body}`
}

const isReadableDataset = (dataset) => {
  if (dataset?.legacy === true) return true

  return (
    Number.isInteger(dataset?.generation) &&
    Number.isInteger(dataset?.identityVersion) &&
    typeof dataset?.fingerprint === 'string' &&
    dataset.fingerprint.length > 0
  )
}

export const validateTradePokemon = (mon, dataset = loadData()) => {
  if (!mon || typeof mon !== 'object') return false

  const identity = dataset.identityById.get(mon.species)
  const speciesRecord = dataset.byId.get(mon.species)

  if (!identity || !speciesRecord || identity.battleOnly) return false
  if (!isPersistentSpecies(mon.species)) return false
  if (!Number.isFinite(mon.exp) || !Number.isFinite(mon.hp)) return false
  if (
    !STAT_NAMES.every(
      (stat) =>
        Number.isInteger(mon.ivs?.[stat]) &&
        mon.ivs[stat] >= 0 &&
        mon.ivs[stat] <= 31,
    )
  )
    return false
  if (!Object.hasOwn(NATURES, mon.nature)) return false

  const abilities = speciesRecord.abilities ?? []
  if (!abilities.some((slot) => slot.ability === mon.ability)) return false
  if (!dataset.mechanicsCoverage.abilities?.[mon.ability]) return false

  if (mon.heldItem != null) {
    if (!dataset.items[mon.heldItem] || !canHoldItem(mon.heldItem)) return false
  }

  if (!Array.isArray(mon.moves)) return false

  return mon.moves.every(
    (slot) =>
      hasMove(slot.move) &&
      Number.isInteger(slot.pp) &&
      Number.isFinite(moveData(slot.move).pp),
  )
}

const isReadableTrade = (trade) => {
  if (!Number.isInteger(trade.v)) return false
  if (typeof trade.id !== 'string' || trade.id === '') return false
  if (typeof trade.from?.name !== 'string') return false
  if (!isReadableDataset(trade.dataset)) return false

  return validateTradePokemon(trade.mon)
}

const readTrade = (body) => {
  try {
    const raw = JSON.parse(
      inflateSync(Buffer.from(body, 'base64url')).toString('utf8'),
    )
    const sourceVersion = raw?.v
    const trade = migrateTrade(raw)

    if (sourceVersion === TRADE_VERSION && trade.dataset?.legacy === true)
      return { trade: null, future: false, mismatch: false }
    if (!isReadableTrade(trade))
      return { trade: null, future: false, mismatch: false }
    if (!tradeDatasetCompatible(trade.dataset))
      return { trade: null, future: false, mismatch: true }

    return { trade, future: false, mismatch: false }
  } catch (error) {
    return {
      trade: null,
      future: error instanceof MigrationVersionError && error.kind === 'trade',
      mismatch: false,
    }
  }
}

export const decodeTrade = (text) => {
  const trimmed = text.trim()

  if (!trimmed.startsWith(TRADE_CODE_PREFIX)) {
    return { ok: false, reason: TRADE_MESSAGES.unreadable }
  }

  const read = readTrade(trimmed.slice(TRADE_CODE_PREFIX.length))

  if (read.future) return { ok: false, reason: TRADE_MESSAGES.fromNewer }
  if (read.mismatch)
    return { ok: false, reason: TRADE_MESSAGES.datasetMismatch }
  if (!read.trade) return { ok: false, reason: TRADE_MESSAGES.unreadable }

  return { ok: true, trade: read.trade }
}

export const giveAway = (save, source, index) => {
  if (!canSpare(save, source)) {
    return { ok: false, reason: TRADE_MESSAGES.lastOne }
  }

  const [mon] = pokemonList(save, source).splice(index, 1)

  return { ok: true, mon, code: encodeTrade(mon, save.trainer, newTradeId()) }
}

const arrivingMove = (slot) => {
  const maxPp = moveData(slot.move).pp

  return { move: slot.move, pp: Math.max(0, Math.min(maxPp, slot.pp)), maxPp }
}

const arrivingMon = (mon) => {
  const stats = statsAtLevel(mon.species, levelOf(mon), mon.ivs, mon.nature)

  return {
    species: mon.species,
    nickname: mon.nickname,
    exp: mon.exp,
    ivs: mon.ivs,
    nature: mon.nature,
    ability: mon.ability,
    heldItem: mon.heldItem ?? null,
    stats,
    hp: Math.max(0, Math.min(stats.hp, Math.round(mon.hp))),
    moves: mon.moves.map(arrivingMove),
    status: mon.status,
    statusTurns: mon.statusTurns,
    shiny: mon.shiny,
  }
}

const isOwnGame = (save, trade) => {
  return (
    trade.from.name === save.trainer.name &&
    trade.from.at === save.trainer.startedAt
  )
}

const duplicatesMegaStone = (save, key) => {
  if (!key) return false

  const record = item(key)
  if (!record.megaStone) return false
  if ((save.bag?.[key] ?? 0) > 0) return true

  return allPokemon(save).some((mon) => mon.heldItem === key)
}

export const takeIn = (save, trade) => {
  if (!trade || !validateTradePokemon(trade.mon)) {
    return { ok: false, reason: TRADE_MESSAGES.unreadable }
  }

  if (isOwnGame(save, trade)) {
    return { ok: false, reason: TRADE_MESSAGES.ownGame }
  }

  if (save.trades.received.includes(trade.id)) {
    return { ok: false, reason: TRADE_MESSAGES.alreadyTaken }
  }

  if (duplicatesMegaStone(save, trade.mon.heldItem)) {
    return { ok: false, reason: TRADE_MESSAGES.duplicateMegaStone }
  }

  const mon = arrivingMon(trade.mon)
  const where = stow(save, mon)

  save.trades.received.push(trade.id)
  recordInDex(save, mon)

  return { ok: true, mon, where }
}

export const writeTradeCode = (code, path = TRADE_FILE) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${code}\n`)

  return path
}
