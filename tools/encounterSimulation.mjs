import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { BIOME_IDS } from '../src/constants.mjs'
import { speciesTableFromDex } from '../src/encounter.mjs'
import { bundledDataFile } from '../src/paths.mjs'
import { makeRng, weightedPick } from '../src/rng.mjs'

export const ENCOUNTER_SIMULATION_DRAWS = 1_000_000
export const ENCOUNTER_SIMULATION_SEED = 0x6b8b4567

const readJson = (name) =>
  JSON.parse(readFileSync(bundledDataFile(name), 'utf8'))

const percentile = (values, fraction) => {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.floor(fraction * sorted.length),
  )

  return sorted[index]
}

const familyRoot = (record, byId) => {
  let current = record
  const seen = new Set()

  if (record.formKey !== null && record.formKey !== undefined) {
    current = byId.get(record.baseSpecies) ?? record
  }

  while (current?.evolvesFrom && !seen.has(current.id)) {
    seen.add(current.id)
    current = byId.get(current.evolvesFrom) ?? current
  }

  return current?.id ?? record.id
}

const distributionFor = (dex, biomeData, biome, draws, seed) => {
  const table = speciesTableFromDex(dex, { leadLevel: 100, biome }, biomeData)
  const generatedPool = biomeData.biomes?.find((entry) => entry.id === biome)
  const byId = new Map(dex.map((record) => [record.id, record]))
  const counts = new Map(table.map((entry) => [entry.id, 0]))
  const rng = makeRng(seed)

  for (let index = 0; index < draws; index++) {
    const chosen = weightedPick(rng, table, (entry) => entry.weight)

    counts.set(chosen.id, counts.get(chosen.id) + 1)
  }

  let specialRolls = 0
  const familyCounts = new Map()
  const shares = []

  for (const [id, count] of counts) {
    if (count === 0) continue

    const record = byId.get(id)

    if (!record) continue
    if (record.legendary || record.mythical) specialRolls += count

    const root = familyRoot(record, byId)
    familyCounts.set(root, (familyCounts.get(root) ?? 0) + count)
    shares.push(count / draws)
  }

  const families = [...familyCounts.entries()].sort((a, b) => b[1] - a[1])
  const topFamilies = families.slice(0, 3).map(([id, count]) => {
    const name = byId.get(id)?.name ?? String(id)
    const percent = ((count / draws) * 100).toFixed(2)

    return `${name} ${percent}%`
  })

  return {
    biome,
    draws,
    ordinaryPool: generatedPool?.ordinary?.length ?? 0,
    pool: table.length,
    unique: [...counts.values()].filter((count) => count > 0).length,
    shareP10: percentile(shares, 0.1),
    shareP50: percentile(shares, 0.5),
    shareP90: percentile(shares, 0.9),
    specialRate: specialRolls / draws,
    families: familyCounts.size,
    topFamilies,
  }
}

const percent = (value, digits = 3) => `${(value * 100).toFixed(digits)}%`

export const simulateBiomeEncounters = ({
  dex = readJson('pokedex.json'),
  biomeData = readJson('biomes.json'),
  draws = ENCOUNTER_SIMULATION_DRAWS,
  seed = ENCOUNTER_SIMULATION_SEED,
} = {}) => {
  const base = Math.floor(draws / BIOME_IDS.length)
  let remainder = draws - base * BIOME_IDS.length
  const rows = []

  for (const [index, biome] of BIOME_IDS.entries()) {
    const biomeDraws = base + (remainder > 0 ? 1 : 0)

    if (remainder > 0) remainder--

    rows.push(
      distributionFor(
        dex,
        biomeData,
        biome,
        biomeDraws,
        (seed + index * 0x9e3779b9) >>> 0,
      ),
    )
  }

  const expectedPoolSize =
    rows.reduce((sum, row) => sum + row.ordinaryPool, 0) / rows.length
  const outsideBreadthTarget = rows.filter((row) => {
    if (expectedPoolSize === 0) return true

    return (
      Math.abs(row.ordinaryPool - expectedPoolSize) / expectedPoolSize > 0.15
    )
  })

  if (outsideBreadthTarget.length > 0) {
    throw new Error(
      `biome encounter pools outside SPEC breadth target: ${outsideBreadthTarget
        .map((row) => row.biome)
        .join(', ')}`,
    )
  }

  return rows
}

export const encounterSimulationReport = (rows) => {
  const total = rows.reduce((sum, row) => sum + row.draws, 0)
  const expectedPoolSize =
    rows.reduce((sum, row) => sum + row.ordinaryPool, 0) / rows.length
  const minimumPoolSize = expectedPoolSize * 0.85
  const maximumPoolSize = expectedPoolSize * 1.15
  const lines = [
    '## Encounter simulation',
    '',
    `Seed: \`${ENCOUNTER_SIMULATION_SEED}\``,
    `Seeded species rolls: ${total}`,
    `SPEC ordinary-pool target: ${expectedPoolSize.toFixed(2)} (${minimumPoolSize.toFixed(2)}–${maximumPoolSize.toFixed(2)}, ±15%)`,
    '',
    '| Biome | Rolls | Ordinary pool | Total pool | Unique seen | Species share p10 / p50 / p90 | Legendary + mythical | Families | Top families |',
    '| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |',
  ]

  for (const row of rows) {
    lines.push(
      `| ${row.biome} | ${row.draws} | ${row.ordinaryPool} | ${row.pool} | ${row.unique} | ${percent(row.shareP10)} / ${percent(row.shareP50)} / ${percent(row.shareP90)} | ${percent(row.specialRate)} | ${row.families} | ${row.topFamilies.join(', ')} |`,
    )
  }

  lines.push(
    '',
    'All nine ordinary pools remain within the derived SPEC ±15% breadth target.',
    '',
  )

  return lines.join('\n')
}

export const writeEncounterSimulationReport = () => {
  const reportPath = bundledDataFile('biome-report.md')
  const existing = readFileSync(reportPath, 'utf8')
  const marker = '\n## Encounter simulation\n'
  const base = existing.includes(marker)
    ? existing.split(marker)[0].trimEnd()
    : existing.trimEnd()
  const rows = simulateBiomeEncounters()
  const report = `${base}\n\n${encounterSimulationReport(rows)}`

  writeFileSync(reportPath, report)

  return rows
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = writeEncounterSimulationReport()
  const total = rows.reduce((sum, row) => sum + row.draws, 0)

  console.log(`Simulated ${total} seeded biome encounters.`)
  for (const row of rows) {
    console.log(
      `${row.biome}: ${row.unique}/${row.pool} species, ${percent(row.specialRate)} legendary/mythical`,
    )
  }
}
