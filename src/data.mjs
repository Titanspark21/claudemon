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
    types: read('types.json'),
    growth: read('growth.json'),
    biomes: read('biomes.json'),
  }

  return cache
}

export const loadPokedex = () => loadData().pokedex

export const isDataReady = () => {
  try {
    loadData()

    return true
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
