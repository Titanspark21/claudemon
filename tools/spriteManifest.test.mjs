import { expect, test } from 'vitest'
import {
  buildSpriteManifest,
  isPng,
  showdownSpriteSlug,
  spriteCandidates,
  spriteStorageKey,
} from './spriteManifest.mjs'

const base = (overrides = {}) => ({
  id: 6,
  sourceKey: 'charizard',
  name: 'Charizard',
  dexNumber: 6,
  baseSpecies: 6,
  formKey: null,
  ...overrides,
})

const form = (overrides = {}) => ({
  id: 10001,
  sourceKey: 'raichualola',
  name: 'Raichu-Alola',
  dexNumber: 26,
  baseSpecies: 26,
  formKey: 'alola',
  baseSourceKey: 'raichu',
  ...overrides,
})

test('base species use a Showdown Gen-5-style sprite before the numeric PokéAPI fallback', () => {
  expect(spriteCandidates(base(), 'front', false)).toEqual([
    'https://play.pokemonshowdown.com/sprites/gen5/charizard.png',
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/6.png',
  ])
})

test('form records keep an exact form-qualified Showdown slug without falling back to the base Pokemon', () => {
  expect(showdownSpriteSlug(form())).toBe('raichu-alola')
  expect(spriteCandidates(form(), 'front', false)).toEqual([
    'https://play.pokemonshowdown.com/sprites/gen5/raichu-alola.png',
  ])
})

test('gendered, Mega X/Y, and battle-only forms normalize to Showdown sprite names', () => {
  expect(
    showdownSpriteSlug(
      form({
        id: 10040,
        sourceKey: 'meowsticf',
        name: 'Meowstic-F',
        dexNumber: 678,
        baseSpecies: 678,
        formKey: 'f',
        baseSourceKey: 'meowstic',
      }),
    ),
  ).toBe('meowstic-f')
  expect(
    showdownSpriteSlug(
      form({
        id: 20001,
        sourceKey: 'charizardmegax',
        name: 'Charizard-Mega-X',
        dexNumber: 6,
        baseSpecies: 6,
        formKey: 'megax',
        baseSourceKey: 'charizard',
      }),
    ),
  ).toBe('charizard-megax')
  expect(
    showdownSpriteSlug(
      form({
        id: 20002,
        sourceKey: 'charizardmegay',
        name: 'Charizard-Mega-Y',
        dexNumber: 6,
        baseSpecies: 6,
        formKey: 'megay',
        baseSourceKey: 'charizard',
      }),
    ),
  ).toBe('charizard-megay')
  expect(
    showdownSpriteSlug(
      form({
        id: 20050,
        sourceKey: 'aegislashblade',
        name: 'Aegislash-Blade',
        dexNumber: 681,
        baseSpecies: 681,
        formKey: 'blade',
        baseSourceKey: 'aegislash',
      }),
    ),
  ).toBe('aegislash-blade')
})

test('back and shiny variants select normalized Showdown directories', () => {
  expect(spriteCandidates(form(), 'back', false)[0]).toBe(
    'https://play.pokemonshowdown.com/sprites/gen5-back/raichu-alola.png',
  )
  expect(spriteCandidates(form(), 'front', true)[0]).toBe(
    'https://play.pokemonshowdown.com/sprites/gen5-shiny/raichu-alola.png',
  )
  expect(spriteCandidates(form(), 'back', true)[0]).toBe(
    'https://play.pokemonshowdown.com/sprites/gen5-back-shiny/raichu-alola.png',
  )
})

test('stored filenames use stable internal numeric identities, including synthetic forms', () => {
  expect(spriteStorageKey(base())).toBe('6')
  expect(spriteStorageKey(form({ id: 20064 }))).toBe('20064')
})

test('the manifest declares ordinary missing assets as unavailable and shiny assets as ordinary fallbacks', () => {
  const manifest = buildSpriteManifest([
    base({
      id: 26,
      sourceKey: 'raichu',
      name: 'Raichu',
      dexNumber: 26,
      baseSpecies: 26,
    }),
    form(),
  ])
  const alola = manifest.assets.filter((entry) => entry.id === 10001)

  expect(alola).toHaveLength(4)
  expect(
    alola.find((entry) => entry.side === 'back' && !entry.shiny)?.fallback,
  ).toBe('unavailable-sprite')
  expect(
    alola.find((entry) => entry.side === 'front' && entry.shiny)?.fallback,
  ).toBe('ordinary')
  expect(alola.every((entry) => entry.storageKey === '10001')).toBe(true)
})

test('candidate URLs are normalized and PNG validation rejects HTML or truncated downloads', () => {
  const [url] = spriteCandidates(form(), 'front', false)

  expect(url).not.toContain(' ')
  expect(new URL(url).href).toBe(url)
  expect(
    isPng(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ).toBe(true)
  expect(isPng(Buffer.from('<html>not a sprite</html>'))).toBe(false)
  expect(isPng(Buffer.from([0x89, 0x50]))).toBe(false)
})
