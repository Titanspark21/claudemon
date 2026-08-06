import {
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { CONFIG_FILE, HOME } from './paths.mjs'

export const DEFAULT_CONFIG = {
  encounterChance: 0.12,

  charsPerStep: 40,

  maxSteps: 4,

  workStepSeconds: 20,

  sound: true,

  bell: true,

  updateCheck: true,

  encounterTtlSeconds: 30,

  spriteScale: 1,

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

export function saveConfig(patch) {
  let stored = {}
  try {
    stored = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
  } catch {}

  const merged = { ...stored, ...patch }

  mkdirSync(HOME, { recursive: true })
  const tmp = `${CONFIG_FILE}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`)
    renameSync(tmp, CONFIG_FILE)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {}
    throw error
  }

  return { ...DEFAULT_CONFIG, ...merged }
}

export function spriteScale(config = DEFAULT_CONFIG) {
  const scale = Number(config?.spriteScale)
  if (!Number.isFinite(scale)) return DEFAULT_CONFIG.spriteScale
  return Math.min(1, Math.max(0.4, scale))
}

export function updateCheckMode(config = DEFAULT_CONFIG) {
  const value = config?.updateCheck
  if (value === false) return 'off'
  if (value === 'launch') return 'launch'
  return 'daily'
}

export function encounterTtlMs(config = DEFAULT_CONFIG) {
  const seconds = Number(config?.encounterTtlSeconds)
  return (
    (Number.isFinite(seconds) && seconds > 0
      ? seconds
      : DEFAULT_CONFIG.encounterTtlSeconds) * 1000
  )
}
