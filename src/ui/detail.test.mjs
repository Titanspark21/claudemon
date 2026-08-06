import { expect, test } from 'vitest'

import { monDetail } from './detail.mjs'
import { stripAnsi } from './text.mjs'

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
