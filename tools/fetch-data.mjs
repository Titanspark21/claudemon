import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { BUNDLED_DATA_DIR, bundledDataFile, DATA_DIR } from '../src/paths.mjs'
import { bold, brightGreen, dim } from '../src/ui/ansi.mjs'
import { pass as runPass } from './lib.mjs'

const API = 'https://pokeapi.co/api/v2'
const CACHE_DIR = join(DATA_DIR, '.cache')
const CONCURRENCY = 8
const KANTO = 151

const VERSION_GROUP = 'red-blue'

const useCache = !process.argv.includes('--no-cache')
const force = process.argv.includes('--force') || !useCache

const OUTPUTS = ['pokedex.json', 'moves.json', 'types.json', 'growth.json']

let requests = 0
let cacheHits = 0
let throttled = 0

function datasetPresent() {
  try {
    for (const name of OUTPUTS) {
      const value = JSON.parse(readFileSync(bundledDataFile(name), 'utf8'))
      if (name === 'pokedex.json' && value.length !== KANTO) return false
    }
    return true
  } catch {
    return false
  }
}

function cachePath(url) {
  return join(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.json`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let nextSlot = 0
let cooldownUntil = 0

const MIN_REQUEST_INTERVAL_MS = 150

async function waitForSlot() {
  const slot = Math.max(Date.now(), nextSlot, cooldownUntil)
  nextSlot = slot + MIN_REQUEST_INTERVAL_MS

  for (
    let delay = slot - Date.now();
    delay > 0;
    delay = cooldownUntil - Date.now()
  ) {
    await sleep(delay)
  }
}

async function getJson(url) {
  const cached = cachePath(url)
  if (useCache && existsSync(cached)) {
    cacheHits++
    return JSON.parse(readFileSync(cached, 'utf8'))
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await waitForSlot()

      const response = await fetch(url)

      if (response.status === 429 || response.status === 503) {
        const after = Number(response.headers.get('retry-after'))
        const pause =
          Number.isFinite(after) && after > 0
            ? after * 1000
            : 2000 * attempt ** 2
        cooldownUntil = Math.max(cooldownUntil, Date.now() + pause)
        throttled++
        throw new Error(
          `HTTP ${response.status}, waiting ${Math.round(pause / 1000)}s`,
        )
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json()
      requests++
      writeFileSync(cached, JSON.stringify(body))
      return body
    } catch (error) {
      if (attempt === 5)
        throw new Error(`${url}: ${error.message}`, { cause: error })
      await sleep(300 * attempt ** 2)
    }
  }
}

const pass = (label, items, worker) =>
  runPass(label, items, worker, CONCURRENCY)

const STAT_KEYS = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'spAttack',
  'special-defense': 'spDefense',
  speed: 'speed',
}

function readStats(entry) {
  const stats = {}
  for (const item of entry.stats) {
    const key = STAT_KEYS[item.stat.name]
    if (key) stats[key] = item.base_stat
  }
  return stats
}

function readLearnset(entry) {
  const learnset = []
  for (const item of entry.moves) {
    for (const detail of item.version_group_details) {
      if (detail.version_group.name !== VERSION_GROUP) continue
      if (detail.move_learn_method.name !== 'level-up') continue
      learnset.push({ level: detail.level_learned_at, move: item.move.name })
    }
  }
  learnset.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move))
  return learnset
}

function idFromUrl(url) {
  const match = /\/(\d+)\/?$/.exec(url)
  return match ? Number(match[1]) : null
}

function readEvolutions(chain, out = new Map()) {
  const fromId = idFromUrl(chain.species.url)

  for (const next of chain.evolves_to) {
    const toId = idFromUrl(next.species.url)
    const detail = next.evolution_details[0] ?? {}

    const evolution = {
      to: toId,
      trigger: detail.trigger?.name ?? 'level-up',
      level: detail.min_level ?? null,
      item: detail.item?.name ?? null,
    }

    if (!out.has(fromId)) out.set(fromId, [])
    out.get(fromId).push(evolution)
    readEvolutions(next, out)
  }
  return out
}

async function main() {
  if (!force && datasetPresent()) {
    console.log(bold('\nThe claudemon dataset is already built\n'))
    for (const name of OUTPUTS) console.log(`  ${brightGreen('✔')} ${name}`)
    console.log(dim(`\n  ${BUNDLED_DATA_DIR}`))
    console.log(
      `\n  Rebuild it with ${bold('--force')}, or refetch from PokeAPI with ${bold('--no-cache')}.\n`,
    )
    return
  }

  mkdirSync(CACHE_DIR, { recursive: true })
  mkdirSync(BUNDLED_DATA_DIR, { recursive: true })
  console.log(bold('\nBuilding the claudemon dataset\n'))

  const ids = Array.from({ length: KANTO }, (_, i) => i + 1)

  const both = await pass(
    'pokemon',
    [
      ...ids.map((id) => `${API}/pokemon/${id}`),
      ...ids.map((id) => `${API}/pokemon-species/${id}`),
    ],
    (url) => getJson(url),
  )
  const pokemon = both.slice(0, ids.length)
  const species = both.slice(ids.length)

  const chainUrls = [
    ...new Set(species.map((entry) => entry.evolution_chain.url)),
  ]
  const chains = await pass('evolutions', chainUrls, (url) => getJson(url))

  const fullEvolutions = new Map()
  for (const chain of chains) readEvolutions(chain.chain, fullEvolutions)

  const evolutions = new Map()
  for (const [fromId, list] of fullEvolutions) {
    if (fromId > KANTO) continue
    const withinKanto = list.filter((evolution) => evolution.to <= KANTO)
    if (withinKanto.length > 0) evolutions.set(fromId, withinKanto)
  }

  const learnsets = pokemon.map(readLearnset)
  const moveNames = [
    ...new Set(learnsets.flat().map((item) => item.move)),
  ].sort()
  const moveData = await pass('moves', moveNames, (name) =>
    getJson(`${API}/move/${name}`),
  )

  const typeNames = [
    ...new Set([
      ...pokemon.flatMap((entry) => entry.types.map((item) => item.type.name)),
      ...moveData.map((move) => move.type.name),
    ]),
  ].sort()
  const typeData = await pass('types', typeNames, (name) =>
    getJson(`${API}/type/${name}`),
  )

  const growthNames = [
    ...new Set(species.map((entry) => entry.growth_rate.name)),
  ].sort()
  const growthData = await pass('exp curves', growthNames, (name) =>
    getJson(`${API}/growth-rate/${name}`),
  )

  const evolvesFrom = new Map()
  for (const [fromId, list] of evolutions) {
    for (const evolution of list) evolvesFrom.set(evolution.to, fromId)
  }

  function stageOf(id) {
    let stage = 0
    let cursor = id
    while (evolvesFrom.has(cursor) && stage < 2) {
      cursor = evolvesFrom.get(cursor)
      stage++
    }
    return stage
  }

  const pokedex = pokemon.map((entry, index) => {
    const speciesEntry = species[index]
    return {
      id: entry.id,
      name: speciesEntry.name.replace(/^./, (c) => c.toUpperCase()),
      types: entry.types
        .sort((a, b) => a.slot - b.slot)
        .map((item) => item.type.name),
      stats: readStats(entry),
      baseExp: entry.base_experience,
      captureRate: speciesEntry.capture_rate,
      growthRate: speciesEntry.growth_rate.name,
      genderRate: speciesEntry.gender_rate,
      stage: stageOf(entry.id),
      evolvesFrom: evolvesFrom.get(entry.id) ?? null,
      evolutions: evolutions.get(entry.id) ?? [],
      legendary: speciesEntry.is_legendary || speciesEntry.is_mythical,
      learnset: learnsets[index],
    }
  })

  const moves = {}
  for (const move of moveData) {
    moves[move.name] = {
      name: move.names.find((n) => n.language.name === 'en')?.name ?? move.name,
      type: move.type.name,
      power: move.power,
      accuracy: move.accuracy,
      pp: move.pp,
      priority: move.priority,
      damageClass: move.damage_class.name,
      ailment:
        move.meta?.ailment?.name && move.meta.ailment.name !== 'none'
          ? move.meta.ailment.name
          : null,
      ailmentChance: move.meta?.ailment_chance || null,
      statChance: move.meta?.stat_chance || null,
      statChanges: move.stat_changes.map((change) => ({
        stat: STAT_KEYS[change.stat.name] ?? change.stat.name,
        change: change.change,
      })),
      target: move.target.name,
      minHits: move.meta?.min_hits ?? null,
      maxHits: move.meta?.max_hits ?? null,
      drain: move.meta?.drain || null,
      healing: move.meta?.healing || null,
      flinchChance: move.meta?.flinch_chance || null,
      critRate: move.meta?.crit_rate || 0,
    }
  }

  const types = {}
  for (const type of typeData) {
    const relations = type.damage_relations
    types[type.name] = {
      double: relations.double_damage_to.map((t) => t.name),
      half: relations.half_damage_to.map((t) => t.name),
      zero: relations.no_damage_to.map((t) => t.name),
    }
  }

  const growth = {}
  for (const curve of growthData) {
    const table = new Array(101).fill(0)
    for (const step of curve.levels) table[step.level] = step.experience
    growth[curve.name] = table
  }

  const outputs = [
    ['pokedex.json', pokedex],
    ['moves.json', moves],
    ['types.json', types],
    ['growth.json', growth],
  ]

  console.log()
  for (const [name, value] of outputs) {
    writeFileSync(bundledDataFile(name), JSON.stringify(value))
    const kb = (Buffer.byteLength(JSON.stringify(value)) / 1024).toFixed(0)
    console.log(`  ${brightGreen('✔')} ${name.padEnd(14)} ${dim(`${kb} KB`)}`)
  }

  console.log(
    `\n  ${requests} requests, ${cacheHits} served from cache` +
      (throttled > 0 ? `, ${throttled} asked to slow down` : ''),
    dim(`\n  ${BUNDLED_DATA_DIR}\n`),
  )
}

await main()
