import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.CLAUDEMON_HOME = mkdtempSync(join(tmpdir(), 'claudemon-status-'))

const { STATUS_FILE } = await import('../src/paths.mjs')
const { companionIsLive, readStatus, writeStatus } =
  await import('../src/status.mjs')

function clearStatus() {
  try {
    rmSync(STATUS_FILE)
  } catch {}
}

test('no status file yet reads as nothing, not as a crash', () => {
  clearStatus()

  assert.equal(readStatus(), null)
})

test('a half-written status reads as nothing too', () => {
  writeFileSync(STATUS_FILE, '{"session":')

  assert.equal(readStatus(), null, 'a torn file is not worth throwing over')
})

test('what is written comes back, stamped with the moment it went out', () => {
  clearStatus()
  const before = Date.now()
  writeStatus({ session: 'abc', state: 'working' })
  const after = Date.now()

  const read = readStatus()
  assert.equal(read.session, 'abc')
  assert.equal(read.state, 'working')
  assert.ok(
    read.heartbeat >= before && read.heartbeat <= after,
    'the heartbeat is stamped on the way out, not by the caller',
  )
})

test('a heartbeat the caller supplies is overruled by the real one', () => {
  clearStatus()
  writeStatus({ session: 'abc', heartbeat: 1 })

  assert.ok(readStatus().heartbeat > 1, 'you do not get to fake being alive')
})

test('each write replaces the last, leaving one file behind', () => {
  clearStatus()
  writeStatus({ session: 'first' })
  writeStatus({ session: 'second' })

  assert.equal(readStatus().session, 'second')
  assert.equal(
    JSON.parse(readFileSync(STATUS_FILE, 'utf8')).session,
    'second',
    'the rename lands on the real path',
  )
})

test('a companion is live only while its heartbeat is recent', () => {
  assert.equal(companionIsLive(null), false, 'nobody there')
  assert.equal(companionIsLive({}), false, 'no heartbeat at all')
  assert.equal(companionIsLive({ heartbeat: 0 }), false, 'a zero is not a beat')

  assert.equal(companionIsLive({ heartbeat: Date.now() }), true)
  assert.equal(companionIsLive({ heartbeat: Date.now() - 14_000 }), true)
  assert.equal(
    companionIsLive({ heartbeat: Date.now() - 16_000 }),
    false,
    'fifteen seconds of silence and it is gone',
  )
})

test('a status just written is live by its own reckoning', () => {
  clearStatus()
  writeStatus({ session: 'abc' })

  assert.equal(companionIsLive(readStatus()), true)
})
