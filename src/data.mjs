import { readFileSync } from 'node:fs'
import { dataFile } from './paths.mjs'

let cache = null
let pokedexCache = null

function read(name) {
  return JSON.parse(readFileSync(dataFile(name), 'utf8'))
}

export function loadPokedex() {
  pokedexCache ??= read('pokedex.json')
  return pokedexCache
}

export function loadData() {
  if (cache) return cache

  const pokedex = loadPokedex()
  cache = {
    pokedex,
    byId: new Map(pokedex.map((mon) => [mon.id, mon])),
    moves: read('moves.json'),
    types: read('types.json'),
    growth: read('growth.json'),
  }
  return cache
}

export function isDataReady() {
  try {
    loadData()
    return true
  } catch {
    return false
  }
}

export function species(id) {
  const mon = loadData().byId.get(id)
  if (!mon) throw new Error(`no Pokemon with id ${id}`)
  return mon
}

export function move(name) {
  const found = loadData().moves[name]
  if (!found) throw new Error(`no move named ${name}`)
  return found
}
