import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.CLAUDEMON_HOME = mkdtempSync(join(tmpdir(), 'claudemon-sound-'))

const { MUSIC, SOUNDS, musicPlaying, play, renderWav, startMusic, stopMusic } =
  await import('../src/sound.mjs')

function readHeader(wav) {
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

test('a rendered sound is a WAV any player will take', () => {
  const wav = renderWav({ notes: [{ hz: 440, ms: 100 }] })
  const header = readHeader(wav)

  assert.equal(header.riff, 'RIFF')
  assert.equal(header.wave, 'WAVE')
  assert.equal(header.fmt, 'fmt ')
  assert.equal(header.data, 'data')
  assert.equal(header.format, 1, 'plain PCM')
  assert.equal(header.channels, 1)
  assert.equal(header.bits, 16)
  assert.equal(header.blockAlign, 2)
  assert.equal(header.byteRate, header.rate * 2)

  assert.equal(header.dataSize, wav.length - 44)
  assert.equal(header.size, wav.length - 8)

  assert.equal(header.dataSize, Math.round(header.rate * 0.1) * 2)
})

test('every sound in the catalogue renders, and none of them outstay their welcome', () => {
  for (const [name, spec] of Object.entries(SOUNDS)) {
    const wav = renderWav(spec)
    const header = readHeader(wav)

    assert.ok(header.dataSize > 0, `${name} rendered to nothing`)

    const ms = (header.dataSize / 2 / header.rate) * 1000
    assert.ok(
      ms < 250,
      `${name} runs ${Math.round(ms)}ms, which is long for a keypress`,
    )
  }
})

test('a note fades in and out, so it cannot land as a click', () => {
  const wav = renderWav({ notes: [{ hz: 440, ms: 60 }], gain: 1 })
  const first = wav.readInt16LE(44)
  const last = wav.readInt16LE(wav.length - 2)

  assert.ok(
    Math.abs(first) < 8000,
    `starts at ${first}, which is a step in the signal`,
  )
  assert.ok(
    Math.abs(last) < 8000,
    `ends at ${last}, same problem the other way`,
  )
})

test('a rest is silence rather than a hole', () => {
  const wav = renderWav({ notes: [{ ms: 10 }] })
  const header = readHeader(wav)

  assert.equal(header.dataSize, Math.round(header.rate * 0.01) * 2)
  for (let at = 44; at < wav.length; at += 2)
    assert.equal(wav.readInt16LE(at), 0)
})

test('asking for a sound that does not exist is not an error', () => {
  assert.equal(play('no-such-sound'), false)
  assert.equal(play(undefined), false)
  assert.equal(play(''), false)
})

test('every track ships, and ships as something every player takes', () => {
  for (const [name, spec] of Object.entries(MUSIC)) {
    assert.ok(existsSync(spec.file), `no ${name} track at ${spec.file}`)

    const wav = readFileSync(spec.file)
    const header = readHeader(wav)

    assert.equal(header.riff, 'RIFF', name)
    assert.equal(header.wave, 'WAVE', name)
    assert.equal(
      header.data,
      'data',
      `${name}: the data chunk is not 44 bytes in`,
    )
    assert.equal(header.format, 1, `${name} is not plain PCM`)
    assert.equal(header.channels, 1, `${name} is not mono`)
    assert.equal(header.bits, 16, name)
    assert.equal(header.dataSize, wav.length - 44, name)

    const seconds = header.dataSize / 2 / header.rate
    assert.ok(
      seconds < 180,
      `${name} runs ${seconds.toFixed(1)}s, which is a lot of WAV`,
    )
  }
})

test('a theme is long because it loops, and a fanfare is short because it does not', () => {
  for (const [name, spec] of Object.entries(MUSIC)) {
    assert.equal(
      typeof spec.loop,
      'boolean',
      `${name} does not say whether it loops`,
    )

    const wav = readFileSync(spec.file)
    const header = readHeader(wav)
    const seconds = header.dataSize / 2 / header.rate

    if (spec.loop) {
      assert.ok(
        seconds > 30,
        `${name} loops and runs ${seconds.toFixed(1)}s, which is a jingle`,
      )
    } else {
      assert.ok(
        seconds < 60,
        `${name} plays once and runs ${seconds.toFixed(1)}s`,
      )
    }
  }
})

test('a track is audible without being louder than the blips', () => {
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

    assert.ok(
      rms > 0.02,
      `${name}: RMS ${rms.toFixed(4)} is close enough to silence to look broken`,
    )
    assert.ok(
      rms < 0.2,
      `${name}: RMS ${rms.toFixed(4)} is loud next to a blip at gain 0.2`,
    )
    assert.ok(
      peak < 0.99,
      `${name} peaks at ${peak.toFixed(3)}, which is clipping or close to it`,
    )
  }
})

test('a track starts and ends on silence, so it cannot land as a click', () => {
  for (const [name, spec] of Object.entries(MUSIC)) {
    const wav = readFileSync(spec.file)
    const first = wav.readInt16LE(44)
    const last = wav.readInt16LE(wav.length - 2)

    assert.ok(
      Math.abs(first) < 8000,
      `${name} starts at ${first}, which is a step in the signal`,
    )
    assert.ok(
      Math.abs(last) < 8000,
      `${name} ends at ${last}, same problem the other way`,
    )
  }
})

test('asking for music that does not exist is not an error either', () => {
  assert.equal(startMusic('no-such-track'), false)
  assert.equal(startMusic(undefined), false)
  assert.equal(musicPlaying(), null, 'and nothing is left playing')
})

test('stopping music nobody started is nothing, not a failure', () => {
  assert.equal(stopMusic(), false)
  assert.equal(stopMusic(), false)
  assert.equal(musicPlaying(), null)
})
