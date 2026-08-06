// The noises the game makes.
//
// Two kinds, and they get here differently. A blip is a few hundred samples of a
// square wave, so the blips are written down as notes and rendered to WAV on first
// use — a new one costs three numbers in the table below rather than a binary file in
// the repo. The battle theme and the victory fanfare are real recordings and ship as
// ones, under assets/.
//
// Playing is somebody else's job: there is no audio in Node, so a sound is a file
// handed to whatever player the machine already has. That is the one part that can
// simply be missing, and a machine with no player is not an error — it is a game that
// does not make noises. Everything in here fails that way, quietly, because a menu
// blip must never be the reason a keypress does not land.
//
// Everything, rendered or shipped, ends up as a plain 16-bit PCM WAV. That is the one
// format every player in the table below takes: `paplay`, `aplay` and PowerShell's
// SoundPlayer will not touch an mp3, so anything compressed would be silence on Linux
// without ffplay and silence on Windows.

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { assetFile, SOUNDS_DIR } from './paths.mjs'

/**
 * Every sound the game can make, by the name the rest of the code asks for.
 *
 * `hz` is the pitch and `ms` how long it holds; a note with no pitch is a rest. The
 * whole catalogue is deliberately in one place: adding a sound is adding a row here
 * and calling `ctx.playSound('its-name')` from wherever it belongs, and nothing else
 * in the game needs to know it exists.
 *
 * Kept short and quiet on purpose. This plays on a keypress in a terminal somebody
 * is working in, so anything that rings or lingers is something they turn off.
 */
export const SOUNDS = {
  /** Moving the cursor. The one that plays most, so it is the smallest. */
  cursor: { gain: 0.16, notes: [{ hz: 1175, ms: 16 }] },

  /** Choosing what the cursor is on: two notes going up, which reads as "yes". */
  select: {
    gain: 0.2,
    notes: [
      { hz: 880, ms: 22 },
      { hz: 1319, ms: 40 },
    ],
  },

  /** Backing out of a screen. The same shape as `select`, going down instead. */
  back: {
    gain: 0.16,
    notes: [
      { hz: 659, ms: 20 },
      { hz: 440, ms: 34 },
    ],
  },
}

/**
 * The sounds that play under a screen rather than on a keypress.
 *
 * Apart from the blips, because they are a different kind of noise: a blip happens
 * because you did something, and this happens whether you touch anything or not. There
 * is only ever one of these playing, so starting one is how the last one ends.
 *
 * A `file` rather than notes. A square wave can carry a menu blip; two minutes of it
 * is two minutes of somebody being buzzed at while they work.
 *
 * `loop` says what happens when the file runs out, and every track states it rather
 * than inheriting it. A theme has to outlast the screen it plays under, so it starts
 * again — every restart is a small gap, which is why a looping track worth shipping is
 * a long one. A fanfare is a thing that happens once and would be a joke the second
 * time round.
 */
export const MUSIC = {
  /** A wild Pokemon, from the first frame of the battle to the last. */
  battle: { file: assetFile('battle.wav'), loop: true },

  /** The battle went your way. Plays over the spoils and stops at the home screen. */
  victory: { file: assetFile('victory.wav'), loop: false },
}

/**
 * 22.05 kHz mono. Half of CD rate, which is inaudible on a square wave a fortieth of
 * a second long and halves a file nothing ever needs to be big.
 */
const SAMPLE_RATE = 22050

/** Ramp on each end of a note, in milliseconds, so an edge does not land as a click. */
const FADE_MS = 2

/**
 * The shortest gap between two sounds.
 *
 * Every play is a process, and a held-down arrow key repeats far faster than anyone
 * can hear a difference. This is what keeps that from forking thirty of them.
 */
const MIN_GAP_MS = 45

/** How many players may be running at once, for the same reason. */
const MAX_IN_FLIGHT = 3

/**
 * How to ask this platform to play a file.
 *
 * Ordered by preference, and the first one actually on the machine wins. All of them
 * are told to be silent: this runs while the game owns the terminal, and a player
 * that prints a banner would land in the middle of a sprite.
 */
const PLAYERS = {
  darwin: [{ command: 'afplay', args: (file) => [file] }],
  win32: [
    {
      command: 'powershell',
      // Doubling is how a single-quoted PowerShell string escapes a quote. A home
      // directory with an apostrophe in it is rare and not worth a broken command.
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
    { command: 'ffplay', args: (file) => ['-nodisp', '-autoexit', '-loglevel', 'quiet', file] },
  ],
}

/**
 * How long a player has to stay alive before the loop believes it played anything.
 *
 * The battle theme restarts itself when it ends, and "it ended" is a process exiting.
 * A player that exits immediately — the file is unreadable, the sound device is
 * taken — would otherwise be respawned forever, which is a fork bomb that makes no
 * noise. Nothing real gets through a track in half a second.
 */
const MIN_LOOP_MS = 500

/** undefined until something has looked, then a player or null for "there is none". */
let player
/** Rendered files, by sound name, so the disk is touched once per name per process. */
const rendered = new Map()
let lastPlayedAt = 0
let inFlight = 0
/** The long sound that is playing, or null. Only ever one. */
let music = null
/** Whether anything has arranged for the music to stop when the process does. */
let silenceArranged = false

/**
 * Renders a sound to the bytes of a WAV file.
 *
 * Square waves, because this is a Game Boy pastiche and because a square is the one
 * waveform that survives being 16 milliseconds long. The fade at each end is not
 * decoration: a wave cut off mid-cycle is a step in the signal, and a step is a click.
 *
 * @param {{notes: {hz?: number, ms: number}[], gain?: number}} spec
 * @returns {Buffer} a complete 16-bit mono WAV, header and all.
 */
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
  header.writeUInt32LE(16, 16) // the fmt chunk is 16 bytes for plain PCM
  header.writeUInt16LE(1, 20) // PCM, uncompressed
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28) // bytes a second
  header.writeUInt16LE(2, 32) // bytes a frame
  header.writeUInt16LE(16, 34) // bits a sample
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)

  return Buffer.concat([header, data])
}

/** Where a binary actually is, or null. Cheaper and quieter than shelling out to `which`. */
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

/**
 * The player this machine has, found once and remembered.
 *
 * Resolved to a full path rather than a bare name, so the spawn below does not go
 * looking again on every keypress.
 */
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

/**
 * Whether anything on this machine can play a sound at all.
 *
 * The OPTION screen asks, so that turning SOUND on where nothing will come of it says
 * so rather than leaving someone pressing keys at a silent terminal.
 */
export function hasPlayer() {
  return resolvePlayer() !== null
}

/**
 * Throws away every render of a sound except the one worth keeping.
 *
 * @param {string} name the sound whose renders to sweep.
 * @param {string|null} keep the basename to leave alone, or null to sweep them all.
 */
function sweepRenders(name, keep) {
  try {
    for (const entry of readdirSync(SOUNDS_DIR)) {
      if (!entry.startsWith(`${name}-`) || !entry.endsWith('.wav')) continue
      if (entry === keep) continue
      unlinkSync(join(SOUNDS_DIR, entry))
    }
  } catch {
    // Tidying is not worth failing over; the worst case is a few stale kilobytes.
  }
}

/**
 * The file for a sound, rendering it if it is not already there.
 *
 * The name carries a hash of the notes, so changing a sound is a different file
 * rather than a stale one nobody notices; the old renders of that name are swept up
 * on the way past. Written to a temp name first for the same reason the save is: a
 * half-written WAV that survives is a sound that is broken from then on.
 */
function soundFile(name, spec) {
  const cached = rendered.get(name)
  if (cached) return cached

  // A sound that ships as audio is already a file, on a path that does not change
  // between runs, so there is nothing to render. There may well be something to sweep:
  // a name that used to be notes has an old render sitting in the cache, and now that
  // nothing will ever come back for it, this is the only pass that will see it.
  if (spec.file) {
    sweepRenders(name, null)
    rendered.set(name, spec.file)
    return spec.file
  }

  const stamp = createHash('sha1').update(JSON.stringify(spec)).digest('hex').slice(0, 8)
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
      } catch {
        // Already gone, which is the state we wanted.
      }
      throw error
    }

    sweepRenders(name, `${name}-${stamp}.wav`)
  }

  rendered.set(name, file)
  return file
}

/**
 * Makes a noise, or does not, and either way returns immediately.
 *
 * Nothing waits on this and nothing is allowed out of it. It is called from inside a
 * keypress on a screen somebody is using, so every way it can fail — no player, no
 * writable home, a player that will not start — ends the same way: silence, and the
 * keypress carries on.
 *
 * @param {string} name a key of `SOUNDS`.
 * @returns {boolean} whether a player was actually started, which is what the tests
 *   watch and what tells the throttle above it did something.
 */
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
    const child = spawn(current.command, current.args(file), { stdio: 'ignore' })

    // 'error' and 'exit' can both arrive, so the count is only ever given back once.
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      inFlight--
    }
    child.once('error', () => {
      // A player that is on the disk and still will not run is not going to start
      // working. Forget it rather than forking one on every keypress from here on.
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

/**
 * The player outlives the game unless somebody says otherwise.
 *
 * A blip is over before anyone could quit during it; a battle theme is thirty
 * seconds of somebody else's process, and a game that leaves music playing in a
 * terminal it no longer owns is worse than a game with no music. Ctrl-C and QUIT both
 * come through 'exit'; `kill -9` is the one that gets away, and nothing can help that.
 */
function arrangeSilenceAtExit() {
  if (silenceArranged) return
  silenceArranged = true
  process.once('exit', stopMusic)
}

/**
 * Starts a long sound, and keeps it going until it ends or something stops it.
 *
 * Its own channel: it does not touch the blip throttle above and the blips do not
 * touch it, so a cursor moving during a battle is a second sound rather than an
 * interruption. One channel, though, so a new track is the end of whatever was under
 * it — which is what makes the fanfare the thing that stops the battle theme. Asking
 * for what is already playing is deliberately nothing at all: restarting the track
 * every time a screen re-entered would be a stutter.
 *
 * Fails the way everything else here does. No player, no writable home, a player that
 * will not start: the battle happens in silence and nobody is told.
 *
 * @param {string} name a key of `MUSIC`.
 * @returns {boolean} whether something is now playing.
 */
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

  // A shipped track can be missing in a way a rendered one cannot: a half-finished
  // install, or a copy of the repo with assets/ stripped out. The MIN_LOOP_MS guard
  // below would catch it on the second spawn, but there is no reason to start a player
  // that has nothing to play.
  if (!existsSync(file)) return false

  // Identity rather than a flag: every callback below asks whether it is still the
  // music, so a session that has been stopped or replaced does nothing on the way out
  // and cannot restart itself over the top of whatever followed it.
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
      // Same reasoning as the blips: a player that is there and still will not run is
      // not going to start working, so stop believing in it.
      player = null
      if (music === session) music = null
    })
    child.once('exit', () => {
      if (music !== session) return
      // A one-shot is over when the player is: nothing to restart, and the slot goes
      // back so the next track does not have to fight it for the channel.
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

/**
 * Stops the long sound, if there is one, and stops it looping.
 *
 * @returns {boolean} whether there was something to stop.
 */
export function stopMusic() {
  const session = music
  if (!session) return false

  // Cleared first, so the 'exit' the kill is about to cause does not read as a track
  // ending and start the next one.
  music = null
  try {
    session.child?.kill()
  } catch {
    // It is already gone, which is the state that was being asked for.
  }
  return true
}

/** What is playing under the screen, or null. The tests watch this. */
export function musicPlaying() {
  return music?.name ?? null
}
