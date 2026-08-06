import { readFileSync } from 'node:fs'
import { dataFile } from './paths.mjs'

let cache = null

const read = (name) => JSON.parse(readFileSync(dataFile(name), 'utf8'))

export const loadData = () => {
  if (cache) return cache

  const pokedex = read('pokedex.json')

  cache = {
    pokedex,
    byId: new Map(pokedex.map((mon) => [mon.id, mon])),
    moves: read('moves.json'),
    types: read('types.json'),
    growth: read('growth.json'),
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

export const move = (name) => {
  const found = loadData().moves[name]

  if (!found) throw new Error(`no move named ${name}`)

  return found
}
