import { test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.CLAUDEMON_HOME = mkdtempSync(join(tmpdir(), 'claudemon-log-'))

const { DATA_DIR, LOG_FILE, dataFile, bundledDataFile } =
  await import('../src/paths.mjs')
const { logError, logNote } = await import('../src/log.mjs')

const readLog = () => {
  try {
    return readFileSync(LOG_FILE, 'utf8')
  } catch {
    return ''
  }
}

test('a note is written with the moment it happened in front of it', () => {
  logNote('somewhere', 'a thing happened')

  const line = readLog().trim()
  assert.match(line, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z somewhere a thing happened$/)
})

test('an error is written with its stack, not just its name', () => {
  const before = readLog().length
  logError('while doing', new Error('it broke'))

  const written = readLog().slice(before)
  assert.match(written, /while doing/)
  assert.match(written, /it broke/)
  assert.match(written, /at /, 'the stack is the point of logging an error')
})

test('something thrown that is not an error is still written down', () => {
  const before = readLog().length
  logError('while doing', 'a bare string')

  assert.match(readLog().slice(before), /while doing a bare string/)
})

test('logging nothing at all does not throw', () => {
  const before = readLog().length
  logError('while doing', null)
  logError('while doing', undefined)

  assert.ok(readLog().length > before, 'both should still leave a line')
})

test('lines pile up rather than replacing each other', () => {
  const before = readLog().split('\n').length
  logNote('a', 'one')
  logNote('b', 'two')

  assert.equal(readLog().split('\n').length, before + 2)
})

test('a data file in the home wins, and one that is not there falls back', () => {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(join(DATA_DIR, 'local-only.json'), '{}')

  assert.equal(
    dataFile('local-only.json'),
    join(DATA_DIR, 'local-only.json'),
    'a copy in the home takes precedence',
  )
  assert.equal(
    dataFile('not-here.json'),
    bundledDataFile('not-here.json'),
    'and without one it falls back to what ships',
  )
})

// Last, because it loads a second copy of the module against a home that
// cannot be written to. The paths are read once when the module loads, so
// moving CLAUDEMON_HOME afterwards would change nothing at all.
test('a log that cannot be written is swallowed, not thrown', async () => {
  const home = process.env.CLAUDEMON_HOME
  const blocked = join(
    mkdtempSync(join(tmpdir(), 'claudemon-log-blocked-')),
    'a-file-not-a-directory',
  )
  writeFileSync(blocked, '')
  process.env.CLAUDEMON_HOME = blocked

  vi.resetModules()
  const fresh = await import('../src/log.mjs')

  assert.doesNotThrow(() => fresh.logNote('somewhere', 'into a wall'))
  assert.doesNotThrow(() => fresh.logError('somewhere', new Error('unheard')))

  process.env.CLAUDEMON_HOME = home
})
