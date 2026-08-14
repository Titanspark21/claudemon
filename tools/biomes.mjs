import { createHash } from 'node:crypto'
import {
  BIOME_IDS,
  BIOME_NAMES,
  BIOME_OVERRIDES,
  overrideFor,
} from './biomeOverrides.mjs'

export const BIOME_SEED = 'generation-vii-biomes-v1'

const SOURCE_WEIGHT = {
  location: 1_000_000,
  habitat: 10_000,
  type: 100,
  'egg-group': 10,
  family: 1,
}

const HABITAT_BIOMES = {
  cave: ['highlands', 'mystic-ruins'],
  forest: ['forest'],
  grassland: ['meadow'],
  mountain: ['highlands'],
  rare: ['mystic-ruins'],
  'rough-terrain': ['highlands', 'badlands'],
  sea: ['coast'],
  urban: ['city-powerworks'],
  'waters-edge': ['wetlands', 'coast'],
}

const TYPE_BIOMES = {
  normal: ['meadow', 'frostlands'],
  fighting: ['highlands', 'city-powerworks'],
  flying: ['meadow', 'highlands', 'coast'],
  poison: ['wetlands', 'city-powerworks', 'badlands'],
  ground: ['badlands', 'highlands', 'frostlands'],
  rock: ['highlands', 'badlands', 'frostlands'],
  bug: ['forest', 'meadow'],
  ghost: ['mystic-ruins', 'city-powerworks'],
  steel: ['city-powerworks', 'highlands', 'frostlands'],
  fire: ['badlands', 'highlands'],
  water: ['wetlands', 'coast', 'frostlands'],
  grass: ['forest', 'meadow', 'wetlands'],
  electric: ['city-powerworks', 'meadow'],
  psychic: ['mystic-ruins', 'city-powerworks'],
  ice: ['frostlands', 'coast', 'highlands'],
  dragon: ['highlands', 'mystic-ruins', 'badlands'],
  dark: ['mystic-ruins', 'city-powerworks', 'forest'],
  fairy: ['forest', 'mystic-ruins', 'meadow'],
}

const EGG_GROUP_BIOMES = {
  monster: ['highlands', 'badlands'],
  water1: ['wetlands', 'coast'],
  bug: ['forest'],
  flying: ['meadow', 'highlands'],
  field: ['meadow'],
  fairy: ['meadow', 'mystic-ruins'],
  grass: ['forest'],
  'human-like': ['city-powerworks', 'highlands'],
  water3: ['coast', 'wetlands'],
  mineral: ['highlands', 'city-powerworks'],
  amorphous: ['mystic-ruins', 'wetlands'],
  water2: ['coast'],
  ditto: ['meadow', 'city-powerworks', 'mystic-ruins'],
  dragon: ['highlands', 'mystic-ruins'],
}

const LOCATION_TOKENS = {
  frostlands: ['ice', 'snow', 'frost', 'glacier', 'seafoam'],
  'city-powerworks': ['city', 'town', 'mall', 'market'],
  'mystic-ruins': ['ruin', 'shrine', 'temple', 'tower', 'castle', 'ultra'],
  coast: ['sea', 'ocean', 'beach', 'bay', 'coast', 'shore', 'reef', 'island'],
  wetlands: [
    'marsh',
    'swamp',
    'wetland',
    'pond',
    'lake',
    'river',
    'brook',
    'canal',
  ],
  forest: ['forest', 'woods', 'jungle', 'grove'],
  badlands: ['desert', 'wasteland', 'volcano', 'crater', 'dune'],
  highlands: [
    'mount',
    'peak',
    'cliff',
    'canyon',
    'cave',
    'tunnel',
    'mine',
    'hill',
  ],
  meadow: ['meadow', 'field', 'ranch', 'farm', 'garden', 'park', 'flower'],
}

const mapped = (source, detail, biomes = []) =>
  biomes.map((biome) => ({ source, detail, biome }))

const locationBiomes = (name) => {
  const value = String(name ?? '').toLowerCase()
  return BIOME_IDS.filter((biome) =>
    LOCATION_TOKENS[biome].some((token) => value.includes(token)),
  )
}

export const biomeEvidence = (record, sources = {}) => {
  const evidence = []
  const seen = new Set()

  for (const location of sources.locations ?? []) {
    for (const biome of locationBiomes(location)) {
      const key = `${location}:${biome}`
      if (seen.has(key)) continue
      seen.add(key)
      evidence.push({ source: 'location', detail: location, biome })
    }
  }

  evidence.push(
    ...mapped('habitat', record.habitat, HABITAT_BIOMES[record.habitat]),
  )
  for (const type of record.types ?? [])
    evidence.push(...mapped('type', type, TYPE_BIOMES[type]))
  for (const group of record.eggGroups ?? [])
    evidence.push(...mapped('egg-group', group, EGG_GROUP_BIOMES[group]))
  for (const biome of sources.family ?? [])
    evidence.push({
      source: 'family',
      detail: sources.familyKey ?? 'family',
      biome,
    })
  return evidence
}

export const evidenceScore = (evidence, biome) =>
  evidence
    .filter((item) => item.biome === biome)
    .reduce((score, item) => score + (SOURCE_WEIGHT[item.source] ?? 0), 0)

const tieHash = (seed, recordId, biome) =>
  createHash('sha256').update(`${seed}:${recordId}:${biome}`).digest('hex')

const rankedBiomes = (record, evidence, seed) =>
  BIOME_IDS.map((biome) => ({
    biome,
    score: evidenceScore(evidence, biome),
    tie: tieHash(seed, record.id, biome),
  })).sort((a, b) => b.score - a.score || a.tie.localeCompare(b.tie))

export const assignBiomes = (
  record,
  evidence,
  overrides = BIOME_OVERRIDES,
  seed = BIOME_SEED,
) => {
  const override = overrideFor(record, overrides)
  if (override)
    return override.biomes.map((biome) => ({
      biome,
      affinity: Number.MAX_SAFE_INTEGER,
      evidence: [{ source: 'override', detail: override.reason, biome }],
      override: true,
    }))

  const ranked = rankedBiomes(record, evidence, seed)
  const supported = ranked.filter((entry) => entry.score > 0)
  const selected = (supported.length > 0 ? supported : ranked).slice(
    0,
    supported.length === 1 ? 1 : 2,
  )

  return selected.map(({ biome, score }) => ({
    biome,
    affinity: score,
    evidence: evidence.filter((item) => item.biome === biome),
    override: false,
  }))
}

const eligible = (record) => Boolean(record.collectible && !record.battleOnly)
const special = (record) => Boolean(record.legendary || record.mythical)

const familyRoot = (record, byId) => {
  let current =
    record.formKey === null ? record : (byId.get(record.baseSpecies) ?? record)
  const seen = new Set()
  for (let depth = 0; depth < 10; depth++) {
    if (!current?.evolvesFrom || seen.has(current.id)) break
    seen.add(current.id)
    current = byId.get(current.evolvesFrom) ?? current
  }
  return current?.id ?? record.baseSpecies ?? record.id
}

const poolLoads = (assignments) => {
  const loads = Object.fromEntries(BIOME_IDS.map((biome) => [biome, 0]))
  for (const assignment of assignments) {
    if (assignment.special) continue
    for (const item of assignment.biomes) loads[item.biome]++
  }
  return loads
}

const familyHints = (records, baseEvidence) => {
  const byId = new Map(records.map((record) => [record.id, record]))
  const hints = new Map()
  for (const record of records) {
    const root = familyRoot(record, byId)
    const evidence =
      baseEvidence.get(root) ?? baseEvidence.get(record.baseSpecies) ?? []
    const family = rankedBiomes(record, evidence, BIOME_SEED)
      .filter((entry) => entry.score > 0)
      .slice(0, 2)
      .map((entry) => entry.biome)
    hints.set(record.id, { family, familyKey: String(root) })
  }
  return hints
}

const balanceOrdinary = (assignments, evidenceById, seed) => {
  for (let pass = 0; pass < 20_000; pass++) {
    const loads = poolLoads(assignments)
    const order = BIOME_IDS.slice().sort(
      (a, b) => loads[a] - loads[b] || a.localeCompare(b),
    )
    const low = order[0]
    const high = order.at(-1)
    if (loads[high] - loads[low] <= 1) return

    const choices = assignments
      .filter((entry) => !entry.special && !entry.fixed)
      .filter((entry) => {
        const names = entry.biomes.map((item) => item.biome)
        const evidence = evidenceById.get(entry.id) ?? []
        return (
          names.includes(high) &&
          !names.includes(low) &&
          evidenceScore(evidence, low) > 0
        )
      })
    if (choices.length === 0) return

    choices.sort((a, b) => {
      const ea = evidenceById.get(a.id) ?? []
      const eb = evidenceById.get(b.id) ?? []
      const ca = evidenceScore(ea, high) - evidenceScore(ea, low)
      const cb = evidenceScore(eb, high) - evidenceScore(eb, low)
      return (
        ca - cb ||
        tieHash(seed, a.id, low).localeCompare(tieHash(seed, b.id, low))
      )
    })

    const chosen = choices[0]
    const evidence = evidenceById.get(chosen.id) ?? []
    chosen.biomes = chosen.biomes.map((item) =>
      item.biome === high
        ? {
            biome: low,
            affinity: evidenceScore(evidence, low),
            evidence: evidence.filter((candidate) => candidate.biome === low),
            override: false,
            balanced: true,
          }
        : item,
    )
  }
}

export const rarityBand = (record) => {
  if (special(record)) return 'special'
  if ((record.captureRate ?? 255) <= 25) return 'rare'
  if ((record.captureRate ?? 255) <= 75) return 'uncommon'
  return 'common'
}

export const generateBiomeAssignments = (
  records,
  locationSources = new Map(),
  options = {},
) => {
  const overrides = options.overrides ?? BIOME_OVERRIDES
  const seed = options.seed ?? BIOME_SEED
  const candidates = records.filter(eligible)
  const baseEvidence = new Map(
    candidates.map((record) => [
      record.id,
      biomeEvidence(record, {
        locations: locationSources.get(record.dexNumber) ?? [],
      }),
    ]),
  )
  const families = familyHints(candidates, baseEvidence)
  const evidenceById = new Map()
  const assignments = candidates.map((record) => {
    const evidence = biomeEvidence(record, {
      locations: locationSources.get(record.dexNumber) ?? [],
      ...(families.get(record.id) ?? {}),
    })
    evidenceById.set(record.id, evidence)
    return {
      id: record.id,
      sourceKey: record.sourceKey,
      baseSpecies: record.baseSpecies,
      formKey: record.formKey,
      collectible: record.collectible,
      battleOnly: record.battleOnly,
      special: special(record),
      legendary: Boolean(record.legendary),
      mythical: Boolean(record.mythical),
      rarity: rarityBand(record),
      fixed: Boolean(overrideFor(record, overrides)),
      biomes: assignBiomes(record, evidence, overrides, seed),
    }
  })
  balanceOrdinary(assignments, evidenceById, seed)
  return assignments.sort((a, b) => a.id - b.id)
}

export const scoreFamilyCoherence = (records, assignments) => {
  const byAssignment = new Map(assignments.map((entry) => [entry.id, entry]))
  const edges = []
  for (const record of records) {
    if (!record.evolvesFrom) continue
    const from = byAssignment.get(record.evolvesFrom)
    const to = byAssignment.get(record.id)
    if (!from || !to) continue
    const left = new Set(from.biomes.map((item) => item.biome))
    const shared = to.biomes
      .map((item) => item.biome)
      .filter((biome) => left.has(biome))
    edges.push({ from: record.evolvesFrom, to: record.id, shared })
  }
  const coherent = edges.filter((edge) => edge.shared.length > 0).length
  return {
    edges: edges.length,
    coherent,
    split: edges.length - coherent,
    ratio: edges.length === 0 ? 1 : coherent / edges.length,
    splits: edges.filter((edge) => edge.shared.length === 0),
  }
}

export const validateBiomePools = (records, assignments) => {
  const errors = []
  const byId = new Map(records.map((record) => [record.id, record]))
  const byAssignment = new Map(assignments.map((entry) => [entry.id, entry]))
  const eligibleRecords = records.filter(eligible)
  const ordinary = assignments.filter((entry) => !entry.special)
  const loads = poolLoads(assignments)
  const total = Object.values(loads).reduce((sum, count) => sum + count, 0)
  const expectedPoolSize = total / BIOME_IDS.length
  const averageMemberships = ordinary.length === 0 ? 0 : total / ordinary.length

  for (const record of eligibleRecords) {
    const assignment = byAssignment.get(record.id)
    if (!assignment) {
      errors.push(`unassigned eligible record ${record.sourceKey}`)
      continue
    }
    if (assignment.biomes.length < 1 || assignment.biomes.length > 3)
      errors.push(
        `${record.sourceKey} must have one to three biome memberships`,
      )
    const names = assignment.biomes.map((item) => item.biome)
    if (new Set(names).size !== names.length)
      errors.push(`${record.sourceKey} has duplicate biome memberships`)
    for (const biome of names)
      if (!BIOME_IDS.includes(biome))
        errors.push(`${record.sourceKey} has unknown biome ${biome}`)
  }

  for (const assignment of assignments) {
    const record = byId.get(assignment.id)
    if (!record)
      errors.push(`assignment references missing species ${assignment.id}`)
    else if (record.battleOnly)
      errors.push(`${record.sourceKey} leaked a battle-only record`)
    else if (assignment.special !== special(record))
      errors.push(`${record.sourceKey} has incorrect overlay classification`)
    else if (assignment.rarity !== rarityBand(record))
      errors.push(`${record.sourceKey} has incorrect rarity weighting band`)

    for (const item of assignment.biomes ?? []) {
      if (!item.override && (item.evidence?.length ?? 0) === 0)
        errors.push(
          `${record?.sourceKey ?? assignment.id} has an evidence-free biome membership`,
        )
    }
  }

  if (Math.abs(averageMemberships - 2) > 0.15)
    errors.push(
      `ordinary membership average ${averageMemberships.toFixed(3)} is not close to 2.0`,
    )

  for (const biome of BIOME_IDS) {
    const delta =
      expectedPoolSize === 0
        ? 0
        : Math.abs(loads[biome] - expectedPoolSize) / expectedPoolSize
    if (delta > 0.15)
      errors.push(
        `${biome} pool ${loads[biome]} is more than 15% from ${expectedPoolSize.toFixed(2)}`,
      )
  }

  return {
    valid: errors.length === 0,
    errors,
    counts: {
      eligible: eligibleRecords.length,
      ordinary: ordinary.length,
      special: assignments.length - ordinary.length,
      totalOrdinaryMemberships: total,
      averageMemberships,
      expectedPoolSize,
      pools: loads,
    },
  }
}

const publicEntry = (assignment, item) => ({
  id: assignment.id,
  sourceKey: assignment.sourceKey,
  baseSpecies: assignment.baseSpecies,
  formKey: assignment.formKey,
  collectible: assignment.collectible,
  affinity: item.affinity,
  rarity: assignment.rarity,
  evidence: item.evidence,
  override: Boolean(item.override),
})

export const buildBiomePools = (assignments, seed = BIOME_SEED) => {
  const biomes = BIOME_IDS.map((id) => ({
    id,
    name: BIOME_NAMES[id],
    ordinary: [],
    special: [],
  }))
  const byBiome = new Map(biomes.map((biome) => [biome.id, biome]))
  for (const assignment of assignments) {
    for (const item of assignment.biomes) {
      const target = byBiome.get(item.biome)
      const entry = publicEntry(assignment, item)
      if (assignment.special) target.special.push(entry)
      else target.ordinary.push(entry)
    }
  }
  for (const biome of biomes) {
    biome.ordinary.sort((a, b) => b.affinity - a.affinity || a.id - b.id)
    biome.special.sort((a, b) => b.affinity - a.affinity || a.id - b.id)
  }
  return { version: 1, seed, biomes }
}

export const buildBiomeReport = (records, assignments, validation) => {
  const coherence = scoreFamilyCoherence(records, assignments)
  const pools = buildBiomePools(assignments).biomes
  const overlap = { 1: 0, 2: 0, 3: 0 }
  const rarity = {}
  const evidenceSources = {}

  for (const assignment of assignments) {
    overlap[assignment.biomes.length] =
      (overlap[assignment.biomes.length] ?? 0) + 1
    rarity[assignment.rarity] =
      (rarity[assignment.rarity] ?? 0) + assignment.biomes.length
    for (const item of assignment.biomes) {
      for (const evidence of item.evidence) {
        evidenceSources[evidence.source] =
          (evidenceSources[evidence.source] ?? 0) + 1
      }
    }
  }

  const byId = new Map(records.map((record) => [record.id, record]))
  const unassigned = validation.errors
    .filter((error) => error.startsWith('unassigned eligible record '))
    .map((error) => error.replace('unassigned eligible record ', ''))
  const anomalies = validation.errors.filter(
    (error) =>
      error.includes('overlay') ||
      error.includes('rarity') ||
      error.includes('evidence-free'),
  )
  const lines = [
    '# Generation VII biome coverage report',
    '',
    `Seed: \`${BIOME_SEED}\``,
    '',
    `Eligible records: ${validation.counts.eligible}`,
    `Ordinary records: ${validation.counts.ordinary}`,
    `Special overlay records: ${validation.counts.special}`,
    `Ordinary memberships: ${validation.counts.totalOrdinaryMemberships}`,
    `Average memberships: ${validation.counts.averageMemberships.toFixed(3)}`,
    `Expected ordinary pool size: ${validation.counts.expectedPoolSize.toFixed(2)}`,
    '',
    '## Pools',
    '',
    '| Biome | Ordinary | Special |',
    '| --- | ---: | ---: |',
    ...pools.map(
      (pool) =>
        `| ${pool.name} | ${pool.ordinary.length} | ${pool.special.length} |`,
    ),
    '',
    '## Membership overlap',
    '',
    `One biome: ${overlap[1]}`,
    `Two biomes: ${overlap[2]}`,
    `Three biomes: ${overlap[3]}`,
    '',
    '## Unassigned records',
    '',
    ...(unassigned.length > 0
      ? unassigned.map((sourceKey) => `- ${sourceKey}`)
      : ['- none']),
    '',
    '## Family coherence',
    '',
    `Evolution edges: ${coherence.edges}`,
    `Coherent edges: ${coherence.coherent}`,
    `Family splits: ${coherence.split}`,
    `Coherence: ${(coherence.ratio * 100).toFixed(1)}%`,
    '',
    '### Split edges',
    '',
    ...(coherence.splits.length > 0
      ? coherence.splits.map((edge) => {
          const from = byId.get(edge.from)?.sourceKey ?? edge.from
          const to = byId.get(edge.to)?.sourceKey ?? edge.to
          return `- ${from} -> ${to}`
        })
      : ['- none']),
    '',
    '## Evidence sources',
    '',
    ...Object.entries(evidenceSources)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([source, count]) => `- ${source}: ${count}`),
    '',
    '## Rarity bands',
    '',
    ...Object.entries(rarity)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([band, count]) => `- ${band}: ${count}`),
    '',
    '## Manual overrides',
    '',
    ...assignments
      .filter((entry) => entry.fixed)
      .map((entry) => {
        const reason =
          entry.biomes
            .flatMap((item) => item.evidence)
            .find((evidence) => evidence.source === 'override')?.detail ??
          'curated'
        return `- ${entry.sourceKey}: ${entry.biomes.map((item) => item.biome).join(', ')} — ${reason}`
      }),
    '',
    '## Anomalies',
    '',
    ...(anomalies.length > 0
      ? anomalies.map((error) => `- ${error}`)
      : ['- none']),
    '',
    '## Validation',
    '',
    validation.valid
      ? 'Zero validation errors.'
      : validation.errors.map((error) => `- ${error}`).join('\n'),
    '',
  ]
  return lines.join('\n')
}
