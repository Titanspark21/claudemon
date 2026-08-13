import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

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

test('Should find the player this platform uses', () => {
  expect(sound.hasPlayer(), `no player resolved for ${process.platform}`).toBe(
    true,
  )
})

test('Should reach the player with the file as an argument when a blip goes out', () => {
  expect(sound.play('cursor')).toBe(true)

  expect(spawned).toHaveLength(1)
  expect(
    last().command,
    `${last().command} is not the planted player`,
  ).toContain(PLAYER)
  const args = last().args.map(String)

  if (process.platform === 'win32') {
    expect(args.slice(0, 3)).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
    ])
    expect(
      args[3],
      'PowerShell was not given the generated wav through SoundPlayer',
    ).toMatch(/Media\.SoundPlayer '.+\.wav'\)\.PlaySync\(\)$/)
  } else {
    expect(
      args.some((arg) => arg.endsWith('.wav')),
      'the player was given no wav to play',
    ).toBe(true)
  }

  expect(last().options.stdio, 'a blip must not touch the tty').toBe('ignore')
})

test('Should make two blips in the same instant one blip', () => {
  expect(sound.play('cursor')).toBe(true)
  expect(sound.play('select'), 'the second lands inside the gap').toBe(false)
  expect(spawned).toHaveLength(1)
})

test('Should let the next blip out once the gap has passed', () => {
  sound.play('cursor')
  later(50)

  expect(sound.play('select')).toBe(true)
  expect(spawned).toHaveLength(2)
})

test('Should keep only three blips in the air at once', () => {
  for (let i = 0; i < 3; i++) {
    expect(sound.play('cursor'), `blip ${i + 1} should go out`).toBe(true)
    later(50)
  }

  expect(sound.play('cursor'), 'the fourth waits for one to land').toBe(false)
  expect(spawned).toHaveLength(3)

  spawned[0].child.emit('exit', 0)
  later(50)

  expect(sound.play('cursor'), 'a landing frees a slot').toBe(true)
})

test('Should free a slot only once for a child that exits twice', () => {
  sound.play('cursor')

  const { child } = last()

  child.emit('exit', 0)
  child.emit('exit', 0)

  later(50)
  sound.play('cursor')
  later(50)
  sound.play('cursor')
  later(50)

  expect(sound.play('cursor'), 'the double exit must not overcount').toBe(true)
})

test('Should never ask again for a player that turns out to be broken', () => {
  sound.play('cursor')
  last().child.emit('error', new Error('no such device'))

  later(50)

  expect(
    sound.play('cursor'),
    'the failure should have dropped the player',
  ).toBe(false)
  expect(sound.hasPlayer()).toBe(false)
})

test('Should spawn nothing when asked for a sound nobody has heard of', () => {
  expect(sound.play('nonsense')).toBe(false)
  expect(spawned).toHaveLength(0)
})

test('Should start a track, say it is playing, and stop it', () => {
  expect(sound.startMusic('battle')).toBe(true)
  expect(sound.musicPlaying()).toBe('battle')
  expect(spawned).toHaveLength(1)

  expect(sound.stopMusic()).toBe(true)
  expect(sound.musicPlaying()).toBeNull()
  expect(last().child.killed, 'the child should be killed').toBe(true)

  expect(sound.stopMusic(), 'stopping silence is nothing, not a failure').toBe(
    false,
  )
})

test('Should change nothing when starting the track already playing', () => {
  sound.startMusic('battle')

  expect(sound.startMusic('battle')).toBe(true)
  expect(spawned, 'it should not have been spawned twice').toHaveLength(1)
})

test('Should replace the track playing with a different one', () => {
  sound.startMusic('battle')

  const first = last().child

  expect(sound.startMusic('victory')).toBe(true)
  expect(sound.musicPlaying()).toBe('victory')
  expect(first.killed, 'the outgoing track should be killed').toBe(true)
  expect(spawned).toHaveLength(2)
})

test('Should start a theme again when it ends, because it loops', () => {
  expect(sound.MUSIC.battle.loop, 'this test is about a looping track').toBe(
    true,
  )
  sound.startMusic('battle')

  later(2000)
  last().child.emit('exit', 0)

  expect(spawned, 'it should have gone round again').toHaveLength(2)
  expect(sound.musicPlaying()).toBe('battle')
})

test('Should let go of a theme that dies at once rather than hammer the player', () => {
  sound.startMusic('battle')

  later(10)
  last().child.emit('exit', 1)

  expect(spawned, 'a failing player must not be hammered').toHaveLength(1)
  expect(sound.musicPlaying()).toBeNull()
})

test('Should not restart a fanfare, because it does not loop', () => {
  expect(sound.MUSIC.victory.loop).toBe(false)
  sound.startMusic('victory')

  later(2000)
  last().child.emit('exit', 0)

  expect(spawned).toHaveLength(1)
  expect(sound.musicPlaying()).toBeNull()
})

test('Should leave nothing playing when the player of a track breaks', () => {
  sound.startMusic('battle')
  last().child.emit('error', new Error('device busy'))

  expect(sound.musicPlaying()).toBeNull()
})

test('Should ignore the exit of a track nobody is playing any more', () => {
  sound.startMusic('battle')

  const orphan = last().child

  sound.stopMusic()

  later(2000)
  orphan.emit('exit', 0)

  expect(sound.musicPlaying()).toBeNull()
  expect(spawned, 'a stopped track must not come back').toHaveLength(1)
})

test('Should spawn nothing when asked for a track nobody has heard of', () => {
  expect(sound.startMusic('nonsense')).toBe(false)
  expect(spawned).toHaveLength(0)
})
