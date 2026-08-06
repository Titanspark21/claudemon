import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

process.env.CLAUDEMON_HOME = mkdtempSync(join(tmpdir(), 'claudemon-sound-'))

const { SOUNDS } = await import('../src/constants.mjs')
const { MUSIC, musicPlaying, play, renderWav, startMusic, stopMusic } =
  await import('../src/sound.mjs')

const readHeader = (wav) => {
  return {
    riff: wav.toString('ascii', 0, 4),
    size: wav.readUInt32LE(4),
    wave: wav.toString('ascii', 8, 12),
    fmt: wav.toString('ascii', 12, 16),
    format: wav.readUInt16LE(20),
    channels: wav.readUInt16LE(22),
    rate: wav.readUInt32LE(24),
    byteRate: wav.readUInt32LE(28),
    blockAlign: wav.readUInt16LE(32),
    bits: wav.readUInt16LE(34),
    data: wav.toString('ascii', 36, 40),
    dataSize: wav.readUInt32LE(40),
  }
}

const secondsOf = (header) => header.dataSize / 2 / header.rate

const samplesOf = (wav) => {
  const samples = []

  for (let at = 44; at < wav.length; at += 2) samples.push(wav.readInt16LE(at))

  return samples
}

test('Should render a sound as a WAV any player will take', () => {
  const wav = renderWav({ notes: [{ hz: 440, ms: 100 }] })
  const header = readHeader(wav)

  expect(header.riff).toBe('RIFF')
  expect(header.wave).toBe('WAVE')
  expect(header.fmt).toBe('fmt ')
  expect(header.data).toBe('data')
  expect(header.format, 'plain PCM').toBe(1)
  expect(header.channels).toBe(1)
  expect(header.bits).toBe(16)
  expect(header.blockAlign).toBe(2)
  expect(header.byteRate).toBe(header.rate * 2)

  expect(header.dataSize).toBe(wav.length - 44)
  expect(header.size).toBe(wav.length - 8)

  expect(header.dataSize).toBe(Math.round(header.rate * 0.1) * 2)
})

test('Should render every sound in the catalogue without any of them outstaying their welcome', () => {
  for (const [name, spec] of Object.entries(SOUNDS)) {
    const header = readHeader(renderWav(spec))
    const ms = secondsOf(header) * 1000

    expect(header.dataSize, `${name} rendered to nothing`).toBeGreaterThan(0)
    expect(
      ms,
      `${name} runs ${Math.round(ms)}ms, which is long for a keypress`,
    ).toBeLessThan(250)
  }
})

test('Should fade a note in and out so it cannot land as a click', () => {
  const wav = renderWav({ notes: [{ hz: 440, ms: 60 }], gain: 1 })
  const first = wav.readInt16LE(44)
  const last = wav.readInt16LE(wav.length - 2)

  expect(
    Math.abs(first),
    `starts at ${first}, which is a step in the signal`,
  ).toBeLessThan(8000)
  expect(
    Math.abs(last),
    `ends at ${last}, same problem the other way`,
  ).toBeLessThan(8000)
})

test('Should render a rest as silence rather than a hole', () => {
  const wav = renderWav({ notes: [{ ms: 10 }] })
  const header = readHeader(wav)

  expect(header.dataSize).toBe(Math.round(header.rate * 0.01) * 2)
  expect([...new Set(samplesOf(wav))]).toEqual([0])
})

test('Should treat asking for a sound that does not exist as nothing rather than an error', () => {
  expect(play('no-such-sound')).toBe(false)
  expect(play(undefined)).toBe(false)
  expect(play('')).toBe(false)
})

test('Should ship every track as something every player takes', () => {
  for (const [name, spec] of Object.entries(MUSIC)) {
    expect(existsSync(spec.file), `no ${name} track at ${spec.file}`).toBe(true)

    const wav = readFileSync(spec.file)
    const header = readHeader(wav)

    expect(header.riff, name).toBe('RIFF')
    expect(header.wave, name).toBe('WAVE')
    expect(header.data, `${name}: the data chunk is not 44 bytes in`).toBe(
      'data',
    )
    expect(header.format, `${name} is not plain PCM`).toBe(1)
    expect(header.channels, `${name} is not mono`).toBe(1)
    expect(header.bits, name).toBe(16)
    expect(header.dataSize, name).toBe(wav.length - 44)
  }
})

test('Should keep a theme long because it loops and a fanfare short because it does not', () => {
  for (const [name, spec] of Object.entries(MUSIC)) {
    expect(typeof spec.loop, `${name} does not say whether it loops`).toBe(
      'boolean',
    )

    const seconds = secondsOf(readHeader(readFileSync(spec.file)))

    if (spec.loop) {
      expect(
        seconds,
        `${name} loops and runs ${seconds.toFixed(1)}s, which is a jingle`,
      ).toBeGreaterThan(30)
      expect(
        seconds,
        `${name} runs ${seconds.toFixed(1)}s, which is a lot of WAV`,
      ).toBeLessThan(180)
    } else {
      expect(
        seconds,
        `${name} plays once and runs ${seconds.toFixed(1)}s`,
      ).toBeLessThan(60)
    }
  }
})

test('Should keep a track audible without making it louder than the blips', () => {
  for (const [name, spec] of Object.entries(MUSIC)) {
    const wav = readFileSync(spec.file)
    const count = (wav.length - 44) / 2

    let sum = 0
    let peak = 0

    for (let i = 0; i < count; i++) {
      const sample = wav.readInt16LE(44 + i * 2) / 32768

      sum += sample * sample
      peak = Math.max(peak, Math.abs(sample))
    }

    const rms = Math.sqrt(sum / count)

    expect(
      rms,
      `${name}: RMS ${rms.toFixed(4)} is close enough to silence to look broken`,
    ).toBeGreaterThan(0.02)
    expect(
      rms,
      `${name}: RMS ${rms.toFixed(4)} is loud next to a blip at gain 0.2`,
    ).toBeLessThan(0.2)
    expect(
      peak,
      `${name} peaks at ${peak.toFixed(3)}, which is clipping or close to it`,
    ).toBeLessThan(0.99)
  }
})

test('Should start and end a track on silence so it cannot land as a click', () => {
  for (const [name, spec] of Object.entries(MUSIC)) {
    const wav = readFileSync(spec.file)
    const first = wav.readInt16LE(44)
    const last = wav.readInt16LE(wav.length - 2)

    expect(
      Math.abs(first),
      `${name} starts at ${first}, which is a step in the signal`,
    ).toBeLessThan(8000)
    expect(
      Math.abs(last),
      `${name} ends at ${last}, same problem the other way`,
    ).toBeLessThan(8000)
  }
})

test('Should treat asking for music that does not exist as nothing and leave nothing playing', () => {
  expect(startMusic('no-such-track')).toBe(false)
  expect(startMusic(undefined)).toBe(false)
  expect(musicPlaying(), 'and nothing is left playing').toBeNull()
})

test('Should treat stopping music nobody started as nothing rather than a failure', () => {
  expect(stopMusic()).toBe(false)
  expect(stopMusic()).toBe(false)
  expect(musicPlaying()).toBeNull()
})
