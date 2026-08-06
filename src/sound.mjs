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
import {
  FADE_MS,
  INT16_MAX,
  MAX_IN_FLIGHT,
  MIN_GAP_MS,
  MIN_LOOP_MS,
  SAMPLE_RATE,
  SOUNDS,
  WAV_BITS_PER_SAMPLE,
  WAV_BYTES_PER_SAMPLE,
  WAV_CHANNELS,
  WAV_FMT_CHUNK_BYTES,
  WAV_HEADER_BYTES,
  WAV_PCM_FORMAT,
  WAV_RIFF_OVERHEAD_BYTES,
} from './constants.mjs'
import { assetFile, SOUNDS_DIR } from './paths.mjs'

export const MUSIC = {
  battle: { file: assetFile('battle.wav'), loop: true },

  victory: { file: assetFile('victory.wav'), loop: false },
}

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

let player
const rendered = new Map()
let lastPlayedAt = 0
let inFlight = 0
let music = null
let silenceArranged = false

export const renderWav = ({ notes, gain = 0.2 }) => {
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

  const data = Buffer.alloc(samples.length * WAV_BYTES_PER_SAMPLE)

  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]))

    data.writeInt16LE(Math.round(value * INT16_MAX), i * WAV_BYTES_PER_SAMPLE)
  }

  const header = Buffer.alloc(WAV_HEADER_BYTES)

  header.write('RIFF', 0)
  header.writeUInt32LE(WAV_RIFF_OVERHEAD_BYTES + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(WAV_FMT_CHUNK_BYTES, 16)
  header.writeUInt16LE(WAV_PCM_FORMAT, 20)
  header.writeUInt16LE(WAV_CHANNELS, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * WAV_BYTES_PER_SAMPLE, 28)
  header.writeUInt16LE(WAV_BYTES_PER_SAMPLE, 32)
  header.writeUInt16LE(WAV_BITS_PER_SAMPLE, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)

  return Buffer.concat([header, data])
}

const onPath = (binary) => {
  const searchPath = process.env.PATH

  if (!searchPath) return null

  const names =
    process.platform === 'win32'
      ? [`${binary}.exe`, `${binary}.cmd`, `${binary}.bat`, binary]
      : [binary]

  for (const dir of searchPath.split(delimiter)) {
    if (!dir) continue

    for (const name of names) {
      const candidate = join(dir, name)

      if (existsSync(candidate)) return candidate
    }
  }

  return null
}

const resolvePlayer = () => {
  if (player !== undefined) return player

  player = null

  const candidates = PLAYERS[process.platform] ?? PLAYERS.default

  for (const candidate of candidates) {
    const command = onPath(candidate.command)

    if (command) {
      player = { command, args: candidate.args }
      break
    }
  }

  return player
}

export const hasPlayer = () => resolvePlayer() !== null

const sweepRenders = (name, keep) => {
  try {
    for (const entry of readdirSync(SOUNDS_DIR)) {
      if (!entry.startsWith(`${name}-`) || !entry.endsWith('.wav')) continue
      if (entry === keep) continue

      unlinkSync(join(SOUNDS_DIR, entry))
    }
  } catch {}
}

const soundFile = (name, spec) => {
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

const finishPlayback = (playback) => {
  if (playback.settled) return

  playback.settled = true
  inFlight--
}

export const play = (name) => {
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

    const playback = { settled: false }

    const handlePlaybackError = () => {
      player = null
      finishPlayback(playback)
    }

    const handlePlaybackExit = () => finishPlayback(playback)

    child.once('error', handlePlaybackError)
    child.once('exit', handlePlaybackExit)
    child.unref()

    inFlight++
    lastPlayedAt = now

    return true
  } catch {
    return false
  }
}

const arrangeSilenceAtExit = () => {
  if (silenceArranged) return

  silenceArranged = true
  process.once('exit', stopMusic)
}

const dropMusicSession = (session) => {
  player = null

  if (music === session) music = null
}

const restartMusic = (session, current, file, spec, startedAt) => {
  if (music !== session) return

  if (!spec.loop) {
    music = null
    return
  }

  if (Date.now() - startedAt < MIN_LOOP_MS) {
    music = null
    return
  }

  spawnMusicOnce(session, current, file, spec)
}

const spawnMusicOnce = (session, current, file, spec) => {
  const startedAt = Date.now()
  let child

  try {
    child = spawn(current.command, current.args(file), { stdio: 'ignore' })
  } catch {
    if (music === session) music = null

    return false
  }

  session.child = child

  const handleMusicError = () => dropMusicSession(session)

  const handleMusicExit = () => {
    restartMusic(session, current, file, spec, startedAt)
  }

  child.once('error', handleMusicError)
  child.once('exit', handleMusicExit)
  child.unref()

  return true
}

export const startMusic = (name) => {
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

  music = session
  arrangeSilenceAtExit()

  return spawnMusicOnce(session, current, file, spec)
}

export const stopMusic = () => {
  const session = music

  if (!session) return false

  music = null

  try {
    session.child?.kill()
  } catch {}

  return true
}

export const musicPlaying = () => music?.name ?? null
