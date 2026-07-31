// Loads the generated dataset, once per process.
//
// The companion is long-lived, so everything is read on first use and kept. It is
// about 125 KB of JSON, which is nothing to hold and saves re-reading it every turn.

import { readFileSync } from 'node:fs'
import { dataFile } from './paths.mjs'

let cache = null
let pokedexCache = null

function read(name) {
  return JSON.parse(readFileSync(dataFile(name), 'utf8'))
}

/**
 * Just the Pokedex.
 *
 * Cached on its own because the prompt hook is a one-shot process that needs
 * nothing else: making it go through {@link loadData} would have it parse the
 * moves, types and growth curves on every prompt for no reason.
 */
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
