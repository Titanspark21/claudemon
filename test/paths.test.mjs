import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

process.env.CLAUDEMON_HOME = mkdtempSync(join(tmpdir(), 'claudemon-paths-'))

const { DATA_DIR, bundledDataFile, dataFile } = await import('../src/paths.mjs')

test('Should let a data file in the home win, and fall back to the bundled one when it is not there', () => {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(join(DATA_DIR, 'local-only.json'), '{}')

  expect(
    dataFile('local-only.json'),
    'a copy in the home takes precedence',
  ).toBe(join(DATA_DIR, 'local-only.json'))
  expect(
    dataFile('not-here.json'),
    'and without one it falls back to what ships',
  ).toBe(bundledDataFile('not-here.json'))
})
