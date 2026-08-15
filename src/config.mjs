import {
  CONFIG_VERSION,
  DEFAULT_CONFIG,
  SPRITE_SCALE_MAX,
  SPRITE_SCALE_MIN,
} from './constants.mjs'
import { updateJsonFile as updateFile } from './fileLock.mjs'
import { migrateConfig, migrateConfigFile } from './migrations.mjs'
import { CONFIG_FILE } from './paths.mjs'
import { transformRequestWriteConfig } from './transformers.mjs'

const withDefaults = (stored) => {
  return {
    encounterChance: stored.encounterChance ?? DEFAULT_CONFIG.encounterChance,
    trainerChance: stored.trainerChance ?? DEFAULT_CONFIG.trainerChance,
    charsPerStep: stored.charsPerStep ?? DEFAULT_CONFIG.charsPerStep,
    maxSteps: stored.maxSteps ?? DEFAULT_CONFIG.maxSteps,
    workStepSeconds: stored.workStepSeconds ?? DEFAULT_CONFIG.workStepSeconds,
    sound: stored.sound ?? DEFAULT_CONFIG.sound,
    bell: stored.bell ?? DEFAULT_CONFIG.bell,
    updateCheck: stored.updateCheck ?? DEFAULT_CONFIG.updateCheck,
    encounterTtlSeconds:
      stored.encounterTtlSeconds ?? DEFAULT_CONFIG.encounterTtlSeconds,
    spriteScale: stored.spriteScale ?? DEFAULT_CONFIG.spriteScale,
    wrappedStatusLine:
      stored.wrappedStatusLine ?? DEFAULT_CONFIG.wrappedStatusLine,
    probeRows: stored.probeRows ?? DEFAULT_CONFIG.probeRows,
  }
}

export const loadConfig = () => {
  const stored = migrateConfigFile(CONFIG_FILE)

  if (!stored) return withDefaults(DEFAULT_CONFIG)

  return withDefaults(stored)
}

export const saveConfig = (patch) => {
  migrateConfigFile(CONFIG_FILE)

  const merged = updateFile({
    path: CONFIG_FILE,
    incoming: patch,
    transformResponse: (raw) =>
      raw ? migrateConfig(raw) : { version: CONFIG_VERSION },
    transformRequest: transformRequestWriteConfig,
    merge: (current, incoming) => ({
      ...(current ?? {}),
      ...incoming,
      version: CONFIG_VERSION,
    }),
  })

  return withDefaults(merged)
}

export const spriteScale = (config) => {
  const scale = Number(config.spriteScale)

  if (!Number.isFinite(scale)) return DEFAULT_CONFIG.spriteScale

  return Math.min(SPRITE_SCALE_MAX, Math.max(SPRITE_SCALE_MIN, scale))
}

export const updateCheckMode = (config = DEFAULT_CONFIG) => {
  const value = config.updateCheck

  if (value === false) return 'off'
  if (value === 'launch') return 'launch'

  return 'daily'
}

export const encounterTtlMs = (config) => {
  const seconds = Number(config.encounterTtlSeconds)

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_CONFIG.encounterTtlSeconds * 1000
  }

  return seconds * 1000
}
