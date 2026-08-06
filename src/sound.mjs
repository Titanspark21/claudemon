import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, join } from 'node:path'
import { assetFile, SOUNDS_DIR } from './paths.mjs'

export const SOUNDS = {
  cursor: { gain: 0.16, notes: [{ hz: 1175, ms: 16 }] },

  select: {
    gain: 0.2,
    notes: [
      { hz: 880, ms: 22 },
      { hz: 1319, ms: 40 },
    ],
  },

  back: {
    gain: 0.16,
    notes: [
      { hz: 659, ms: 20 },
      { hz: 440, ms: 34 },
    ],
  },
}

export const MUSIC = {
  battle: { file: assetFile('battle.wav'), loop: true },

  victory: { file: assetFile('victory.wav'), loop: false },
}

const SAMPLE_RATE = 22050

const FADE_MS = 2

const MIN_GAP_MS = 45

const MAX_IN_FLIGHT = 3

const PLAYERS = {
  darwin: [{ command: 'afplay', args: (file) => [file] }],
  win32: [
    {
      command: 'powershell',
      args: (file) => [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(New-Object Media.SoundPlayer '${file.replace(/'/g, "''")}').PlaySync()`,
      ],
    },
  ],
  default: [
    { command: 'paplay', args: (file) => [file] },
    { command: 'aplay', args: (file) => ['-q', file] },
    {
      command: 'ffplay',
      args: (file) => ['-nodisp', '-autoexit', '-loglevel', 'quiet', file],
    },
  ],
}

const MIN_LOOP_MS = 500

let player
const rendered = new Map()
let lastPlayedAt = 0
let inFlight = 0
let music = null
let silenceArranged = false

export function renderWav({ notes = [], gain = 0.2 } = {}) {
  const samples = []

  for (const note of notes) {
    const count = Math.max(0, Math.round((note.ms / 1000) * SAMPLE_RATE))
    const fade = Math.max(1, Math.round((FADE_MS / 1000) * SAMPLE_RATE))

    for (let i = 0; i < count; i++) {
      if (!note.hz) {
        samples.push(0)
        continue
      }
      const envelope = Math.min(1, (i + 1) / fade, (count - i) / fade)
      const phase = (i / SAMPLE_RATE) * note.hz
      const square = phase % 1 < 0.5 ? 1 : -1
      samples.push(square * envelope * gain)
    }
  }

  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]))
    data.writeInt16LE(Math.round(value * 32767), i * 2)
  }

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)

  return Buffer.concat([header, data])
}

function onPath(binary) {
  const names =
    process.platform === 'win32'
      ? [`${binary}.exe`, `${binary}.cmd`, `${binary}.bat`, binary]
      : [binary]

  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue
    for (const name of names) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

function resolvePlayer() {
  if (player !== undefined) return player

  player = null
  for (const candidate of PLAYERS[process.platform] ?? PLAYERS.default) {
    const command = onPath(candidate.command)
    if (command) {
      player = { ...candidate, command }
      break
    }
  }
  return player
}

export function hasPlayer() {
  return resolvePlayer() !== null
}

function sweepRenders(name, keep) {
  try {
    for (const entry of readdirSync(SOUNDS_DIR)) {
      if (!entry.startsWith(`${name}-`) || !entry.endsWith('.wav')) continue
      if (entry === keep) continue
      unlinkSync(join(SOUNDS_DIR, entry))
    }
  } catch {}
}

function soundFile(name, spec) {
  const cached = rendered.get(name)
  if (cached) return cached

  if (spec.file) {
    sweepRenders(name, null)
    rendered.set(name, spec.file)
    return spec.file
  }

  const stamp = createHash('sha1')
    .update(JSON.stringify(spec))
    .digest('hex')
    .slice(0, 8)
  const file = join(SOUNDS_DIR, `${name}-${stamp}.wav`)

  if (!existsSync(file)) {
    mkdirSync(SOUNDS_DIR, { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    try {
      writeFileSync(tmp, renderWav(spec))
      renameSync(tmp, file)
    } catch (error) {
      try {
        unlinkSync(tmp)
      } catch {}
      throw error
    }

    sweepRenders(name, `${name}-${stamp}.wav`)
  }

  rendered.set(name, file)
  return file
}

export function play(name) {
  const spec = SOUNDS[name]
  if (!spec) return false

  const current = resolvePlayer()
  if (!current) return false

  const now = Date.now()
  if (now - lastPlayedAt < MIN_GAP_MS) return false
  if (inFlight >= MAX_IN_FLIGHT) return false

  let file
  try {
    file = soundFile(name, spec)
  } catch {
    return false
  }

  try {
    const child = spawn(current.command, current.args(file), {
      stdio: 'ignore',
    })

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      inFlight--
    }
    child.once('error', () => {
      player = null
      finish()
    })
    child.once('exit', finish)
    child.unref()

    inFlight++
    lastPlayedAt = now
    return true
  } catch {
    return false
  }
}

function arrangeSilenceAtExit() {
  if (silenceArranged) return
  silenceArranged = true
  process.once('exit', stopMusic)
}

export function startMusic(name) {
  const spec = MUSIC[name]
  if (!spec) return false
  if (music?.name === name) return true

  stopMusic()

  const current = resolvePlayer()
  if (!current) return false

  let file
  try {
    file = soundFile(`music-${name}`, spec)
  } catch {
    return false
  }

  if (!existsSync(file)) return false

  const session = { name, child: null }

  const spawnOnce = () => {
    const startedAt = Date.now()
    let child
    try {
      child = spawn(current.command, current.args(file), { stdio: 'ignore' })
    } catch {
      if (music === session) music = null
      return false
    }

    session.child = child
    child.once('error', () => {
      player = null
      if (music === session) music = null
    })
    child.once('exit', () => {
      if (music !== session) return
      if (!spec.loop) {
        music = null
        return
      }
      if (Date.now() - startedAt < MIN_LOOP_MS) {
        music = null
        return
      }
      spawnOnce()
    })
    child.unref()
    return true
  }

  music = session
  arrangeSilenceAtExit()
  if (!spawnOnce()) return false
  return true
}

export function stopMusic() {
  const session = music
  if (!session) return false

  music = null
  try {
    session.child?.kill()
  } catch {}
  return true
}

export function musicPlaying() {
  return music?.name ?? null
}
