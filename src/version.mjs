import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLUGIN_CACHE } from './paths.mjs'
import { transformResponseManifest } from './transformers.mjs'

export const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const readManifestFile = (root) => {
  try {
    return JSON.parse(
      readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'),
    )
  } catch {
    return null
  }
}

export const versionAt = (root) => {
  const manifest = transformResponseManifest(readManifestFile(root))

  if (typeof manifest?.version !== 'string' || !manifest.version) return null

  return manifest.version
}

export const VERSION = versionAt(APP_ROOT)

export const compareVersions = (a, b) => {
  const left = String(a).split('.')
  const right = String(b).split('.')

  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const one = Number.parseInt(left[index], 10) || 0
    const two = Number.parseInt(right[index], 10) || 0

    if (one !== two) return one - two
  }

  return 0
}

export const isNewer = (candidate, current) => {
  if (!candidate || !current) return false

  return compareVersions(candidate, current) > 0
}

export const installedVersions = (cache = PLUGIN_CACHE) => {
  try {
    return readdirSync(cache, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && /^\d+(\.\d+)*$/.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort((a, b) => compareVersions(b, a))
  } catch {
    return []
  }
}

export const newestInstalled = (cache = PLUGIN_CACHE) => {
  const versions = installedVersions(cache)

  if (!versions.length) return null

  return versions[0]
}

export const isPluginCopy = (root = APP_ROOT, cache = PLUGIN_CACHE) => {
  if (root === cache) return true
  if (!root.startsWith(cache)) return false

  const next = root[cache.length]

  return next === '/' || next === '\\'
}
