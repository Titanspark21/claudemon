import { expect, test } from 'vitest'
import { replaceEncounterSimulationReport } from './encounterSimulation.mjs'

test.each(['\n', '\r\n'])(
  'replaces an existing encounter simulation section with %j line endings',
  (lineEnding) => {
    const existing = [
      '# Biome report',
      '',
      'Generated assignments.',
      '',
      '## Encounter simulation',
      '',
      'old report',
    ].join(lineEnding)

    const next = replaceEncounterSimulationReport(
      existing,
      '## Encounter simulation\n\nnew report',
    )

    expect(next).toBe(
      '# Biome report\n\nGenerated assignments.\n\n## Encounter simulation\n\nnew report',
    )
    expect(next.match(/## Encounter simulation/g)).toHaveLength(1)
  },
)
