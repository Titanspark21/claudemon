import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { loadGenerationSource } from './sourceManifest.mjs'

export const COVERAGE_STATUSES = [
  'supported',
  'no-effect-in-singles',
  'blocked-by-excluded-system',
  'deferred-complex-one-off',
]

const COVERAGE_KINDS = ['abilities', 'items', 'moves']
const SINGULAR_KIND = { abilities: 'ability', items: 'item', moves: 'move' }
const singularKind = (kind) => SINGULAR_KIND[kind] ?? String(kind)
const normalizeKey = (key) =>
  String(key ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const bundledJson = (name) =>
  JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'))

const keysOf = (records) => {
  if (records instanceof Set) return [...records].map(String)
  if (Array.isArray(records))
    return records.map((record) =>
      typeof record === 'string'
        ? record
        : String(record?.id ?? record?.key ?? ''),
    )
  if (records && typeof records === 'object') return Object.keys(records)

  return []
}

const normalizedIndex = (records) =>
  new Map(
    keysOf(records)
      .filter(Boolean)
      .map((key) => [normalizeKey(key), key]),
  )

const entryFor = (records, key) => {
  if (!records || typeof records !== 'object') return null
  if (key in records) return records[key]

  const wanted = normalizeKey(key)
  const match = Object.keys(records).find(
    (candidate) => normalizeKey(candidate) === wanted,
  )

  return match ? records[match] : null
}

export const loadCoverageManifest = () => bundledJson('mechanics-coverage.json')

export const loadCoverageDataset = () => {
  const source = loadGenerationSource(7)

  return {
    moves: bundledJson('moves.json'),
    abilities: source.abilities,
    items: source.items,
    species: bundledJson('pokedex.json'),
  }
}

export const coverageFor = (kind, key, coverage = loadCoverageManifest()) => {
  const plural = String(kind).endsWith('s') ? String(kind) : `${kind}s`

  if (!COVERAGE_KINDS.includes(plural)) return null

  return entryFor(coverage[plural], key)
}

const addCoverageShapeErrors = (errors, coverage, expected) => {
  for (const kind of COVERAGE_KINDS) {
    const records = coverage?.[kind]
    const expectedKeys = keysOf(expected[kind])
    const expectedNormalized = new Set(expectedKeys.map(normalizeKey))

    if (!records || Array.isArray(records) || typeof records !== 'object') {
      errors.push(`${kind} coverage must be an object keyed by imported record`)
      continue
    }

    for (const key of expectedKeys) {
      const entry = entryFor(records, key)
      const label = `${singularKind(kind)} ${key}`

      if (!entry) {
        errors.push(`${label} is unclassified`)
        continue
      }

      if (!COVERAGE_STATUSES.includes(entry.status))
        errors.push(`${label} has invalid status ${String(entry.status)}`)
      if (typeof entry.source !== 'string' || entry.source.trim().length === 0)
        errors.push(`${label} has no source`)

      if (entry.status === 'supported') {
        if (
          typeof entry.handler !== 'string' ||
          entry.handler.trim().length === 0
        )
          errors.push(`${label} is supported without a handler`)
      } else if (
        typeof entry.reason !== 'string' ||
        entry.reason.trim().length === 0
      ) {
        errors.push(`${label} ${entry.status ?? 'exclusion'} has no reason`)
      }
    }

    for (const key of Object.keys(records)) {
      if (!expectedNormalized.has(normalizeKey(key)))
        errors.push(`${singularKind(kind)} ${key} is a stale coverage entry`)
    }
  }
}

const addSpeciesReferenceErrors = (errors, dataset) => {
  const species = dataset.species ?? []
  const speciesIds = new Set(species.map((record) => record.id))
  const abilityKeys = normalizedIndex(dataset.abilities)
  const itemKeys = normalizedIndex(dataset.items)
  const moveKeys = normalizedIndex(dataset.moves)

  for (const record of species) {
    const label = record.sourceKey ?? record.name ?? `species ${record.id}`

    if (record.baseSpecies != null && !speciesIds.has(record.baseSpecies))
      errors.push(
        `${label} references unknown base species ${record.baseSpecies}`,
      )

    for (const slot of record.abilities ?? []) {
      if (!abilityKeys.has(normalizeKey(slot.ability)))
        errors.push(`${label} references unknown ability ${slot.ability}`)
    }

    for (const entry of record.learnset ?? []) {
      if (!moveKeys.has(normalizeKey(entry.move)))
        errors.push(`${label} references unknown move ${entry.move}`)
    }

    for (const evolution of record.evolutions ?? []) {
      if (!speciesIds.has(evolution.to))
        errors.push(`${label} evolves to unknown species ${evolution.to}`)
      if (evolution.item && !itemKeys.has(normalizeKey(evolution.item)))
        errors.push(`${label} references unknown item ${evolution.item}`)
      if (
        evolution.conditions?.heldItem &&
        !itemKeys.has(normalizeKey(evolution.conditions.heldItem))
      )
        errors.push(
          `${label} references unknown held item ${evolution.conditions.heldItem}`,
        )
      if (
        evolution.conditions?.move &&
        !moveKeys.has(normalizeKey(evolution.conditions.move))
      )
        errors.push(
          `${label} references unknown evolution move ${evolution.conditions.move}`,
        )
    }
  }
}

const coverageCounts = (dataset, coverage) => {
  return Object.fromEntries(
    COVERAGE_KINDS.map((kind) => {
      const counts = Object.fromEntries(
        COVERAGE_STATUSES.map((status) => [status, 0]),
      )

      for (const key of keysOf(dataset[kind])) {
        const entry = entryFor(coverage?.[kind], key)
        if (entry && entry.status in counts) counts[entry.status]++
      }

      return [kind, { total: keysOf(dataset[kind]).length, ...counts }]
    }),
  )
}

export const validateCoverage = (dataset, coverage) => {
  const errors = []

  if (coverage?.generation !== 7)
    errors.push(
      `coverage generation must be 7, got ${String(coverage?.generation)}`,
    )

  addCoverageShapeErrors(errors, coverage, dataset)
  addSpeciesReferenceErrors(errors, dataset)

  return {
    valid: errors.length === 0,
    errors,
    counts: coverageCounts(dataset, coverage),
  }
}

export const coverageReport = (dataset, coverage) => {
  const result = validateCoverage(dataset, coverage)
  const lines = ['Mechanics coverage · Generation VII']

  for (const kind of COVERAGE_KINDS) {
    const counts = result.counts[kind]
    lines.push(
      `${kind}: ${counts.total} total · ${counts.supported} supported · ` +
        `${counts['no-effect-in-singles']} singles-no-effect · ` +
        `${counts['blocked-by-excluded-system']} blocked · ` +
        `${counts['deferred-complex-one-off']} deferred`,
    )
  }

  lines.push(result.valid ? 'gaps: 0' : `gaps: ${result.errors.length}`)

  if (!result.valid)
    lines.push(...result.errors.slice(0, 40).map((error) => `- ${error}`))

  return lines.join('\n')
}

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url

if (isMain) {
  const dataset = loadCoverageDataset()
  const coverage = loadCoverageManifest()
  const report = coverageReport(dataset, coverage)
  const result = validateCoverage(dataset, coverage)

  console.log(report)
  if (!result.valid) process.exitCode = 1
}
