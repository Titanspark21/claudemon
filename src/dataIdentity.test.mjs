import { expect, test } from 'vitest'
import {
  baseSpeciesIdentity,
  dexEntryForSpecies,
  displayDexNumber,
  sourceSpeciesIdentity,
  speciesForms,
  speciesIdentity,
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
