// Every path claudemon touches. Override CLAUDEMON_HOME to run against a
// throwaway directory (tests, or trying things out without risking your save).

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HOME = process.env.CLAUDEMON_HOME || join(homedir(), '.claudemon')

export const DATA_DIR = join(HOME, 'data')
export const SPRITES_DIR = join(DATA_DIR, 'sprites')

/**
 * The dataset that ships with the repo — about 120 KB of JSON, so a fresh clone
 * can play without fetching it. Sprites are not in here: they are downloaded,
 * because they are somebody else's artwork and this repo does not redistribute it.
 */
export const BUNDLED_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

/** Game state. Written only by the companion process, atomically. */
export const SAVE_FILE = join(HOME, 'save.json')

/**
 * The encounter slot: one wild Pokemon at a time, filled by the hook and cleared by
 * the companion when you face it. Keeps its old name so a companion and a hook from
 * different versions still talk to each other.
 */
export const QUEUE_FILE = join(HOME, 'queue.jsonl')

/** Small summary the status line reads so it never has to open the save. */
export const STATUS_FILE = join(HOME, 'status.json')

/**
 * One file per Claude Code session, saying whether that session is working.
 * Written by the activity hook, read by the companion.
 */
export const SESSIONS_DIR = join(HOME, 'sessions')

export const CONFIG_FILE = join(HOME, 'config.json')

/** Hooks cannot report errors to the user, so they land here instead. */
export const LOG_FILE = join(HOME, 'claudemon.log')

/**
 * Where a dataset file is read from. A copy under CLAUDEMON_HOME wins if there is
 * one, so an install that predates the bundled dataset keeps working and a
 * regenerated dataset can be dropped in without touching the repo. Otherwise it is
 * the copy that shipped.
 */
export function dataFile(name) {
  const local = join(DATA_DIR, name)
  return existsSync(local) ? local : join(BUNDLED_DATA_DIR, name)
}

/** Always the shipped copy — what `tools/fetch-data.mjs` rebuilds. */
export function bundledDataFile(name) {
  return join(BUNDLED_DATA_DIR, name)
}

/**
 * A session id comes straight from Claude Code, so it is scrubbed before it is
 * allowed anywhere near a filename.
 */
export function sessionFile(id) {
  return join(SESSIONS_DIR, `${String(id).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64)}.json`)
}

export function spriteFile(side, id, ext) {
  return join(SPRITES_DIR, side, `${id}.${ext}`)
}
