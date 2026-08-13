import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { loadGenerationSource, outputHash } from './sourceManifest.mjs'
import {
  createSpeciesIdentityIndex,
  generateSpeciesIdentityManifest,
  loadSpeciesIdentitySource,
  validateSpeciesIdentityManifest,
} from './speciesIdentity.mjs'

const generate = () =>
  generateSpeciesIdentityManifest(loadSpeciesIdentitySource())

const checkedIn = () =>
  JSON.parse(readFileSync(new URL('../data/form-ids.json', import.meta.url)))

test('Should preserve National identities from Bulbasaur through Melmetal', () => {
  const index = createSpeciesIdentityIndex(generate())

  expect(index.speciesRecord(1)).toMatchObject({
    id: 1,
    sourceKey: 'bulbasaur',
    dexNumber: 1,
    baseSpecies: 1,
    formKey: null,
    collectible: true,
    battleOnly: false,
    persistence: 'national',
  })
  expect(index.speciesRecord(809)).toMatchObject({
    id: 809,
    sourceKey: 'melmetal',
    dexNumber: 809,
    baseSpecies: 809,
  })
})

test('Should give all 18 Alolan species stable collectible identities', () => {
  const first = generate()
  const reversed = generateSpeciesIdentityManifest(
    [...loadSpeciesIdentitySource()].reverse(),
  )
  const alola = first.records.filter((record) => record.formKey === 'alola')

  expect(alola).toHaveLength(18)
  expect(outputHash(first)).toBe(outputHash(reversed))
  expect(
    alola.find((record) => record.sourceKey === 'rattataalola'),
  ).toMatchObject({
    id: 10001,
    dexNumber: 19,
    collectible: true,
    battleOnly: false,
  })
  expect(
    alola.find((record) => record.sourceKey === 'raichualola'),
  ).toMatchObject({
    id: 10004,
    dexNumber: 26,
  })
})

test('Should keep Mega X and Y identities unique and battle-only', () => {
  const index = createSpeciesIdentityIndex(generate())
  const forms = index.formsOf(6)

  expect(forms.map((record) => record.sourceKey)).toEqual([
    'charizardmegax',
    'charizardmegay',
  ])
  expect(forms.map((record) => record.id)).toEqual([20002, 20003])
  expect(forms.every((record) => record.battleOnly)).toBe(true)
  expect(index.baseSpeciesOf(20002).id).toBe(6)
})

test('Should partition collectible and battle-only synthetic ranges', () => {
  const manifest = generate()
  const ids = manifest.records.map((record) => record.id)
  const forms = manifest.records.filter((record) => record.formKey !== null)

  expect(new Set(ids).size).toBe(ids.length)
  expect(
    forms
      .filter((record) => record.collectible)
      .every(
        (record) =>
          record.id >= manifest.ranges.collectible.first &&
          record.id <= manifest.ranges.collectible.last,
      ),
  ).toBe(true)
  expect(
    forms
      .filter((record) => record.battleOnly)
      .every(
        (record) =>
          record.id >= manifest.ranges.battleOnly.first &&
          record.id <= manifest.ranges.battleOnly.last,
      ),
  ).toBe(true)
  expect(manifest.ranges.collectible.last).toBeLessThan(
    manifest.ranges.battleOnly.first,
  )
})

test('Should reject collisions, missing bases and reassigned identities', () => {
  const original = generate()
  const collision = structuredClone(original)
  const missingBase = structuredClone(original)
  const reassigned = structuredClone(original)
  const firstForm = collision.records.find((record) => record.formKey !== null)
  const secondForm = collision.records.find(
    (record) => record.formKey !== null && record.id !== firstForm.id,
  )

  secondForm.id = firstForm.id
  missingBase.records = missingBase.records.filter(
    (record) => record.id !== 809,
  )
  reassigned.records.find((record) => record.sourceKey === 'rattataalola').id =
    10099

  expect(() => validateSpeciesIdentityManifest(collision)).toThrow(
    'Identity collision',
  )
  expect(() => validateSpeciesIdentityManifest(missingBase)).toThrow(
    'Missing base identity: 809',
  )
  expect(() => validateSpeciesIdentityManifest(reassigned, original)).toThrow(
    'Identity reassigned',
  )
})

test('Should display National numbers and partition Dex persistence', () => {
  const index = createSpeciesIdentityIndex(generate())

  expect(index.displayDexNumber(20002)).toBe(6)
  expect(index.dexEntryFor(6)).toEqual({ dexNumber: 6, formId: null })
  expect(index.dexEntryFor(10001)).toEqual({ dexNumber: 19, formId: 10001 })
  expect(() => index.dexEntryFor(20002)).toThrow(
    'Battle-only forms cannot be persisted',
  )
})

test('Should record cosmetic families as explicit exclusions', () => {
  const manifest = generate()

  expect(manifest.exclusions).toContainEqual(
    expect.objectContaining({
      sourceKey: 'pikachualola',
      dexNumber: 25,
      classification: 'cosmetic-only',
    }),
  )
  expect(manifest.exclusions).toContainEqual(
    expect.objectContaining({
      sourceKey: 'unownb',
      dexNumber: 201,
      classification: 'cosmetic-only',
    }),
  )
  expect(manifest.exclusions.every((entry) => entry.reason.length > 0)).toBe(
    true,
  )
})

test('Should account for every alternate record exposed by the pinned source', () => {
  const source = loadGenerationSource().species
  const manifest = generate()
  const sourceAlternates = source.filter(
    (record) => record.name !== record.baseSpecies,
  )
  const accounted = new Set([
    ...manifest.records.map((record) => record.sourceKey),
    ...manifest.exclusions.map((record) => record.sourceKey),
  ])

  expect(sourceAlternates.every((record) => accounted.has(record.id))).toBe(
    true,
  )
})

test('Should keep the checked-in identity manifest generated and current', () => {
  expect(outputHash(checkedIn())).toBe(outputHash(generate()))
})
