// User-tunable settings, read from ~/.claudemon/config.json.
//
// Everything has a default, so a missing or malformed config file is never fatal.

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { CONFIG_FILE, HOME } from './paths.mjs'

export const DEFAULT_CONFIG = {
  /** Chance that a single step through the grass triggers an encounter. */
  encounterChance: 0.12,

  /** Prompt characters per step. A longer prompt walks further. */
  charsPerStep: 40,

  /** Cap on steps from one prompt, so an essay does not spawn a swarm. */
  maxSteps: 8,

  /**
   * Seconds of Claude working that count as one step through the grass, so a
   * long turn is not dead time in the companion. 0 turns it off and goes back to
   * encounters on prompts alone.
   */
  workStepSeconds: 20,

  /** Ring the terminal bell when Claude finishes a turn or needs you. */
  bell: true,

  /**
   * Look for a new claudemon once a day.
   *
   * The one thing in the game that goes near the network after it is installed, and
   * it is a single GET of a public 300-byte file — see src/update.mjs. Off means the
   * game never opens a socket at all; you find out about a new version the way you
   * would have anyway.
   */
  updateCheck: true,

  /**
   * How long a wild Pokemon stands in the grass before it wanders off.
   *
   * Only ever one at a time, so this is also what stops a busy session banking a
   * pile of battles for later: miss it and it is gone, not queued.
   */
  encounterTtlSeconds: 30,

  /**
   * How much of the room a sprite is given it actually uses, from 0.4 to 1.
   *
   * Only ever scales down: 1 already means "as large as the window allows", and
   * the canvas is capped at the source resolution, so there is nothing above it to
   * ask for. Someone who would rather read the menus than the Pokemon turns it
   * down; nobody needs it to go up.
   */
  spriteScale: 1,

  /**
   * The status line command claudemon wraps. Set at install time to whatever
   * the user already had configured, so their own status line survives.
   */
  wrappedStatusLine: null,
}

export function loadConfig() {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * Writes `patch` into the config file and returns the config to carry on with.
 *
 * The file is reread and merged rather than overwritten with whatever this process
 * loaded at startup: the installer writes here too, and it puts keys in that this
 * version knows nothing about — `wrappedStatusLine` is one of them. Writing back
 * an in-memory config would quietly drop them.
 *
 * @param {Record<string, unknown>} patch settings to change, by key.
 */
export function saveConfig(patch) {
  let stored = {}
  try {
    stored = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    // No config file yet, or a hand-edit left it unparseable. Either way the
    // defaults are what the game is running on, so start from those.
  }

  const merged = { ...stored, ...patch }

  mkdirSync(HOME, { recursive: true })
  const tmp = `${CONFIG_FILE}.${process.pid}.tmp`
  try {
    // Indented, because unlike the save this is a file people open and edit.
    writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`)
    renameSync(tmp, CONFIG_FILE)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {
      // The temp file is already gone, which is the state we wanted.
    }
    throw error
  }

  return { ...DEFAULT_CONFIG, ...merged }
}

/**
 * How much of its available room a sprite should fill.
 *
 * Clamped rather than trusted: this multiplies a canvas size, so a hand-edited 0
 * or -3 would be a sprite nobody can see, and the options screen only ever writes
 * values from its own list.
 */
export function spriteScale(config = DEFAULT_CONFIG) {
  const scale = Number(config?.spriteScale)
  if (!Number.isFinite(scale)) return DEFAULT_CONFIG.spriteScale
  return Math.min(1, Math.max(0.4, scale))
}

/**
 * The encounter window in milliseconds.
 *
 * Every process that touches the encounter slot needs this number, and they have
 * to agree on it: the hook decides whether the grass is already occupied with it,
 * and the companion decides when to take the Pokemon off the screen. A hand-edited
 * config that puts nonsense in there falls back to the default rather than leaving
 * an encounter that never times out.
 */
export function encounterTtlMs(config = DEFAULT_CONFIG) {
  const seconds = Number(config?.encounterTtlSeconds)
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_CONFIG.encounterTtlSeconds) * 1000
}
