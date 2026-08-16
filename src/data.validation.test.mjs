import { expect, test } from 'vitest'
import { loadData, validateGeneratedData } from './data.mjs'

const dataset = () => loadData()

test('Should reject each incomplete generated-data boundary explicitly', () => {
  const data = dataset()
  const identities = data.speciesIdentities.records

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
    validateGeneratedData({
      ...data,
      pokedex: data.pokedex.slice(1),
    }),
  ).toBe(false)

  const missingSpecies = new Map(data.byId)
  missingSpecies.delete(identities[0].id)
  expect(validateGeneratedData({ ...data, byId: missingSpecies })).toBe(false)
  expect(validateGeneratedData({ ...data, moves: {} })).toBe(false)
  expect(validateGeneratedData({ ...data, items: {} })).toBe(false)

  const invalidIdentity = new Map(data.identityById)
  invalidIdentity.set(1, { ...invalidIdentity.get(1), dexNumber: 2 })
  expect(
    validateGeneratedData({ ...data, identityById: invalidIdentity }),
  ).toBe(false)
})

test('Should accept the complete bundled generated dataset', () => {
  expect(validateGeneratedData(dataset())).toBe(true)
})
