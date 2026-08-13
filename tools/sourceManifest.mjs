import { createHash } from 'node:crypto'
import { Generations } from '@pkmn/data'
import { Dex } from '@pkmn/dex'

const COMMIT = /^[0-9a-f]{40}$/
const VERSION = /^\d+\.\d+\.\d+$/

const byKey = (a, b) => {
  const byNumber =
    (a.num ?? Number.MAX_SAFE_INTEGER) - (b.num ?? Number.MAX_SAFE_INTEGER)

  return (
    byNumber || String(a.id ?? a.name).localeCompare(String(b.id ?? b.name))
  )
}

const plain = (value) => JSON.parse(JSON.stringify(value))

export const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(',')}}`
}

export const sourceRevision = (manifest, source) => {
  const entry = manifest?.sources?.[source]

  if (!entry) throw new Error(`Missing source provenance: ${source}`)
  if (!VERSION.test(entry.version ?? ''))
    throw new Error(`Unpinned package version: ${source}`)
  if (!COMMIT.test(entry.commit ?? ''))
    throw new Error(`Unpinned Showdown revision: ${source}`)

  return `${entry.version}@${entry.commit}`
}

export const transformResponseSourceManifest = (raw) => {
  const manifest = plain(raw)

  manifest.generation = Number(manifest.generation)
  manifest.pokeApi.endpoints = [...manifest.pokeApi.endpoints].sort()
  manifest.pokeApi.versionGroups = [...manifest.pokeApi.versionGroups].sort()
  manifest.sprites.baseUrls = [...manifest.sprites.baseUrls].sort()

  sourceRevision(manifest, '@pkmn/data')
  sourceRevision(manifest, '@pkmn/dex')

  if (manifest.generation !== 7)
    throw new Error(`Expected Generation VII, got ${manifest.generation}`)
  if (!manifest.pokeApi?.baseUrl || manifest.pokeApi.endpoints.length === 0)
    throw new Error('Missing PokéAPI provenance')
  if (manifest.generationTimestampPolicy !== 'omitted-for-reproducibility')
    throw new Error('Generation timestamp policy must be reproducible')

  return manifest
}

export const loadGenerationSource = (generation = 7) => {
  if (generation !== 7) throw new Error(`Unsupported generation: ${generation}`)

  const source = new Generations(Dex).get(generation)
  const records = (items) => [...items].map(plain).sort(byKey)
  const species = records(source.species)

  return {
    species,
    moves: records(source.moves),
    abilities: records(source.abilities),
    items: records(source.items),
    learnsets: species.map((record) => ({
      id: record.id,
      learnset: plain(source.learnsets.get(record.id) ?? {}),
    })),
  }
}

export const outputHash = (value) => {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

export const fetchJsonWithRetry = async (
  url,
  {
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    attempts = 5,
    retryBackoffMs = 300,
    throttleBackoffMs = 2000,
    onThrottle = () => {},
  } = {},
) => {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetchImpl(url)

    if (response.status === 429 || response.status === 503) {
      const after = Number(response.headers.get('retry-after'))
      const pause =
        Number.isFinite(after) && after > 0
          ? after * 1000
          : throttleBackoffMs * attempt ** 2

      onThrottle(pause)
      if (attempt === attempts) throw new Error(`HTTP ${response.status}`)
      await sleep(pause)
      continue
    }

    if (!response.ok) {
      if (attempt === attempts) throw new Error(`HTTP ${response.status}`)
      await sleep(retryBackoffMs * attempt ** 2)
      continue
    }

    return response.json()
  }

  throw new Error(`${url}: gave up after ${attempts} attempts`)
}
