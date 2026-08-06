import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HOME = process.env.CLAUDEMON_HOME || join(homedir(), '.claudemon')

export const DATA_DIR = join(HOME, 'data')
export const SPRITES_DIR = join(DATA_DIR, 'sprites')

export const BUNDLED_DATA_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
)

export const BUNDLED_ASSETS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
)

export const SAVE_FILE = join(HOME, 'save.json')

export const QUEUE_FILE = join(HOME, 'queue.jsonl')

export const STATUS_FILE = join(HOME, 'status.json')

export const SESSIONS_DIR = join(HOME, 'sessions')

export const CONFIG_FILE = join(HOME, 'config.json')

export const UPDATE_FILE = join(HOME, 'update.json')

export const LOG_FILE = join(HOME, 'claudemon.log')

export const SOUNDS_DIR = join(HOME, 'sounds')

export const PLUGIN_CACHE = join(
  homedir(),
  '.claude',
  'plugins',
  'cache',
  'claudemon',
  'claudemon',
)

export function dataFile(name) {
  const local = join(DATA_DIR, name)
  return existsSync(local) ? local : join(BUNDLED_DATA_DIR, name)
}

export function bundledDataFile(name) {
  return join(BUNDLED_DATA_DIR, name)
}

export function assetFile(name) {
  return join(BUNDLED_ASSETS_DIR, name)
}

export function sessionFile(id) {
  return join(
    SESSIONS_DIR,
    `${String(id)
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(0, 64)}.json`,
  )
}

export function spriteFile(side, id, ext) {
  return join(SPRITES_DIR, side, `${id}.${ext}`)
}
