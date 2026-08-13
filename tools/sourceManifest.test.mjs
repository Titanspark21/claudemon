import { readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import {
  fetchJsonWithRetry,
  loadGenerationSource,
  outputHash,
  sourceRevision,
  transformResponseSourceManifest,
} from './sourceManifest.mjs'

const manifest = () =>
  JSON.parse(readFileSync(new URL('../data/sources.json', import.meta.url)))

test('Should reject an unpinned Showdown revision', () => {
  const value = manifest()
  value.sources['@pkmn/data'].commit = 'main'

  expect(() => sourceRevision(value, '@pkmn/data')).toThrow(
    'Unpinned Showdown revision',
  )
})

test('Should reject missing PokéAPI provenance', () => {
  const value = manifest()
  value.pokeApi.endpoints = []

  expect(() => transformResponseSourceManifest(value)).toThrow(
    'Missing PokéAPI provenance',
  )
})

test('Should reject records outside Generation VII', () => {
  const value = manifest()
  value.generation = 8

  expect(() => transformResponseSourceManifest(value)).toThrow(
    'Expected Generation VII',
  )
  expect(() => loadGenerationSource(8)).toThrow('Unsupported generation')
})

test('Should obey Retry-After before retrying a throttled request', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce({
      status: 429,
      ok: false,
      headers: { get: () => '2' },
    })
    .mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({ ok: true }),
    })
  const sleep = vi.fn()

  await expect(
    fetchJsonWithRetry('https://example.test', { fetchImpl, sleep }),
  ).resolves.toEqual({ ok: true })
  expect(sleep).toHaveBeenCalledWith(2000)
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})

test('Should load a stable, sorted Generation VII source', () => {
  const first = loadGenerationSource(7)
  const second = loadGenerationSource(7)

  expect(first.species[0].num).toBe(1)
  expect(first.species.at(-1).gen).toBeLessThanOrEqual(7)
  expect(outputHash(first)).toBe(outputHash(second))
})

test('Should normalize manifest arrays deterministically', () => {
  const value = manifest()
  value.pokeApi.endpoints.reverse()
  value.sprites.baseUrls.reverse()

  const first = transformResponseSourceManifest(value)
  const second = transformResponseSourceManifest(manifest())

  expect(outputHash(first)).toBe(outputHash(second))
})
