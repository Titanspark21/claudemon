import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dataFile } from './paths.mjs'

let cache = null

const read = (name) => JSON.parse(readFileSync(dataFile(name), 'utf8'))

export const loadData = () => {
  if (cache) return cache

  const pokedex = read('pokedex.json')
  const speciesIdentities = read('form-ids.json')

  cache = {
    pokedex,
    byId: new Map(pokedex.map((mon) => [mon.id, mon])),
    speciesIdentities,
    identityById: new Map(
      speciesIdentities.records.map((record) => [record.id, record]),
    ),
    identityBySource: new Map(
      speciesIdentities.records.map((record) => [record.sourceKey, record]),
    ),
    moves: read('moves.json'),
    abilities: read('abilities.json'),
    mechanicsCoverage: read('mechanics-coverage.json'),
    items: read('items.json'),
    types: read('types.json'),
    growth: read('growth.json'),
    biomes: read('biomes.json'),
    progression: read('progression.json'),
  }

  return cache
}

export const loadPokedex = () => loadData().pokedex

export const progressionData = () => loadData().progression

const datasetFingerprint = (dataset) => {
  const identity = {
    forms: dataset.speciesIdentities.records.map((record) => [
      record.id,
      record.sourceKey,
      record.dexNumber,
      record.baseSpecies,
      record.formKey,
      record.collectible,
      record.battleOnly,
    ]),
    species: dataset.pokedex.map((mon) => [
      mon.id,
      (mon.abilities ?? []).map((slot) => slot.ability),
    ]),
    moves: Object.keys(dataset.moves).sort(),
    items: Object.keys(dataset.items).sort(),
  }

  return createHash('sha256').update(JSON.stringify(identity)).digest('hex')
}

export const tradeDataset = (dataset = loadData()) => ({
  generation: dataset.mechanicsCoverage.generation,
  identityVersion: dataset.speciesIdentities.version,
  fingerprint: datasetFingerprint(dataset),
})

export const tradeDatasetCompatible = (incoming, dataset = loadData()) => {
  if (incoming?.legacy === true) return true
  if (!incoming || typeof incoming !== 'object') return false

  const local = tradeDataset(dataset)

  return (
    incoming.generation === local.generation &&
    incoming.identityVersion === local.identityVersion &&
    incoming.fingerprint === local.fingerprint
  )
}

export const validateGeneratedData = (dataset = loadData()) => {
  const total = dataset.progression?.metadata?.nationalDexTotal
  const identities = dataset.speciesIdentities?.records

  if (dataset.mechanicsCoverage?.generation !== 7) return false
  if (!Number.isInteger(dataset.speciesIdentities?.version)) return false
  if (!Number.isInteger(total) || total !== 809) return false
  if (!Array.isArray(identities) || identities.length < total) return false
  if (dataset.pokedex.length !== identities.length) return false
  if (!identities.every((record) => dataset.byId.has(record.id))) return false
  if (!Object.keys(dataset.moves).length || !Object.keys(dataset.items).length)
    return false

  for (let id = 1; id <= total; id++) {
    const identity = dataset.identityById.get(id)
    if (!identity || identity.dexNumber !== id || identity.formKey !== null)
      return false
  }

  return true
}

export const isDataReady = () => {
  try {
    return validateGeneratedData()
  } catch {
    return false
  }
}

export const species = (id) => {
  const mon = loadData().byId.get(id)

  if (!mon) throw new Error(`no Pokemon with id ${id}`)

  return mon
}

export const hasSpecies = (id) => loadData().byId.has(id)

export const speciesIdentity = (id) => {
  const record = loadData().identityById.get(id)

  if (!record) throw new Error(`no species identity with id ${id}`)

  return record
}

export const sourceSpeciesIdentity = (sourceKey) => {
  const record = loadData().identityBySource.get(sourceKey)

  if (!record) throw new Error(`no species identity named ${sourceKey}`)

  return record
}

export const baseSpeciesIdentity = (id) => {
  return speciesIdentity(speciesIdentity(id).baseSpecies)
}

export const speciesForms = (baseSpecies) => {
  return loadData().speciesIdentities.records.filter((record) => {
    return record.baseSpecies === baseSpecies && record.formKey !== null
  })
}

export const displayDexNumber = (id) => speciesIdentity(id).dexNumber

export const dexEntryForSpecies = (id) => {
  const record = speciesIdentity(id)

  if (record.battleOnly)
    throw new Error(`battle-only species cannot be persisted: ${id}`)

  return {
    dexNumber: record.dexNumber,
    formId: record.formKey === null ? null : record.id,
  }
}

export const hasMove = (name) => Boolean(loadData().moves[name])

export const move = (name) => {
  const found = loadData().moves[name]

  if (!found) throw new Error(`no move named ${name}`)

  return found
}

export const moveCoverage = (name) => {
  const found = loadData().mechanicsCoverage.moves[name]

  if (!found) throw new Error(`no move coverage named ${name}`)

  return found
}

export const hasItem = (key) => Boolean(loadData().items[key])

export const item = (key) => {
  const found = loadData().items[key]

  if (!found) throw new Error(`no item named ${key}`)

  return found
}

export const items = () => loadData().items
