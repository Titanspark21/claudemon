import { expect, test } from 'vitest'

import {
  abilityLabel,
  heldItemLabel,
  ivPercentage,
  monDetail,
  natureLabel,
} from './detail.mjs'
import { stripAnsi, visibleLength } from './text.mjs'

test('Should mark the header with the gender symbol, the level and the status', () => {
  const lines = monDetail({
    species: 1,
    nickname: null,
    exp: 150,
    ivs: {
      hp: 20,
      attack: 3,
      defense: 12,
      spAttack: 14,
      spDefense: 9,
      speed: 7,
    },
    stats: {
      hp: 21,
      attack: 11,
      defense: 12,
      spAttack: 13,
      spDefense: 13,
      speed: 12,
    },
    hp: 9,
    moves: [{ move: 'tackle', pp: 35, maxPp: 35 }],
    status: 'poison',
    statusTurns: 1,
  })

  const header = stripAnsi(lines[0])

  expect(header).toContain('BULBASAUR♀')
  expect(header).toContain('Lv5')
  expect(header).toContain('PSN')
})

test('Should read out the current HP, the stats and the exp left for the next level', () => {
  const plain = monDetail({
    species: 1,
    nickname: 'SPROUT',
    exp: 150,
    ivs: {
      hp: 20,
      attack: 9,
      defense: 12,
      spAttack: 14,
      spDefense: 9,
      speed: 7,
    },
    stats: {
      hp: 21,
      attack: 11,
      defense: 12,
      spAttack: 13,
      spDefense: 13,
      speed: 12,
    },
    hp: 9,
    moves: [{ move: 'tackle', pp: 35, maxPp: 35 }],
    status: null,
    statusTurns: 0,
  }).map(stripAnsi)

  expect(plain[0]).toContain('SPROUT♂')
  expect(plain.find((line) => line.startsWith('HP'))).toContain('9/21')
  expect(plain.find((line) => line.startsWith('EXP'))).toContain('15/44')
  expect(plain).toContain('  Atk  11   Def  12   Spd  12')
  expect(plain).toContain('  SpA  13   SpD  13')
})

test('Should read out max on the exp bar when the Pokemon cannot level up any further', () => {
  const plain = monDetail({
    species: 1,
    nickname: null,
    exp: 1059860,
    ivs: {
      hp: 20,
      attack: 9,
      defense: 12,
      spAttack: 14,
      spDefense: 9,
      speed: 7,
    },
    stats: {
      hp: 294,
      attack: 189,
      defense: 189,
      spAttack: 205,
      spDefense: 205,
      speed: 179,
    },
    hp: 294,
    moves: [{ move: 'tackle', pp: 35, maxPp: 35 }],
    status: null,
    statusTurns: 0,
  }).map(stripAnsi)

  const expLine = plain.find((line) => line.startsWith('EXP'))

  expect(plain[0]).toContain('Lv100')
  expect(expLine).toContain('max')
  expect(expLine).not.toMatch(/\d+\/\d+/)
})

test('Should describe neutral and modified natures without relying on colour', () => {
  expect(natureLabel('hardy')).toBe('Hardy (neutral)')
  expect(natureLabel('adamant')).toBe('Adamant (+Atk / -SpA)')
})

test('Should label hidden abilities and held items in plain text', () => {
  const mon = {
    species: 1,
    ability: 'chlorophyll',
    heldItem: 'oran-berry',
  }

  expect(abilityLabel(mon)).toBe('Chlorophyll (Hidden)')
  expect(heldItemLabel(mon)).toBe('Oran Berry')
  expect(heldItemLabel({ ...mon, heldItem: null })).toBe('None')
})

test('Should score perfect and zero IV spreads at their exact endpoints', () => {
  const perfect = {
    hp: 31,
    attack: 31,
    defense: 31,
    spAttack: 31,
    spDefense: 31,
    speed: 31,
  }
  const zero = Object.fromEntries(Object.keys(perfect).map((key) => [key, 0]))

  expect(ivPercentage(perfect)).toBe(100)
  expect(ivPercentage(zero)).toBe(0)
})

test('Should keep identity, IVs and moves readable in an 80-column team layout', () => {
  const mon = {
    species: 1,
    nickname: null,
    exp: 150,
    ivs: {
      hp: 31,
      attack: 31,
      defense: 31,
      spAttack: 31,
      spDefense: 31,
      speed: 31,
    },
    nature: 'adamant',
    ability: 'chlorophyll',
    heldItem: 'oran-berry',
    stats: {
      hp: 21,
      attack: 11,
      defense: 12,
      spAttack: 13,
      spDefense: 13,
      speed: 12,
    },
    hp: 9,
    moves: [
      { move: 'growl', pp: 38, maxPp: 40 },
      { move: 'tackle', pp: 35, maxPp: 35 },
    ],
    status: null,
    statusTurns: 0,
  }
  const width = 45
  const plain = monDetail(mon, { width }).map(stripAnsi)
  const text = plain.join('\n')

  expect(text).toContain('Identity')
  expect(text).toContain('Form Base')
  expect(text).toContain('Adamant (+Atk / -SpA)')
  expect(text).toContain('Chlorophyll (Hidden)')
  expect(text).toContain('Oran Berry')
  expect(text).toContain('IVs · 186/186 · 100%')
  expect(text).toContain('HP 31')
  expect(text).toContain('Spd 31')
  expect(text).toContain('Growl')
  expect(text).toContain('Tackle')
  expect(Math.max(...plain.map(visibleLength))).toBeLessThanOrEqual(width)
})

test('Should stack move metadata at minimum width instead of colliding with IVs', () => {
  const mon = {
    species: 10001,
    nickname: null,
    exp: 150,
    ivs: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
    },
    nature: 'hardy',
    ability: 'gluttony',
    heldItem: null,
    stats: {
      hp: 21,
      attack: 11,
      defense: 12,
      spAttack: 13,
      spDefense: 13,
      speed: 12,
    },
    hp: 9,
    moves: [
      { move: 'growl', pp: 38, maxPp: 40 },
      { move: 'tackle', pp: 35, maxPp: 35 },
    ],
    status: null,
    statusTurns: 0,
  }
  const width = 38
  const plain = monDetail(mon, { width }).map(stripAnsi)
  const text = plain.join('\n')

  expect(text).toContain('Form Alola')
  expect(text).toContain('Hardy (neutral)')
  expect(text).toContain('IVs · 0/186 · 0%')
  expect(text).toContain('Growl')
  expect(text).toMatch(/Growl\n.*pow —.*pp 38\/40/)
  expect(Math.max(...plain.map(visibleLength))).toBeLessThanOrEqual(width)
})

test('Should show an em dash instead of a power for a status move', () => {
  const plain = monDetail({
    species: 1,
    nickname: null,
    exp: 150,
    ivs: {
      hp: 20,
      attack: 9,
      defense: 12,
      spAttack: 14,
      spDefense: 9,
      speed: 7,
    },
    stats: {
      hp: 21,
      attack: 11,
      defense: 12,
      spAttack: 13,
      spDefense: 13,
      speed: 12,
    },
    hp: 9,
    moves: [
      { move: 'growl', pp: 38, maxPp: 40 },
      { move: 'tackle', pp: 35, maxPp: 35 },
    ],
    status: null,
    statusTurns: 0,
  }).map(stripAnsi)

  const growl = plain.find((line) => line.includes('Growl'))
  const tackle = plain.find((line) => line.includes('Tackle'))

  expect(growl).toContain('pow —    pp 38/40')
  expect(tackle).toContain('pow 40   pp 35/35')
})
