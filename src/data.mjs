import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dataFile } from './paths.mjs'

let cache = null

const dataError = (name, detail) => {
  return new Error(`Invalid generated data file ${dataFile(name)}: ${detail}`)
}

const read = (name) => {
  try {
    return JSON.parse(readFileSync(dataFile(name), 'utf8'))
  } catch (error) {
    throw dataError(name, error.message)
  }
}

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
    biomes: dataset.biomes,
    progression: dataset.progression,
    mechanicsCoverage: dataset.mechanicsCoverage,
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

const invalidGeneratedData = (dataset) => {
  const total = dataset.progression?.metadata?.nationalDexTotal
  const identities = dataset.speciesIdentities?.records

  if (dataset.mechanicsCoverage?.generation !== 7)
    return dataError('mechanics-coverage.json', 'expected Generation VII')
  if (!Number.isInteger(dataset.speciesIdentities?.version))
    return dataError('form-ids.json', 'missing identity version')
  if (!Number.isInteger(total) || total !== 809)
    return dataError('progression.json', 'expected 809 National Dex species')
  if (!Array.isArray(identities) || identities.length < total)
    return dataError('form-ids.json', 'species identity manifest is incomplete')
  if (dataset.pokedex.length !== identities.length)
    return dataError(
      'pokedex.json',
      'species count does not match form-ids.json',
    )
  if (!identities.every((record) => dataset.byId.has(record.id)))
    return dataError('pokedex.json', 'a pinned species identity is missing')
  if (!Object.keys(dataset.moves).length)
    return dataError('moves.json', 'move dataset is empty')
  if (!Object.keys(dataset.items).length)
    return dataError('items.json', 'item dataset is empty')

  for (let id = 1; id <= total; id++) {
    const identity = dataset.identityById.get(id)

    if (!identity || identity.dexNumber !== id || identity.formKey !== null)
      return dataError('form-ids.json', `invalid National Dex identity ${id}`)
  }

  return null
}

export const validateGeneratedData = (dataset = loadData()) => {
  return invalidGeneratedData(dataset) === null
}

export const generatedDataError = () => {
  try {
    return invalidGeneratedData(loadData())
  } catch (error) {
    return error
  }
}

export const loadValidatedData = () => {
  const dataset = loadData()
  const error = invalidGeneratedData(dataset)

  if (error) throw error

  return dataset
}

export const isDataReady = () => generatedDataError() === null

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
