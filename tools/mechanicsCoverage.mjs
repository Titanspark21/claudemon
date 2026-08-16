import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolveMoveRuntimeCoverage } from '../src/moveRuntimeCoverage.mjs'
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

export const significantFieldKnownFailures =
  loadCoverageManifest().significantFieldKnownFailures ?? []

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

const moveRuntimeResult = (dataset, coverage, key) => {
  const entry = entryFor(coverage?.moves, key)
  const record = entryFor(dataset.moves, key)

  if (entry?.status !== 'supported' || !record) return null

  return resolveMoveRuntimeCoverage({ ...record, key })
}

const addMoveRuntimeErrors = (errors, coverage, dataset) => {
  for (const key of keysOf(dataset.moves)) {
    const entry = entryFor(coverage?.moves, key)
    if (entry?.status !== 'supported') continue

    const runtime = moveRuntimeResult(dataset, coverage, key)

    if (!runtime?.executable) {
      errors.push(
        `move ${key} is supported but runtime handler ${entry.handler} does not resolve to executable code`,
      )
      continue
    }

    if (runtime.handler !== entry.handler) {
      errors.push(
        `move ${key} coverage handler ${entry.handler} disagrees with runtime handler ${runtime.handler}`,
      )
      continue
    }

    if (
      typeof runtime.focusedTest !== 'string' ||
      runtime.focusedTest.trim().length === 0
    )
      errors.push(`move ${key} has executable code without a focused test`)
  }
}

const moveRuntimeCounts = (dataset, coverage) => {
  const counts = {
    unclassified: 0,
    falseSupported: 0,
    executableWithoutFocusedTest: 0,
  }

  for (const key of keysOf(dataset.moves)) {
    const entry = entryFor(coverage?.moves, key)

    if (!entry) {
      counts.unclassified++
      continue
    }

    if (entry.status !== 'supported') continue

    const runtime = moveRuntimeResult(dataset, coverage, key)
    if (!runtime?.executable || runtime.handler !== entry.handler) {
      counts.falseSupported++
      continue
    }

    if (!runtime.focusedTest) counts.executableWithoutFocusedTest++
  }

  return counts
}

const addSignificantFieldKnownFailureErrors = (errors, coverage, dataset) => {
  const failures = coverage?.significantFieldKnownFailures

  if (!Array.isArray(failures)) {
    errors.push('significantFieldKnownFailures must be an array')
    return
  }

  const moveKeys = normalizedIndex(dataset.moves)

  for (const [index, failure] of failures.entries()) {
    const label = `significantFieldKnownFailures[${index}]`

    if (typeof failure?.field !== 'string' || failure.field.trim().length === 0)
      errors.push(`${label} has no field`)
    if (
      typeof failure?.reason !== 'string' ||
      failure.reason.trim().length === 0
    )
      errors.push(`${label} has no reason`)
    if (!Array.isArray(failure?.moves) || failure.moves.length === 0) {
      errors.push(`${label} has no moves`)
      continue
    }

    for (const key of failure.moves) {
      if (!moveKeys.has(normalizeKey(key)))
        errors.push(`${label} references unknown move ${key}`)
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
  addMoveRuntimeErrors(errors, coverage, dataset)
  addSignificantFieldKnownFailureErrors(errors, coverage, dataset)
  addSpeciesReferenceErrors(errors, dataset)

  return {
    valid: errors.length === 0,
    errors,
    counts: coverageCounts(dataset, coverage),
    moveRuntime: moveRuntimeCounts(dataset, coverage),
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

  lines.push(
    `move runtime: ${result.moveRuntime.unclassified} unclassified · ` +
      `${result.moveRuntime.falseSupported} false-supported · ` +
      `${result.moveRuntime.executableWithoutFocusedTest} executable-without-focused-test`,
  )
  lines.push(result.valid ? 'gaps: 0' : `gaps: ${result.errors.length}`)

  if (!result.valid)
    lines.push(...result.errors.slice(0, 40).map((error) => `- ${error}`))

  return lines.join('\n')
}

const markdownCell = (value) =>
  String(value ?? '—')
    .replaceAll('|', '\\|')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ')

const moveReportClassification = (entry) => {
  if (entry?.status === 'supported') return 'Executable'
  if (entry?.status === 'deferred-complex-one-off') return 'Deferred'
  if (entry) return 'Intentionally unavailable'
  return 'Unclassified'
}

export const moveCoverageReport = (dataset, coverage) => {
  const result = validateCoverage(dataset, coverage)
  const moveCounts = result.counts.moves
  const lines = [
    '<!-- Generated by `npm run mechanics:coverage:write`. Do not edit by hand. -->',
    '',
    '# Generation VII move coverage',
    '',
    `Imported moves: ${moveCounts.total}. Executable: ${moveCounts.supported}. ` +
      `Intentionally unavailable: ${
        moveCounts['no-effect-in-singles'] +
        moveCounts['blocked-by-excluded-system']
      }. Deferred: ${moveCounts['deferred-complex-one-off']}.`,
    '',
    `Validation: ${result.moveRuntime.unclassified} unclassified, ` +
      `${result.moveRuntime.falseSupported} false-supported, ` +
      `${result.moveRuntime.executableWithoutFocusedTest} executable without a focused test.`,
    '',
    '| Move | Classification | Handler | Player-facing reason / runtime evidence | Focused test |',
    '| --- | --- | --- | --- | --- |',
  ]

  for (const key of keysOf(dataset.moves).sort((a, b) => a.localeCompare(b))) {
    const entry = entryFor(coverage?.moves, key)
    const runtime = moveRuntimeResult(dataset, coverage, key)
    const handler = entry?.status === 'supported' ? entry.handler : '—'
    const reason =
      entry?.status === 'supported'
        ? `Runtime handler ${runtime?.handler ?? 'missing'} resolves to executable code.`
        : (entry?.reason ?? 'No coverage classification exists.')
    const focusedTest =
      entry?.status === 'supported' ? (runtime?.focusedTest ?? '—') : '—'

    lines.push(
      `| ${markdownCell(key)} | ${markdownCell(
        moveReportClassification(entry),
      )} | ${markdownCell(handler)} | ${markdownCell(reason)} | ${markdownCell(
        focusedTest,
      )} |`,
    )
  }

  return `${lines.join('\n')}\n`
}

export const generatedReportMatches = (actual, expected) => {
  if (actual === null) return false

  return actual.replace(/\r\n/g, '\n') === expected.replace(/\r\n/g, '\n')
}

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url

if (isMain) {
  const dataset = loadCoverageDataset()
  const coverage = loadCoverageManifest()
  const report = coverageReport(dataset, coverage)
  const result = validateCoverage(dataset, coverage)
  const moveReportUrl = new URL(
    '../data/move-coverage-report.md',
    import.meta.url,
  )
  const expectedMoveReport = moveCoverageReport(dataset, coverage)

  if (process.argv.includes('--write'))
    writeFileSync(moveReportUrl, expectedMoveReport, 'utf8')

  const checkedMoveReport = (() => {
    try {
      return readFileSync(moveReportUrl, 'utf8')
    } catch {
      return null
    }
  })()

  const reportMatches = generatedReportMatches(
    checkedMoveReport,
    expectedMoveReport,
  )

  console.log(report)
  console.log(`move report: ${reportMatches ? 'checked' : 'out of date'}`)
  if (!result.valid || !reportMatches) process.exitCode = 1
}
