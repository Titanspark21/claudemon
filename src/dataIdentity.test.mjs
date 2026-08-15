import { expect, test } from 'vitest'
import {
  baseSpeciesIdentity,
  dexEntryForSpecies,
  displayDexNumber,
  loadData,
  sourceSpeciesIdentity,
  speciesForms,
  speciesIdentity,
  tradeDataset,
  tradeDatasetCompatible,
  validateGeneratedData,
} from './data.mjs'

test('Should resolve species identities through explicit relationships', () => {
  expect(speciesIdentity(1).sourceKey).toBe('bulbasaur')
  expect(sourceSpeciesIdentity('rattataalola').id).toBe(10001)
  expect(baseSpeciesIdentity(20002).id).toBe(6)
  expect(speciesForms(6).map((record) => record.sourceKey)).toEqual([
    'charizardmegax',
    'charizardmegay',
  ])
  expect(displayDexNumber(20002)).toBe(6)
})

test('Should partition permanent and battle-only Dex entries', () => {
  expect(dexEntryForSpecies(1)).toEqual({ dexNumber: 1, formId: null })
  expect(dexEntryForSpecies(10001)).toEqual({
    dexNumber: 19,
    formId: 10001,
  })
  expect(() => dexEntryForSpecies(20002)).toThrow(
    'battle-only species cannot be persisted',
  )
})

test('Should reject unknown identity lookups', () => {
  expect(() => speciesIdentity(999999)).toThrow('no species identity')
  expect(() => sourceSpeciesIdentity('missing-form')).toThrow(
    'no species identity named',
  )
})

test('Should validate the checked-in Generation VII dataset and reject incomplete variants', () => {
  const data = loadData()

  expect(validateGeneratedData(data)).toBe(true)
  expect(
    validateGeneratedData({
      ...data,
      mechanicsCoverage: { ...data.mechanicsCoverage, generation: 6 },
    }),
  ).toBe(false)
  expect(
    validateGeneratedData({
      ...data,
      speciesIdentities: { ...data.speciesIdentities, version: null },
    }),
  ).toBe(false)
  expect(
    validateGeneratedData({
      ...data,
      progression: {
        ...data.progression,
        metadata: { ...data.progression.metadata, nationalDexTotal: 808 },
      },
    }),
  ).toBe(false)
  expect(
    validateGeneratedData({
      ...data,
      speciesIdentities: { ...data.speciesIdentities, records: [] },
    }),
  ).toBe(false)
  expect(
    validateGeneratedData({ ...data, pokedex: data.pokedex.slice(1) }),
  ).toBe(false)
  expect(validateGeneratedData({ ...data, moves: {} })).toBe(false)

  const missingIdentity = new Map(data.identityById)
  missingIdentity.delete(1)
  expect(
    validateGeneratedData({ ...data, identityById: missingIdentity }),
  ).toBe(false)
})

test('Should compare trade dataset descriptors without a network lookup', () => {
  const descriptor = tradeDataset()

  expect(tradeDatasetCompatible(descriptor)).toBe(true)
  expect(tradeDatasetCompatible({ legacy: true })).toBe(true)
  expect(tradeDatasetCompatible(null)).toBe(false)
  expect(
    tradeDatasetCompatible({ ...descriptor, fingerprint: 'different' }),
  ).toBe(false)
})
