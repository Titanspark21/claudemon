import { expect, test, vi } from 'vitest'

import { createPokemon } from '../../pokemon.mjs'
import { makeRng } from '../../rng.mjs'
import { stripAnsi } from '../text.mjs'
import {
  DEX_MARKS,
  DEX_SORT,
  OPTIONS_PREVIEW_SPECIES,
  PARTY_SORT,
  UPDATE_FOOTERS,
  UPDATE_HEADINGS,
} from './constants.mjs'
import {
  clampSelection,
  currentIndex,
  dexMark,
  dexSelectionAfterSort,
  evolutionWording,
  nextDexSort,
  nextPartySort,
  noteRows,
  noteText,
  partyEntryAt,
  partySelectionAfterSort,
  previewSpecies,
  sortedDex,
  sortedPartyEntries,
  updateFooter,
  updateHeading,
  zipColumns,
} from './helpers.mjs'

test('Should keep a selection inside the list and pull both ends back in', () => {
  expect(clampSelection(2, 6)).toBe(2)
  expect(clampSelection(0, 6)).toBe(0)
  expect(clampSelection(5, 6)).toBe(5)
  expect(clampSelection(9, 6)).toBe(5)
  expect(clampSelection(-3, 6)).toBe(0)
})

test('Should clamp to the first row when the list holds a single entry', () => {
  expect(clampSelection(0, 1)).toBe(0)
  expect(clampSelection(4, 1)).toBe(0)
})

test('Should clamp to zero when the list is empty', () => {
  expect(clampSelection(0, 0)).toBe(0)
  expect(clampSelection(7, 0)).toBe(0)
  expect(clampSelection(-1, 0)).toBe(0)
})

test('Should pair the two columns row by row', () => {
  expect(zipColumns(['a', 'b'], ['x', 'y'])).toEqual([
    ['a', 'x'],
    ['b', 'y'],
  ])
})

test('Should pad the shorter column with empty strings, whichever side it is', () => {
  expect(zipColumns(['a', 'b', 'c'], ['x'])).toEqual([
    ['a', 'x'],
    ['b', ''],
    ['c', ''],
  ])

  expect(zipColumns(['a'], ['x', 'y', 'z'])).toEqual([
    ['a', 'x'],
    ['', 'y'],
    ['', 'z'],
  ])
})

test('Should keep an empty string in a column rather than treating it as missing', () => {
  expect(zipColumns(['', 'b'], ['x', ''])).toEqual([
    ['', 'x'],
    ['b', ''],
  ])
})

test('Should produce no rows when both columns are empty', () => {
  expect(zipColumns([], [])).toEqual([])
})

test('Should turn a note into rows, dropping it when there is nothing to say', () => {
  expect(noteRows(null)).toEqual([])
  expect(noteRows(undefined)).toEqual([])
  expect(noteRows('')).toEqual([])
  expect(noteRows('Save it for something in the grass.')).toEqual([
    'Save it for something in the grass.',
  ])
  expect(noteRows(['first', 'second'])).toEqual(['first', 'second'])
})

test('Should mark a dex row as caught, seen or unseen', () => {
  expect(stripAnsi(dexMark(true, true))).toBe(DEX_MARKS.caught)
  expect(stripAnsi(dexMark(true, false))).toBe(DEX_MARKS.caught)
  expect(stripAnsi(dexMark(false, true))).toBe(DEX_MARKS.seen)
  expect(stripAnsi(dexMark(false, false))).toBe(DEX_MARKS.unseen)

  expect(
    new Set([dexMark(true, true), dexMark(false, true), dexMark(false, false)])
      .size,
  ).toBe(3)
})

test('Should word an evolution by the trigger that brings it about', () => {
  expect(evolutionWording({ trigger: 'level-up', level: 16 })).toBe(
    'at level 16',
  )
  expect(evolutionWording({ trigger: 'use-item', item: 'thunder-stone' })).toBe(
    'with a thunder stone',
  )
  expect(evolutionWording({ trigger: 'use-item', item: 'moon-stone' })).toBe(
    'with a moon stone',
  )
  expect(evolutionWording({ trigger: 'trade', item: null })).toBe('by trading')
})

test('Should leave the pokedex in number order unless sorting by name', () => {
  const pokedex = [
    { id: 1, name: 'Bulbasaur' },
    { id: 4, name: 'Charmander' },
    { id: 25, name: 'Pikachu' },
  ]

  expect(sortedDex(pokedex, DEX_SORT.number)).toBe(pokedex)
  expect(sortedDex(pokedex, DEX_SORT.name).map((mon) => mon.name)).toEqual([
    'Bulbasaur',
    'Charmander',
    'Pikachu',
  ])
  expect(
    sortedDex(
      [
        { id: 25, name: 'Pikachu' },
        { id: 1, name: 'Bulbasaur' },
      ],
      DEX_SORT.name,
    ).map((mon) => mon.id),
  ).toEqual([1, 25])
})

test('Should sort a party by level, highest first, without losing the party index', () => {
  const rng = makeRng(3)
  const party = [
    createPokemon(1, 5, rng),
    createPokemon(4, 20, rng),
    createPokemon(7, 12, rng),
  ]

  expect(
    sortedPartyEntries(party, PARTY_SORT.level).map((entry) => entry.index),
  ).toEqual([1, 2, 0])
  expect(
    sortedPartyEntries(party, PARTY_SORT.order).map((entry) => entry.mon),
  ).toEqual(party)
  expect(partyEntryAt(party, 0, PARTY_SORT.level).mon).toBe(party[1])
  expect(partyEntryAt(party, 99, PARTY_SORT.order).mon).toBe(party[2])
})

test('Should break a level tie by keeping the earlier party index first', () => {
  const rng = makeRng(11)
  const party = [
    createPokemon(1, 12, rng),
    createPokemon(4, 20, rng),
    createPokemon(7, 12, rng),
  ]

  expect(
    sortedPartyEntries(party, PARTY_SORT.level).map((entry) => entry.index),
  ).toEqual([1, 0, 2])
})

test('Should flip between the two sort modes on each toggle', () => {
  expect(nextPartySort(PARTY_SORT.order)).toBe(PARTY_SORT.level)
  expect(nextPartySort(PARTY_SORT.level)).toBe(PARTY_SORT.order)
  expect(nextDexSort(DEX_SORT.number)).toBe(DEX_SORT.name)
  expect(nextDexSort(DEX_SORT.name)).toBe(DEX_SORT.number)
})

test('Should keep the cursor on the same Pokemon when the party order flips', () => {
  const rng = makeRng(5)
  const party = [
    createPokemon(1, 5, rng),
    createPokemon(4, 20, rng),
    createPokemon(7, 12, rng),
  ]

  expect(
    partySelectionAfterSort(party, 0, PARTY_SORT.order, PARTY_SORT.level),
  ).toBe(2)
  expect(
    partySelectionAfterSort(party, 0, PARTY_SORT.level, PARTY_SORT.order),
  ).toBe(1)
})

test('Should keep the cursor on the same species when the pokedex order flips', () => {
  const pokedex = [
    { id: 1, name: 'Bulbasaur' },
    { id: 4, name: 'Charmander' },
    { id: 25, name: 'Abra' },
  ]

  expect(
    dexSelectionAfterSort(pokedex, 2, DEX_SORT.number, DEX_SORT.name),
  ).toBe(0)
  expect(
    dexSelectionAfterSort(pokedex, 0, DEX_SORT.name, DEX_SORT.number),
  ).toBe(2)
})

test('Should head the update screen with the version it is moving to', () => {
  expect(
    stripAnsi(updateHeading({ state: 'done', from: '0.5.0', to: '0.6.0' })),
  ).toBe('v0.5.0 → v0.6.0')
})

test('Should head a running update with the newest label, even before a version is known', () => {
  expect(
    stripAnsi(updateHeading({ state: 'running', from: '0.5.0', to: null })),
  ).toContain(UPDATE_HEADINGS.newest)
  expect(
    stripAnsi(updateHeading({ state: 'running', from: '0.5.0', to: '0.6.0' })),
  ).toBe(`v0.5.0 → ${UPDATE_HEADINGS.newest}`)
})

test('Should head a finished update that landed nowhere as unchanged', () => {
  expect(
    stripAnsi(updateHeading({ state: 'failed', from: '0.5.0', to: null })),
  ).toBe(`v0.5.0 → ${UPDATE_HEADINGS.unchanged}`)
})

test('Should warn instead of offering a way back while the update runs', () => {
  expect(updateFooter({ state: 'running' })).toBe(UPDATE_FOOTERS.running)
  expect(updateFooter({ state: 'done' })).toBe(UPDATE_FOOTERS.done)
  expect(updateFooter({ state: 'failed' })).toBe(UPDATE_FOOTERS.done)
})

test('Should find the value a setting currently reads out of the config', () => {
  const setting = {
    read: (config) => config.sound !== false,
    values: [
      { value: true, label: 'ON' },
      { value: false, label: 'OFF' },
    ],
  }

  expect(currentIndex(setting, { sound: true })).toBe(0)
  expect(currentIndex(setting, { sound: false })).toBe(1)
})

test('Should fall back to the first value when the config holds something unknown', () => {
  const setting = {
    read: (config) => config.spriteScale,
    values: [
      { value: 1, label: 'FULL' },
      { value: 0.5, label: 'SMALL' },
    ],
  }

  expect(currentIndex(setting, { spriteScale: 0.42 })).toBe(0)
  expect(currentIndex(setting, { spriteScale: 0.5 })).toBe(1)
})

test('Should resolve a note that is only known at draw time by calling it', () => {
  const note = vi.fn(() => 'No player on this machine')

  expect(noteText(note)).toBe('No player on this machine')
  expect(note).toHaveBeenCalledTimes(1)
  expect(note).toHaveBeenCalledWith()
  expect(noteText('No blips.')).toBe('No blips.')
})

test('Should preview the Pokemon leading the party, or the stock one when there is none', () => {
  expect(previewSpecies({ party: [{ species: 7 }, { species: 4 }] })).toBe(7)
  expect(previewSpecies({ party: [] })).toBe(OPTIONS_PREVIEW_SPECIES)
})
