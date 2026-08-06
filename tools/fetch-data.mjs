// Rebuilds the dataset the repo ships, from PokeAPI into ./data.
//
// Nobody installing claudemon needs to run this: those four JSON files are in the
// repo, which is why installing touches PokeAPI only for sprites. This is the tool
// that regenerates them — roughly 500 requests, cached on disk so reruns cost
// nothing. Commit the result.
//
//   node tools/fetch-data.mjs
//   node tools/fetch-data.mjs --force      rebuild even if the dataset is there
//   node tools/fetch-data.mjs --no-cache   ignore the cache and refetch (implies --force)
//
// A dataset already on disk is left alone, so this is safe to call unconditionally
// from an installer or a doctor command. The HTTP cache below already made reruns
// free of network, but not of work: rebuilding parses ~52 MB of cached responses to
// produce bytes identical to the ones already there.
//
// Deliberate simplification: move power and the type chart come from the current
// generation rather than Gen 1's, which had its own quirks (Bite was Normal,
// Psychic had no Ghost matchup). Movesets and levels are the real Red/Blue ones.

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

/** The version group whose level-up movesets we want. */
const VERSION_GROUP = 'red-blue'

const useCache = !process.argv.includes('--no-cache')
// Asking to bypass the HTTP cache can only mean you want the thing rebuilt, so it
// would be perverse to then skip the build because the old output is still there.
const force = process.argv.includes('--force') || !useCache

/** The files the game reads. All four have to be good for a build to count as done. */
const OUTPUTS = ['pokedex.json', 'moves.json', 'types.json', 'growth.json']

let requests = 0
let cacheHits = 0
let throttled = 0

/**
 * Whether a usable dataset is already on disk.
 *
 * Parsed rather than merely stat'd: a run killed halfway through the writes leaves
 * a truncated file behind, and skipping the rebuild because a *broken* file exists
 * is the one failure mode this guard must not have. The Pokedex length is checked
 * for the same reason — it is what every other file is indexed against, so a short
 * one means the run that wrote it did not finish.
 */
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

/**
 * The earliest the next request may leave, and the earliest *any* of them may.
 *
 * Two separate brakes. The interval paces a build that is ~500 requests long, so the
 * pool of 8 trickles rather than bursts: PokeAPI publishes no limit any more, but it
 * answers from a CDN that will start refusing a flood, and being refused halfway
 * through is worse than taking a minute longer. The cooldown is the reaction to
 * actually being refused, and it is global on purpose — backing off in the one worker
 * that got the 429 while the other seven keep knocking is how one 429 becomes a ban.
 */
let nextSlot = 0
let cooldownUntil = 0

/** One request every this often, across the whole pool. */
const MIN_REQUEST_INTERVAL_MS = 150

/** Waits for this request's turn, and for any cooldown in force when it arrives. */
async function waitForSlot() {
  const slot = Math.max(Date.now(), nextSlot, cooldownUntil)
  nextSlot = slot + MIN_REQUEST_INTERVAL_MS

  // A refusal landing while we wait moves the line, so re-check rather than sleeping
  // once against a deadline that has since moved.
  for (let delay = slot - Date.now(); delay > 0; delay = cooldownUntil - Date.now()) {
    await sleep(delay)
  }
}

/** Fetches JSON, memoised on disk. PokeAPI data is static, so the cache never expires. */
async function getJson(url) {
  const cached = cachePath(url)
  if (useCache && existsSync(cached)) {
    cacheHits++
    return JSON.parse(readFileSync(cached, 'utf8'))
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      // Inside the retry loop: a request that is being retried has to queue again
      // like any other, or a failing URL becomes the one thing not being paced.
      await waitForSlot()

      const response = await fetch(url)

      // Being told to slow down is not a transport error, and it comes with an
      // answer to "how long": prefer what the server says over anything we guess.
      if (response.status === 429 || response.status === 503) {
        const after = Number(response.headers.get('retry-after'))
        const pause = Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * attempt ** 2
        cooldownUntil = Math.max(cooldownUntil, Date.now() + pause)
        throttled++
        throw new Error(`HTTP ${response.status}, waiting ${Math.round(pause / 1000)}s`)
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json()
      requests++
      writeFileSync(cached, JSON.stringify(body))
      return body
    } catch (error) {
      // The message names the URL, which the original does not; the cause keeps the
      // stack of whatever actually failed — a DNS error reads nothing like a 500.
      if (attempt === 5) throw new Error(`${url}: ${error.message}`, { cause: error })
      await sleep(300 * attempt ** 2)
    }
  }
}

/** Every pass here shares one connection budget. */
const pass = (label, items, worker) => runPass(label, items, worker, CONCURRENCY)

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

/** The Red/Blue level-up moveset, earliest first. */
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

/**
 * Flattens an evolution chain into "who becomes what, and how".
 *
 * Only the conditions Kanto actually uses: a level, a stone, or trading. Eevee is
 * the reason this returns a list rather than a single target.
 */
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

  // Neither pass needs the other, so run them as one: 302 URLs sharing a single
  // pool of 8 rather than two pools of 8 taking turns.
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

  // One chain covers a whole family, so fetch each only once.
  const chainUrls = [...new Set(species.map((entry) => entry.evolution_chain.url))]
  const chains = await pass('evolutions', chainUrls, (url) => getJson(url))

  const fullEvolutions = new Map()
  for (const chain of chains) readEvolutions(chain.chain, fullEvolutions)

  // Chains span every generation: Pichu evolves into Pikachu, Golbat into Crobat.
  // Anything leaving the first 151 has to go, and not only to avoid dangling ids —
  // keeping Pichu would make Pikachu a first evolution, which would gate it out of
  // early encounters entirely.
  const evolutions = new Map()
  for (const [fromId, list] of fullEvolutions) {
    if (fromId > KANTO) continue
    const withinKanto = list.filter((evolution) => evolution.to <= KANTO)
    if (withinKanto.length > 0) evolutions.set(fromId, withinKanto)
  }

  // Only the moves that are actually reachable in Red/Blue by levelling.
  const learnsets = pokemon.map(readLearnset)
  const moveNames = [...new Set(learnsets.flat().map((item) => item.move))].sort()
  const moveData = await pass('moves', moveNames, (name) => getJson(`${API}/move/${name}`))

  // The chart needs every type a *move* can be, not just the ones Kanto Pokemon
  // have. Bite is Dark and no Kanto Pokemon is, so building this from the Pokedex
  // alone would leave the engine unable to work out Bite's effectiveness.
  const typeNames = [
    ...new Set([
      ...pokemon.flatMap((entry) => entry.types.map((item) => item.type.name)),
      ...moveData.map((move) => move.type.name),
    ]),
  ].sort()
  const typeData = await pass('types', typeNames, (name) => getJson(`${API}/type/${name}`))

  const growthNames = [...new Set(species.map((entry) => entry.growth_rate.name))].sort()
  const growthData = await pass('exp curves', growthNames, (name) =>
    getJson(`${API}/growth-rate/${name}`),
  )

  // --- Pokedex -------------------------------------------------------------

  const evolvesFrom = new Map()
  for (const [fromId, list] of evolutions) {
    for (const evolution of list) evolvesFrom.set(evolution.to, fromId)
  }

  /** 0 for a base form, 1 for a first evolution, 2 for a second. */
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
      types: entry.types.sort((a, b) => a.slot - b.slot).map((item) => item.type.name),
      stats: readStats(entry),
      baseExp: entry.base_experience,
      captureRate: speciesEntry.capture_rate,
      growthRate: speciesEntry.growth_rate.name,
      // Eighths of a chance of being female, or -1 for the ones with no gender at
      // all. Kept as PokeAPI states it rather than as a percentage: the game derives
      // gender from it by comparing against an IV, which wants the eighths.
      genderRate: speciesEntry.gender_rate,
      stage: stageOf(entry.id),
      evolvesFrom: evolvesFrom.get(entry.id) ?? null,
      evolutions: evolutions.get(entry.id) ?? [],
      legendary: speciesEntry.is_legendary || speciesEntry.is_mythical,
      learnset: learnsets[index],
    }
  })

  // --- Moves ---------------------------------------------------------------

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
      // 'none' just means the move inflicts no status; store null instead.
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

  // --- Type chart ----------------------------------------------------------

  const types = {}
  for (const type of typeData) {
    const relations = type.damage_relations
    types[type.name] = {
      double: relations.double_damage_to.map((t) => t.name),
      half: relations.half_damage_to.map((t) => t.name),
      zero: relations.no_damage_to.map((t) => t.name),
    }
  }

  // --- Experience curves ---------------------------------------------------

  const growth = {}
  for (const curve of growthData) {
    // Index by level: slot 0 is unused so growth[rate][level] reads naturally.
    const table = new Array(101).fill(0)
    for (const step of curve.levels) table[step.level] = step.experience
    growth[curve.name] = table
  }

  // --- Write ---------------------------------------------------------------

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
