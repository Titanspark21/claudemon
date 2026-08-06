import { test, vi, beforeEach, afterEach } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

// A player has to be found on PATH before any of the spawning code runs, and
// which one depends on the platform: afplay on a Mac, paplay and friends on
// Linux. Left to the host, this file would cover a different half of the
// module on every machine. So the player is planted here, and the spawn it
// leads to is a fake — no audio, no child, and the same lines covered
// wherever it runs.
const { spawned } = vi.hoisted(() => ({ spawned: [] }))

vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    spawn: (command, args, options) => {
      const child = new EventEmitter()
      child.killed = false
      child.unref = () => {}
      child.kill = () => {
        child.killed = true
        return true
      }
      spawned.push({ command, args, options, child })
      return child
    },
  }
})

process.env.CLAUDEMON_HOME = mkdtempSync(join(tmpdir(), 'claudemon-player-'))

const FAKE_BIN = mkdtempSync(join(tmpdir(), 'claudemon-bin-'))
const PLAYER =
  { darwin: 'afplay', win32: 'powershell' }[process.platform] ?? 'paplay'
writeFileSync(join(FAKE_BIN, PLAYER), '')
writeFileSync(join(FAKE_BIN, `${PLAYER}.exe`), '')
process.env.PATH = `${FAKE_BIN}${delimiter}${process.env.PATH}`

// The module keeps the resolved player, the in-flight count and the time of
// the last blip to itself, and a test that drops the player would leave every
// later one without it. Each test gets its own copy.
let sound

beforeEach(async () => {
  spawned.length = 0
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  sound = await import('../src/sound.mjs')
})

afterEach(() => {
  sound.stopMusic()
  vi.useRealTimers()
})

const last = () => spawned[spawned.length - 1]
const later = (ms) => vi.setSystemTime(Date.now() + ms)

test('the player that gets found is the one this platform uses', () => {
  assert.equal(
    sound.hasPlayer(),
    true,
    `no player resolved for ${process.platform}`,
  )
})

test('a blip reaches the player, with the file as an argument', () => {
  assert.equal(sound.play('cursor'), true)

  assert.equal(spawned.length, 1)
  assert.ok(
    last().command.includes(PLAYER),
    `${last().command} is not the planted player`,
  )
  assert.ok(
    last().args.some((arg) => String(arg).endsWith('.wav')),
    'the player was given no wav to play',
  )
  assert.equal(last().options.stdio, 'ignore', 'a blip must not touch the tty')
})

test('two blips in the same instant are one blip', () => {
  assert.equal(sound.play('cursor'), true)
  assert.equal(sound.play('select'), false, 'the second lands inside the gap')
  assert.equal(spawned.length, 1)
})

test('once the gap has passed the next one goes out', () => {
  sound.play('cursor')
  later(50)

  assert.equal(sound.play('select'), true)
  assert.equal(spawned.length, 2)
})

test('only three blips may be in the air at once', () => {
  for (let i = 0; i < 3; i++) {
    assert.equal(sound.play('cursor'), true, `blip ${i + 1} should go out`)
    later(50)
  }

  assert.equal(sound.play('cursor'), false, 'the fourth waits for one to land')
  assert.equal(spawned.length, 3)

  spawned[0].child.emit('exit', 0)
  later(50)
  assert.equal(sound.play('cursor'), true, 'a landing frees a slot')
})

test('a child that exits twice only frees its slot once', () => {
  sound.play('cursor')
  const { child } = last()
  child.emit('exit', 0)
  child.emit('exit', 0)

  later(50)
  sound.play('cursor')
  later(50)
  sound.play('cursor')
  later(50)

  assert.equal(sound.play('cursor'), true, 'the double exit must not overcount')
})

test('a player that turns out to be broken is not asked again', () => {
  sound.play('cursor')
  last().child.emit('error', new Error('no such device'))

  later(50)
  assert.equal(
    sound.play('cursor'),
    false,
    'the failure should have dropped the player',
  )
  assert.equal(sound.hasPlayer(), false)
})

test('asking for a sound nobody has heard of spawns nothing', () => {
  assert.equal(sound.play('nonsense'), false)
  assert.equal(spawned.length, 0)
})

test('a track starts, says it is playing, and stops', () => {
  assert.equal(sound.startMusic('battle'), true)
  assert.equal(sound.musicPlaying(), 'battle')
  assert.equal(spawned.length, 1)

  assert.equal(sound.stopMusic(), true)
  assert.equal(sound.musicPlaying(), null)
  assert.equal(last().child.killed, true, 'the child should be killed')
})

test('starting the track already playing changes nothing', () => {
  sound.startMusic('battle')

  assert.equal(sound.startMusic('battle'), true)
  assert.equal(spawned.length, 1, 'it should not have been spawned twice')
})

test('a different track replaces the one playing', () => {
  sound.startMusic('battle')
  const first = last().child

  assert.equal(sound.startMusic('victory'), true)
  assert.equal(sound.musicPlaying(), 'victory')
  assert.equal(first.killed, true, 'the outgoing track should be killed')
  assert.equal(spawned.length, 2)
})

test('a theme that ends is started again, because it loops', () => {
  assert.ok(sound.MUSIC.battle.loop, 'this test is about a looping track')
  sound.startMusic('battle')

  later(2000)
  last().child.emit('exit', 0)

  assert.equal(spawned.length, 2, 'it should have gone round again')
  assert.equal(sound.musicPlaying(), 'battle')
})

test('a theme that dies at once is let go, not restarted forever', () => {
  sound.startMusic('battle')

  later(10)
  last().child.emit('exit', 1)

  assert.equal(spawned.length, 1, 'a failing player must not be hammered')
  assert.equal(sound.musicPlaying(), null)
})

test('a fanfare is not restarted, because it does not loop', () => {
  assert.equal(sound.MUSIC.victory.loop, false)
  sound.startMusic('victory')

  later(2000)
  last().child.emit('exit', 0)

  assert.equal(spawned.length, 1)
  assert.equal(sound.musicPlaying(), null)
})

test('a track whose player breaks leaves nothing playing', () => {
  sound.startMusic('battle')
  last().child.emit('error', new Error('device busy'))

  assert.equal(sound.musicPlaying(), null)
})

test('the exit of a track nobody is playing any more is ignored', () => {
  sound.startMusic('battle')
  const orphan = last().child
  sound.stopMusic()

  later(2000)
  orphan.emit('exit', 0)

  assert.equal(sound.musicPlaying(), null)
  assert.equal(spawned.length, 1, 'a stopped track must not come back')
})

test('asking for a track nobody has heard of spawns nothing', () => {
  assert.equal(sound.startMusic('nonsense'), false)
  assert.equal(spawned.length, 0)
})

test('stopping silence is nothing, not a failure', () => {
  assert.equal(sound.stopMusic(), false)
})
