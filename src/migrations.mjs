import {
  CONFIG_MESSAGES,
  CONFIG_VERSION,
  MIGRATION_BACKUP_SUFFIX,
  SAVE_MESSAGES,
  SAVE_VERSION,
  STAT_NAMES,
  TRADE_MESSAGES,
  TRADE_VERSION,
} from './constants.mjs'
import { speciesIdentity } from './data.mjs'
import { normalizeExpedition } from './expedition.mjs'
import { migrateJsonFile } from './fileLock.mjs'
import { assertPersistentSpecies } from './forms.mjs'
import { rollNature } from './natures.mjs'
import { levelOf, rollAbility } from './pokemon.mjs'
import { makeRng } from './rng.mjs'
import { statsAtLevel } from './stats.mjs'
import {
  transformRequestSaveGame,
  transformRequestWriteConfig,
  transformResponseConfig,
  transformResponseSave,
  transformResponseTrade,
} from './transformers.mjs'

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

const hashNumber = (hash, value) => {
  let next = hash >>> 0
  let word = Number(value) >>> 0

  for (let index = 0; index < 4; index++) {
    next = Math.imul(next ^ (word & 0xff), FNV_PRIME) >>> 0
    word >>>= 8
  }

  return next
}

const hashText = (hash, value) => {
  let next = hash >>> 0

  for (const byte of Buffer.from(String(value ?? ''), 'utf8')) {
    next = Math.imul(next ^ byte, FNV_PRIME) >>> 0
  }

  return next
}

export class MigrationVersionError extends Error {
  constructor(kind, version, current, message) {
    super(message)
    this.name = 'MigrationVersionError'
    this.kind = kind
    this.version = version
    this.current = current
  }
}

const versionOf = (value, fallback) =>
  Number.isInteger(value?.version) ? value.version : fallback

const tradeVersionOf = (value) => (Number.isInteger(value?.v) ? value.v : null)

const rejectFuture = (kind, version, current, message) => {
  if (version <= current) return

  throw new MigrationVersionError(kind, version, current, message)
}

export const stablePokemonRoll = (mon, namespace = '') => {
  let hash = hashText(FNV_OFFSET, namespace)

  hash = hashNumber(hash, mon?.species ?? 0)
  for (const stat of STAT_NAMES) hash = hashNumber(hash, mon?.ivs?.[stat] ?? 0)

  return hash >>> 0
}

const clonePokemon = (mon) => ({
  ...mon,
  ivs: mon?.ivs ? { ...mon.ivs } : mon?.ivs,
  stats: mon?.stats ? { ...mon.stats } : mon?.stats,
  moves: Array.isArray(mon?.moves)
    ? mon.moves.map((slot) => ({ ...slot }))
    : mon?.moves,
})

const saveIdentityOf = (save) =>
  `${save?.trainer?.name ?? ''}\u0000${save?.trainer?.startedAt ?? ''}`

export const migratePokemon = (mon, saveIdentity = '') => {
  if (!mon || typeof mon !== 'object')
    throw new Error('invalid Pokemon in save')
  assertPersistentSpecies(mon.species)

  const next = clonePokemon(mon)

  if (next.nature == null) {
    next.nature = rollNature(
      makeRng(stablePokemonRoll(next, `nature:${saveIdentity}`)),
    )
  }
  if (next.ability == null) {
    next.ability = rollAbility(
      next.species,
      makeRng(stablePokemonRoll(next, `ability:${saveIdentity}`)),
    )
  }
  next.heldItem ??= null

  if (next.stats == null && Number.isFinite(next.exp) && next.ivs) {
    next.stats = statsAtLevel(
      next.species,
      levelOf(next),
      next.ivs,
      next.nature,
    )
  }

  return next
}

const safeIdentity = (id) => {
  try {
    return speciesIdentity(id)
  } catch {
    return null
  }
}

const appendUnique = (items, value) => {
  if (!items.includes(value)) items.push(value)
}

const emptyFormDex = () => ({ seen: [], caught: [], shiny: [], faced: {} })

const partitionDexArray = (direct, nested) => {
  const national = []
  const forms = []

  for (const id of [...(direct ?? []), ...(nested ?? [])]) {
    const identity = safeIdentity(id)

    if (!identity || identity.battleOnly) continue
    if (identity.formKey == null) appendUnique(national, identity.dexNumber)
    else if (identity.collectible) {
      appendUnique(national, identity.dexNumber)
      appendUnique(forms, identity.id)
    }
  }

  return { national, forms }
}

const addFaced = (record, id, count) => {
  if (!Number.isFinite(count) || count <= 0) return
  record[id] = (record[id] ?? 0) + count
}

const partitionFaced = (direct, nested) => {
  const national = {}
  const formCounts = new Map()

  const takeForm = (identity, count) => {
    if (!Number.isFinite(count) || count <= 0) return
    formCounts.set(
      identity.id,
      Math.max(formCounts.get(identity.id) ?? 0, count),
    )
  }

  for (const [rawId, count] of Object.entries(direct ?? {})) {
    const identity = safeIdentity(Number(rawId))
    if (!identity || identity.battleOnly) continue
    if (identity.formKey == null) addFaced(national, identity.dexNumber, count)
    else if (identity.collectible) takeForm(identity, count)
  }

  for (const [rawId, count] of Object.entries(nested ?? {})) {
    const identity = safeIdentity(Number(rawId))
    if (
      identity &&
      !identity.battleOnly &&
      identity.formKey != null &&
      identity.collectible
    )
      takeForm(identity, count)
  }

  const forms = {}
  for (const [id, count] of formCounts) {
    const identity = speciesIdentity(id)
    forms[id] = count
    addFaced(national, identity.dexNumber, count)
  }

  return { national, forms }
}

const partitionLegacyDex = (dex = {}) => {
  const nested = dex.forms ?? emptyFormDex()
  const seen = partitionDexArray(dex.seen, nested.seen)
  const caught = partitionDexArray(dex.caught, nested.caught)
  const shiny = partitionDexArray(dex.shiny, nested.shiny)
  const faced = partitionFaced(dex.faced, nested.faced)

  return {
    seen: seen.national,
    caught: caught.national,
    shiny: shiny.national,
    faced: faced.national,
    forms: {
      seen: seen.forms,
      caught: caught.forms,
      shiny: shiny.forms,
      faced: faced.forms,
    },
  }
}

const normalizeNationalArray = (items) => {
  const result = []
  for (const id of items ?? []) {
    const identity = safeIdentity(id)
    if (!identity || identity.battleOnly || identity.formKey != null) continue
    appendUnique(result, identity.dexNumber)
  }
  return result
}

const normalizeFormArray = (items) => {
  const result = []
  for (const id of items ?? []) {
    const identity = safeIdentity(id)
    if (
      !identity ||
      identity.battleOnly ||
      identity.formKey == null ||
      !identity.collectible
    )
      continue
    appendUnique(result, identity.id)
  }
  return result
}

const normalizeFaced = (record, form) => {
  const result = {}
  for (const [rawId, count] of Object.entries(record ?? {})) {
    const identity = safeIdentity(Number(rawId))
    const valid = form
      ? identity?.formKey != null &&
        identity?.collectible &&
        !identity?.battleOnly
      : identity != null && identity.formKey == null && !identity.battleOnly
    if (!valid || !Number.isFinite(count) || count <= 0) continue
    result[form ? identity.id : identity.dexNumber] = count
  }
  return result
}

const normalizeCurrentDex = (dex = {}) => ({
  seen: normalizeNationalArray(dex.seen),
  caught: normalizeNationalArray(dex.caught),
  shiny: normalizeNationalArray(dex.shiny),
  faced: normalizeFaced(dex.faced, false),
  forms: {
    seen: normalizeFormArray(dex.forms?.seen),
    caught: normalizeFormArray(dex.forms?.caught),
    shiny: normalizeFormArray(dex.forms?.shiny),
    faced: normalizeFaced(dex.forms?.faced, true),
  },
})

const stableSaveSeed = (save) => {
  let hash = hashText(FNV_OFFSET, `expedition:${saveIdentityOf(save)}`)
  const mons = [
    ...(save?.party ?? []),
    ...(save?.box ?? []),
    ...(save?.daycare?.slots ?? []),
  ]
  for (const mon of mons)
    hash = hashNumber(hash, stablePokemonRoll(mon, 'save'))
  return hash >>> 0
}

const migrateSaveV1ToV2 = (save, workedMs) => {
  const identity = saveIdentityOf(save)

  return {
    ...save,
    version: 2,
    party: (save.party ?? []).map((mon) => migratePokemon(mon, identity)),
    box: (save.box ?? []).map((mon) => migratePokemon(mon, identity)),
    daycare: {
      ...(save.daycare ?? {}),
      slots: (save.daycare?.slots ?? []).map((mon) =>
        migratePokemon(mon, identity),
      ),
      egg: save.daycare?.egg ?? null,
    },
    dex: partitionLegacyDex(save.dex),
    trades: save.trades ?? { received: [] },
    league: save.league ?? { championships: 0, firstWonAt: null },
    expedition: normalizeExpedition(
      save.expedition,
      workedMs,
      stableSaveSeed(save),
    ),
  }
}

const normalizeSave = (save, workedMs) => {
  const identity = saveIdentityOf(save)

  return transformResponseSave({
    ...save,
    party: (save.party ?? []).map((mon) => migratePokemon(mon, identity)),
    box: (save.box ?? []).map((mon) => migratePokemon(mon, identity)),
    daycare: {
      ...(save.daycare ?? {}),
      slots: (save.daycare?.slots ?? []).map((mon) =>
        migratePokemon(mon, identity),
      ),
      egg: save.daycare?.egg ?? null,
    },
    dex: normalizeCurrentDex(save.dex),
    league: save.league ?? { championships: 0, firstWonAt: null },
    expedition: normalizeExpedition(
      save.expedition,
      workedMs,
      stableSaveSeed(save),
    ),
  })
}

export const migrateSave = (rawSave, { workedMs = 0 } = {}) => {
  if (!rawSave || typeof rawSave !== 'object') return null

  let version = versionOf(rawSave, 1)
  if (version < 1) throw new Error(`Unsupported save version: ${version}`)
  rejectFuture('save', version, SAVE_VERSION, SAVE_MESSAGES.fromNewer)

  let save = structuredClone(rawSave)
  while (version < SAVE_VERSION) {
    if (version === 1) save = migrateSaveV1ToV2(save, workedMs)
    else throw new Error(`No save migration from version ${version}`)
    version = save.version
  }

  return normalizeSave(save, workedMs)
}

export const migrateSaveFile = (path, { workedMs = 0 } = {}) =>
  migrateJsonFile({
    path,
    backupPath: `${path}${MIGRATION_BACKUP_SUFFIX}`,
    migrate: (raw) => migrateSave(raw, { workedMs }),
    transformRequest: transformRequestSaveGame,
    needsMigration: (raw) => versionOf(raw, 1) < SAVE_VERSION,
  })

const migrateConfigV0ToV1 = (config) => ({ ...config, version: 1 })

export const migrateConfig = (rawConfig) => {
  if (!rawConfig || typeof rawConfig !== 'object') return null

  let version = versionOf(rawConfig, 0)
  if (version < 0) throw new Error(`Unsupported config version: ${version}`)
  rejectFuture('config', version, CONFIG_VERSION, CONFIG_MESSAGES.fromNewer)

  let config = structuredClone(rawConfig)
  while (version < CONFIG_VERSION) {
    if (version === 0) config = migrateConfigV0ToV1(config)
    else throw new Error(`No config migration from version ${version}`)
    version = config.version
  }

  return transformResponseConfig(config)
}

export const migrateConfigFile = (path) =>
  migrateJsonFile({
    path,
    backupPath: `${path}${MIGRATION_BACKUP_SUFFIX}`,
    migrate: migrateConfig,
    transformRequest: transformRequestWriteConfig,
    needsMigration: (raw) => versionOf(raw, 0) < CONFIG_VERSION,
  })

const tradeIdentityOf = (trade) =>
  `${trade?.from?.name ?? ''}\u0000${trade?.from?.at ?? ''}\u0000${trade?.id ?? ''}`

const migrateTradeV1ToV2 = (trade) => ({
  ...trade,
  v: 2,
  mon: migratePokemon(trade.mon, tradeIdentityOf(trade)),
})

const migrateTradeV2ToV3 = (trade) => ({
  ...trade,
  v: 3,
  dataset: { legacy: true },
})

export const migrateTrade = (rawTrade) => {
  if (!rawTrade || typeof rawTrade !== 'object') return null

  let version = tradeVersionOf(rawTrade)
  if (version == null || version < 1)
    throw new Error('Unsupported trade version')
  rejectFuture('trade', version, TRADE_VERSION, TRADE_MESSAGES.fromNewer)

  let trade = structuredClone(rawTrade)
  while (version < TRADE_VERSION) {
    if (version === 1) trade = migrateTradeV1ToV2(trade)
    else if (version === 2) trade = migrateTradeV2ToV3(trade)
    else throw new Error(`No trade migration from version ${version}`)
    version = trade.v
  }

  trade.mon = migratePokemon(trade.mon, tradeIdentityOf(trade))
  return transformResponseTrade(trade)
}
