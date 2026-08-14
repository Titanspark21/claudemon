import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Generations } from '@pkmn/data'
import { Dex } from '@pkmn/dex'
import { BUNDLED_DATA_DIR, bundledDataFile, DATA_DIR } from '../src/paths.mjs'
import { bold, brightGreen, dim } from '../src/ui/ansi.mjs'
import { pass as runPass } from './progress.mjs'
import { buildItemRecords, loadItemCoverage } from './itemData.mjs'
import {
  buildBiomePools,
  buildBiomeReport,
  generateBiomeAssignments,
  validateBiomePools,
} from './biomes.mjs'
import {
  buildEvolutionRules,
  buildSpeciesRecord,
  transformRequestWriteGrowth,
  transformRequestWriteMoves,
  transformRequestWritePokedex,
  transformRequestWriteTypes,
  transformResponseEncounterLocations,
  transformResponseEvolutionChain,
  transformResponseGrowthRate,
  transformResponsePokemon,
  transformResponseSpecies,
  validateSpeciesDataset,
} from './transformers.mjs'
import {
  CONCURRENCY,
  DATASET_BUILDING_HEADING,
  DATASET_READY_HEADING,
  LABEL_WIDTH,
  MAX_ATTEMPTS,
  MIN_REQUEST_INTERVAL_MS,
  NATIONAL_DEX,
  OUTPUTS,
  POKEAPI_URL,
  RETRY_BACKOFF_MS,
  THROTTLE_BACKOFF_MS,
} from './constants.mjs'

const CACHE_DIR = join(DATA_DIR, '.cache')
const useCache = !process.argv.includes('--no-cache')
const force = process.argv.includes('--force') || !useCache
const identityManifest = JSON.parse(
  readFileSync(bundledDataFile('form-ids.json'), 'utf8'),
)
const GEN_VII_VERSIONS = new Set([
  'red',
  'blue',
  'yellow',
  'gold',
  'silver',
  'crystal',
  'ruby',
  'sapphire',
  'emerald',
  'firered',
  'leafgreen',
  'diamond',
  'pearl',
  'platinum',
  'heartgold',
  'soulsilver',
  'black',
  'white',
  'black-2',
  'white-2',
  'x',
  'y',
  'omega-ruby',
  'alpha-sapphire',
  'sun',
  'moon',
  'ultra-sun',
  'ultra-moon',
  'lets-go-pikachu',
  'lets-go-eevee',
])

let requests = 0
let cacheHits = 0
let throttled = 0
let nextSlot = 0
let cooldownUntil = 0

const datasetPresent = () => {
  if (OUTPUTS.some((name) => !existsSync(bundledDataFile(name)))) return false

  try {
    return (
      JSON.parse(readFileSync(bundledDataFile('pokedex.json'), 'utf8'))
        .length === identityManifest.records.length
    )
  } catch {
    return false
  }
}

const cachePath = (url) => {
  return join(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.json`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForSlot = async () => {
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

const getJson = async (url, transform) => {
  const cached = cachePath(url)

  if (useCache && existsSync(cached)) {
    cacheHits++

    return transform(JSON.parse(readFileSync(cached, 'utf8')))
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await waitForSlot()

      const response = await fetch(url)

      if (response.status === 429 || response.status === 503) {
        const after = Number(response.headers.get('retry-after'))
        const pause =
          Number.isFinite(after) && after > 0
            ? after * 1000
            : THROTTLE_BACKOFF_MS * attempt ** 2
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

      return transform(body)
    } catch (error) {
      if (attempt === MAX_ATTEMPTS)
        throw new Error(`${url}: ${error.message}`, { cause: error })

      await sleep(RETRY_BACKOFF_MS * attempt ** 2)
    }
  }

  throw new Error(`${url}: gave up after ${MAX_ATTEMPTS} attempts`)
}

const pass = (label, items, worker) => {
  return runPass(label, items, worker, CONCURRENCY)
}

const slug = (value) => {
  return String(value)
    .replace(/♀/g, '-f')
    .replace(/♂/g, '-m')
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

const readLevelLearnset = async (generation, sourceKey, baseSourceKey) => {
  let source = await generation.learnsets.get(sourceKey)

  if (Object.keys(source?.learnset ?? {}).length === 0)
    source = await Dex.learnsets.get(sourceKey)

  if (
    Object.keys(source?.learnset ?? {}).length === 0 &&
    baseSourceKey &&
    baseSourceKey !== sourceKey
  )
    source =
      (await generation.learnsets.get(baseSourceKey)) ??
      (await Dex.learnsets.get(baseSourceKey))

  const learnset = []

  for (const [moveId, methods] of Object.entries(source?.learnset ?? {})) {
    const move = generation.moves.get(moveId)

    if (!move?.exists) continue

    const moveName = slug(move.name)

    for (const method of methods) {
      const match = /^7L(\d+)$/.exec(method)

      if (!match) continue

      learnset.push({ level: Number(match[1]), move: moveName })
    }
  }

  const distinct = new Map()

  for (const entry of learnset)
    distinct.set(`${entry.level}:${entry.move}`, entry)

  return [...distinct.values()].sort(
    (a, b) => a.level - b.level || a.move.localeCompare(b.move),
  )
}

const statusName = (status) => {
  return {
    brn: 'burn',
    frz: 'freeze',
    par: 'paralysis',
    psn: 'poison',
    slp: 'sleep',
    tox: 'poison',
  }[status]
}

const showdownStatKey = (key) => {
  return (
    {
      atk: 'attack',
      def: 'defense',
      spa: 'spAttack',
      spd: 'spDefense',
      spe: 'speed',
    }[key] ?? key
  )
}

const moveAilment = (move) => {
  const secondary = Array.isArray(move.secondaries)
    ? move.secondaries.find((entry) => entry.status || entry.volatileStatus)
    : move.secondary
  const status = move.status ?? secondary?.status

  if (statusName(status)) return statusName(status)
  const volatile = move.volatileStatus ?? secondary?.volatileStatus

  if (volatile === 'confusion') return 'confusion'
  if (volatile === 'partiallytrapped') return 'trap'
  if (volatile === 'leechseed') return 'leech-seed'
  if (volatile === 'disable') return 'disable'

  return null
}

const moveChance = (move, predicate) => {
  const secondaries =
    move.secondaries ?? (move.secondary ? [move.secondary] : [])
  const secondary = secondaries.find(predicate)

  return secondary?.chance ?? null
}

const moveStatChanges = (move) => {
  const changes = []

  for (const [stat, change] of Object.entries(move.boosts ?? {}))
    changes.push({ stat: showdownStatKey(stat), change })

  if (changes.length > 0) return changes

  const secondaries =
    move.secondaries ?? (move.secondary ? [move.secondary] : [])
  const secondary = secondaries.find((entry) => entry.boosts)

  for (const [stat, change] of Object.entries(secondary?.boosts ?? {}))
    changes.push({ stat: showdownStatKey(stat), change })

  return changes
}

const ratioPercent = (ratio) => {
  if (!Array.isArray(ratio) || ratio.length !== 2 || ratio[1] === 0) return null

  return Math.round((ratio[0] / ratio[1]) * 100)
}

const runtimeMove = (move) => {
  const multihit = Array.isArray(move.multihit) ? move.multihit : null
  const flags = Object.keys(move.flags ?? {})
    .filter((key) => move.flags[key])
    .sort()
  const fixedDamage =
    Number.isFinite(move.damage) || move.damage === 'level' ? move.damage : null

  return {
    name: move.name,
    type: move.type.toLowerCase(),
    power:
      move.category === 'Status' ||
      !Number.isFinite(move.basePower) ||
      move.basePower <= 0
        ? null
        : move.basePower,
    accuracy: move.accuracy === true ? null : move.accuracy,
    pp: move.pp,
    priority: move.priority ?? 0,
    damage_class: move.category.toLowerCase(),
    ailment: moveAilment(move),
    ailment_chance: move.volatileStatus
      ? 100
      : moveChance(move, (entry) =>
          Boolean(entry.status || entry.volatileStatus === 'confusion'),
        ),
    stat_chance: moveChance(move, (entry) => Boolean(entry.boosts)),
    stat_changes: moveStatChanges(move),
    target: move.target,
    min_hits: multihit?.[0] ?? null,
    max_hits: multihit?.[1] ?? null,
    drain: move.recoil ? -ratioPercent(move.recoil) : ratioPercent(move.drain),
    healing: ratioPercent(move.heal),
    flinch_chance: moveChance(
      move,
      (entry) => entry.volatileStatus === 'flinch',
    ),
    crit_rate: Math.max(0, (move.critRatio ?? 1) - 1),
    flags,
    fixed_damage: fixedDamage,
    ohko: Boolean(move.ohko),
  }
}

const runtimeTypes = (generation) => {
  const typeRecords = [...generation.types].filter((type) => type.exists)
  const allowed = new Set(typeRecords.map((type) => type.name))
  const out = {}

  for (const type of typeRecords) {
    const relations = {
      double_damage_to: [],
      half_damage_to: [],
      no_damage_to: [],
    }

    for (const [target, multiplier] of Object.entries(
      type.effectiveness ?? {},
    )) {
      if (!allowed.has(target)) continue

      const key = target.toLowerCase()

      if (multiplier === 2) relations.double_damage_to.push(key)
      else if (multiplier === 0.5) relations.half_damage_to.push(key)
      else if (multiplier === 0) relations.no_damage_to.push(key)
    }

    relations.double_damage_to.sort()
    relations.half_damage_to.sort()
    relations.no_damage_to.sort()
    out[type.name.toLowerCase()] = relations
  }

  return out
}

const pokeApiEdges = (chains) => {
  const edges = new Set()

  const visit = (link) => {
    const match = /\/(\d+)\/?$/.exec(link.species?.url ?? '')
    const from = match ? Number(match[1]) : null

    for (const next of link.evolves_to ?? []) {
      const nextMatch = /\/(\d+)\/?$/.exec(next.species?.url ?? '')
      const to = nextMatch ? Number(nextMatch[1]) : null

      if (from && to) edges.add(`${from}:${to}`)
      visit(next)
    }
  }

  for (const chain of chains) visit(chain.chain)

  return edges
}

const applyEvolutionRules = (records, rules) => {
  const byId = new Map(records.map((record) => [record.id, record]))
  const incoming = new Map()

  for (const rule of rules) {
    byId.get(rule.from)?.evolutions.push({
      to: rule.to,
      trigger: rule.trigger,
      level: rule.level,
      item: rule.item,
      conditions: rule.conditions,
      substitute: rule.substitute,
    })

    if (!incoming.has(rule.to)) incoming.set(rule.to, rule.from)
  }

  const stageOf = (id, seen = new Set()) => {
    if (seen.has(id)) return 0

    const from = incoming.get(id)

    if (!from) return 0

    seen.add(id)

    return Math.min(2, stageOf(from, seen) + 1)
  }

  for (const record of records) {
    record.evolvesFrom = incoming.get(record.id) ?? null
    record.stage = stageOf(record.id)
    record.evolutions.sort((a, b) => a.to - b.to)
  }
}

const main = async () => {
  if (!force && datasetPresent()) {
    console.log(bold(DATASET_READY_HEADING))

    for (const name of OUTPUTS) {
      if (existsSync(bundledDataFile(name)))
        console.log(`  ${brightGreen('✔')} ${name}`)
    }

    console.log(dim(`\n  ${BUNDLED_DATA_DIR}`))
    console.log(
      `\n  Rebuild it with ${bold('--force')}, or refetch PokéAPI metadata with ${bold('--no-cache')}.\n`,
    )

    return
  }

  mkdirSync(CACHE_DIR, { recursive: true })
  mkdirSync(BUNDLED_DATA_DIR, { recursive: true })

  console.log(bold(DATASET_BUILDING_HEADING))

  const generation = new Generations(Dex).get(7)
  const identities = identityManifest.records
  const baseIds = Array.from({ length: NATIONAL_DEX }, (_, index) => index + 1)

  if (
    identities.filter((record) => record.formKey === null).length !==
    NATIONAL_DEX
  )
    throw new Error(
      'form-ids.json does not contain 809 National Dex identities',
    )

  const [pokemon, species, encounters] = await Promise.all([
    pass(
      'pokemon metadata',
      baseIds.map((id) => `${POKEAPI_URL}/pokemon/${id}`),
      (url) => getJson(url, transformResponsePokemon),
    ),
    pass(
      'species metadata',
      baseIds.map((id) => `${POKEAPI_URL}/pokemon-species/${id}`),
      (url) => getJson(url, transformResponseSpecies),
    ),
    pass(
      'encounter evidence',
      baseIds.map((id) => `${POKEAPI_URL}/pokemon/${id}/encounters`),
      (url) => getJson(url, transformResponseEncounterLocations),
    ),
  ])

  const pokemonById = new Map(pokemon.map((entry) => [entry.id, entry]))
  const speciesById = new Map(baseIds.map((id, index) => [id, species[index]]))
  const locationsByDex = new Map(
    baseIds.map((id, index) => [
      id,
      [
        ...new Set(
          encounters[index]
            .filter((entry) =>
              entry.versions.some((version) => GEN_VII_VERSIONS.has(version)),
            )
            .map((entry) => entry.locationArea)
            .filter(Boolean),
        ),
      ],
    ]),
  )
  const chainUrls = [
    ...new Set(
      species.map((entry) => entry.evolution_chain?.url).filter(Boolean),
    ),
  ]
  const chains = await pass('evolution evidence', chainUrls, (url) =>
    getJson(url, transformResponseEvolutionChain),
  )

  const baseIdentityById = new Map(
    identities
      .filter((identity) => identity.formKey === null)
      .map((identity) => [identity.id, identity]),
  )

  const included = await Promise.all(
    identities.map(async (identity) => {
      let source = generation.species.get(identity.sourceKey)

      if (!source?.exists) source = Dex.species.get(identity.sourceKey)

      if (!source?.exists || source.gen > 7)
        throw new Error(
          `Pinned Gen VII source is missing ${identity.sourceKey}`,
        )

      const baseSourceKey = baseIdentityById.get(
        identity.baseSpecies,
      )?.sourceKey
      const learnset = await readLevelLearnset(
        generation,
        identity.sourceKey,
        baseSourceKey,
      )

      return {
        identity,
        pkmnRecord: { ...JSON.parse(JSON.stringify(source)), learnset },
      }
    }),
  )

  const records = included.map(({ identity, pkmnRecord }) => {
    const metadata = {
      ...speciesById.get(identity.dexNumber),
      base_experience: pokemonById.get(identity.dexNumber)?.base_experience,
    }

    return buildSpeciesRecord(pkmnRecord, metadata, identity)
  })

  const recordById = new Map(records.map((record) => [record.id, record]))

  for (const record of records) {
    if (record.learnset.length === 0 && record.baseSpecies !== record.id) {
      const base = recordById.get(record.baseSpecies)
      if (base && base.learnset.length > 0)
        record.learnset = base.learnset.slice()
    }
  }

  const rules = buildEvolutionRules(null, included)
  applyEvolutionRules(records, rules)

  const moveNames = [
    ...new Set(
      records.flatMap((record) => record.learnset.map((entry) => entry.move)),
    ),
  ].sort()
  const moves = {}

  for (const key of moveNames) {
    const source = [...generation.moves].find((move) => slug(move.name) === key)

    if (!source?.exists) throw new Error(`Missing Gen VII move source: ${key}`)

    moves[key] = runtimeMove(source)
  }

  const types = runtimeTypes(generation)
  const growthNames = [
    ...new Set(species.map((entry) => entry.growth_rate.name)),
  ].sort()
  const growthData = await pass('exp curves', growthNames, (name) =>
    getJson(`${POKEAPI_URL}/growth-rate/${name}`, transformResponseGrowthRate),
  )
  const growth = {}

  for (const curve of growthData) {
    const table = new Array(101).fill(0)

    for (const step of curve.levels) table[step.level] = step.experience

    growth[curve.name] = table
  }

  const pokedex = transformRequestWritePokedex(records)
  const moveOutput = transformRequestWriteMoves(moves)
  const typeOutput = transformRequestWriteTypes(types)
  const growthOutput = transformRequestWriteGrowth(growth)
  const itemOutput = buildItemRecords(
    [...generation.items].filter((entry) => entry.exists),
    loadItemCoverage(),
  )
  const sourceAbilities = new Set(
    [...generation.abilities].map((entry) => entry.id),
  )
  const sourceItems = new Set([...generation.items].map((entry) => entry.id))
  const validation = validateSpeciesDataset(pokedex, {
    types: Object.keys(typeOutput),
    moves: Object.keys(moveOutput),
    abilities: sourceAbilities,
    items: sourceItems,
    growth: Object.keys(growthOutput),
  })

  if (!validation.valid)
    throw new Error(
      `Generated dataset failed validation:\n${validation.errors.slice(0, 40).join('\n')}`,
    )

  const biomeAssignments = generateBiomeAssignments(pokedex, locationsByDex)
  const biomeValidation = validateBiomePools(pokedex, biomeAssignments)

  if (!biomeValidation.valid)
    throw new Error(
      `Generated biome pools failed validation:\n${biomeValidation.errors.slice(0, 40).join('\n')}`,
    )

  const biomeOutput = buildBiomePools(biomeAssignments)
  const biomeReport = buildBiomeReport(
    pokedex,
    biomeAssignments,
    biomeValidation,
  )

  const evidence = pokeApiEdges(chains)
  const unconfirmed = rules.filter((rule) => {
    const from = identities.find((identity) => identity.id === rule.from)
    const to = identities.find((identity) => identity.id === rule.to)

    return !evidence.has(`${from.dexNumber}:${to.dexNumber}`)
  })
  const audit = {
    generation: 7,
    nationalDex: { first: 1, last: NATIONAL_DEX, count: NATIONAL_DEX },
    ...validation.counts,
    references: {
      types: Object.keys(typeOutput).length,
      moves: Object.keys(moveOutput).length,
      abilities: sourceAbilities.size,
      items: sourceItems.size,
      growthCurves: Object.keys(growthOutput).length,
    },
    biomes: biomeValidation.counts,
    pokeApi: {
      speciesRecords: species.length,
      pokemonRecords: pokemon.length,
      evolutionChains: chains.length,
      confirmedEvolutionRules: rules.length - unconfirmed.length,
      unconfirmedEvolutionRules: unconfirmed.map((rule) => ({
        from: rule.from,
        to: rule.to,
      })),
    },
  }
  const outputs = [
    ['pokedex.json', pokedex],
    ['moves.json', moveOutput],
    ['items.json', itemOutput],
    ['types.json', typeOutput],
    ['growth.json', growthOutput],
    ['generation-vii-audit.json', audit],
    ['biomes.json', biomeOutput],
  ]

  console.log()

  for (const [name, value] of outputs) {
    const json = JSON.stringify(value)

    writeFileSync(bundledDataFile(name), json)

    const kb = (Buffer.byteLength(json) / 1024).toFixed(0)

    console.log(
      `  ${brightGreen('✔')} ${name.padEnd(LABEL_WIDTH)} ${dim(`${kb} KB`)}`,
    )
  }

  writeFileSync(bundledDataFile('biome-report.md'), biomeReport)
  console.log(
    `  ${brightGreen('✔')} ${'biome-report.md'.padEnd(LABEL_WIDTH)} ${dim(`${(Buffer.byteLength(biomeReport) / 1024).toFixed(0)} KB`)}`,
  )

  console.log(
    `\n  ${requests} requests, ${cacheHits} served from cache` +
      (throttled > 0 ? `, ${throttled} asked to slow down` : ''),
    dim(`\n  ${BUNDLED_DATA_DIR}\n`),
  )
}

await main()
