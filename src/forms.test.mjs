import { expect, test } from 'vitest'

import { loadData, sourceSpeciesIdentity } from './data.mjs'
import { eggSpeciesForPair } from './daycare.mjs'
import { baseFamilyRoot, familyRoot, isPersistentSpecies } from './forms.mjs'
import {
  createPokemon,
  linkCableEvolution,
  stoneEvolution,
} from './pokemon.mjs'
import { makeRng } from './rng.mjs'

test('Should treat all 18 Alolan records as permanent forms and Mega records as battle only', () => {
  const alolan = loadData().speciesIdentities.records.filter(
    (identity) => identity.formKey === 'alola',
  )

  expect(alolan).toHaveLength(18)
  expect(
    alolan.every((identity) => identity.collectible && !identity.battleOnly),
  ).toBe(true)
  expect(isPersistentSpecies(sourceSpeciesIdentity('charizardmegax').id)).toBe(
    false,
  )
})

test('Should resolve regional and National family roots through explicit relationships', () => {
  expect(familyRoot(sourceSpeciesIdentity('raticatealola').id)).toBe(
    sourceSpeciesIdentity('rattataalola').id,
  )
  expect(baseFamilyRoot(sourceSpeciesIdentity('raticatealola').id)).toBe(19)
})

test('Should allow an explicit normal versus Alolan evolution choice', () => {
  const pikachu = createPokemon(25, 30, makeRng(4))

  expect(stoneEvolution(pikachu, 'thunder-stone')).toBe(26)
  expect(stoneEvolution(pikachu, 'thunder-stone', 'alola')).toBe(
    sourceSpeciesIdentity('raichualola').id,
  )
})

test('Should resolve normal and regional trade evolutions through the Link Cable rule', () => {
  const graveler = createPokemon(75, 30, makeRng(5))
  const alolan = createPokemon(
    sourceSpeciesIdentity('graveleralola').id,
    30,
    makeRng(6),
  )

  expect(linkCableEvolution(graveler)).toBe(76)
  expect(linkCableEvolution(alolan)).toBe(
    sourceSpeciesIdentity('golemalola').id,
  )
})

test('Should inherit a regional family root only when that parent holds an Everstone', () => {
  const regional = createPokemon(
    sourceSpeciesIdentity('raticatealola').id,
    30,
    makeRng(7),
  )
  const ditto = createPokemon(132, 30, makeRng(8))

  expect(eggSpeciesForPair(regional, ditto)).toBe(19)

  regional.heldItem = 'everstone'

  expect(eggSpeciesForPair(regional, ditto)).toBe(
    sourceSpeciesIdentity('rattataalola').id,
  )
})
