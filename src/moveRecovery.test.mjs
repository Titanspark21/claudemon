import { expect, test } from 'vitest'

import { MOVE_LIMIT } from './constants.mjs'
import { move as moveData } from './data.mjs'
import { expForLevel } from './exp.mjs'
import {
  applyMoveRecoveryExp,
  moveRecoveryStatus,
  queueMissedDaycareMoves,
  recoveryExpRequirement,
  completeMoveRecovery,
  migrateMoveRecovery,
  moveRecoveryStatusText,
  relearnableMoves,
} from './moveRecovery.mjs'
import { createPokemon } from './pokemon.mjs'
import {
  applyVictory,
  queueMoveChoices,
  resolveMoveChoice,
} from './progression.mjs'
import { makeRng } from './rng.mjs'
import { createSave } from './state.mjs'

const moveSlot = (name) => ({
  move: name,
  pp: moveData(name).pp,
  maxPp: moveData(name).pp,
})

test('Should queue every move crossed in Day Care in learnset order', () => {
  const mon = createPokemon(4, 5, makeRng(1))

  queueMissedDaycareMoves(mon, 5, 10)

  expect(mon.moveRecovery.map((entry) => [entry.move, entry.level])).toEqual([
    ['ember', 7],
    ['smokescreen', 10],
  ])
  expect(mon.moveRecovery[0].requiredExp).toBe(
    Math.max(1, Math.ceil((expForLevel(4, 8) - expForLevel(4, 7)) * 0.25)),
  )
})

test('Should not queue a move that is already known or queue the same move twice', () => {
  const mon = createPokemon(4, 5, makeRng(2))

  mon.moves.push(moveSlot('ember'))
  queueMissedDaycareMoves(mon, 5, 10)
  queueMissedDaycareMoves(mon, 5, 10)

  expect(mon.moveRecovery.map((entry) => entry.move)).toEqual(['smokescreen'])
})

test('Should keep overlapping Day Care learnset passes free of duplicate recovery entries', () => {
  const mon = createPokemon(4, 5, makeRng(22))

  queueMissedDaycareMoves(mon, 5, 10)
  queueMissedDaycareMoves(mon, 6, 12)
  queueMissedDaycareMoves(mon, 5, 10)

  const names = mon.moveRecovery.map((entry) => entry.move)
  expect(new Set(names).size).toBe(names.length)
})

test('Should apply won EXP one queued move at a time and carry excess forward', () => {
  const mon = createPokemon(4, 5, makeRng(3))

  queueMissedDaycareMoves(mon, 5, 10)

  const [ember, smokescreen] = mon.moveRecovery
  const extra = Math.max(1, Math.floor(smokescreen.requiredExp / 2))
  const steps = applyMoveRecoveryExp(mon, ember.requiredExp + extra, {
    wonBattle: true,
  })

  expect(steps.map((step) => step.move)).toEqual(['ember'])
  expect(ember.unlocked).toBe(true)
  expect(smokescreen.progressExp).toBe(extra)
  expect(moveRecoveryStatus(mon, smokescreen).remainingExp).toBe(
    smokescreen.requiredExp - extra,
  )
})

test('Should unlock exactly one waiting move per won battle at level 100', () => {
  const mon = createPokemon(4, 100, makeRng(4))

  mon.moves = []
  mon.moveRecovery = []
  queueMissedDaycareMoves(mon, 5, 10)

  expect(applyMoveRecoveryExp(mon, 9999, { wonBattle: false })).toEqual([])
  expect(applyMoveRecoveryExp(mon, 0, { wonBattle: true })).toHaveLength(1)
  expect(mon.moveRecovery.filter((entry) => entry.unlocked)).toHaveLength(1)
  expect(moveRecoveryStatus(mon, mon.moveRecovery[1]).remainingWins).toBe(1)

  expect(applyMoveRecoveryExp(mon, 0, { wonBattle: true })).toHaveLength(1)
  expect(mon.moveRecovery.filter((entry) => entry.unlocked)).toHaveLength(2)
})

test('Should leave a declined recovered move unlocked and remove it only after it is learned', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(5) })
  const mon = save.party[0]

  mon.moves = ['scratch', 'growl', 'tackle', 'leer'].map(moveSlot)
  expect(mon.moves).toHaveLength(MOVE_LIMIT)

  queueMissedDaycareMoves(mon, 5, 7)
  const requirement = recoveryExpRequirement(mon.species, 7)
  const steps = applyVictory(save, [mon], { exp: requirement, money: 0 })
  const choice = steps.find(
    (step) => step.kind === 'learn-choice' && step.source === 'recovery',
  )

  expect(choice?.move).toBe('ember')

  queueMoveChoices(save, [choice])
  expect(save.moveChoices[0]).toMatchObject({
    move: 'ember',
    source: 'recovery',
  })

  resolveMoveChoice(save, null)

  expect(relearnableMoves(mon)).toMatchObject([
    { move: 'ember', unlocked: true },
  ])

  queueMoveChoices(save, [choice])
  resolveMoveChoice(save, 1)

  expect(mon.moves[1].move).toBe('ember')
  expect(relearnableMoves(mon)).toEqual([])
})

test('Should derive forgotten legal moves for an older Pokemon and keep an existing queue stable', () => {
  const mon = createPokemon(4, 10, makeRng(6))

  mon.moves = mon.moves.filter((slot) => slot.move !== 'ember')
  delete mon.moveRecovery

  migrateMoveRecovery(mon)

  expect(mon.moveRecovery).toMatchObject([{ move: 'ember', level: 7 }])

  const first = structuredClone(mon.moveRecovery)
  migrateMoveRecovery(mon)
  expect(mon.moveRecovery).toEqual(first)
})

test('Should normalize malformed recovery entries, discard learned duplicates, and expose status text', () => {
  const mon = createPokemon(4, 5, makeRng(7))

  mon.moveRecovery = [
    null,
    { move: 'scratch', level: 1, requiredExp: 1, progressExp: 0 },
    {
      move: 'ember',
      level: Number.NaN,
      requiredExp: Number.NaN,
      progressExp: Number.NaN,
    },
    { move: 'ember', level: 7, requiredExp: 2, progressExp: 2 },
    { move: '', level: 7, requiredExp: 2, progressExp: 0 },
  ]

  migrateMoveRecovery(mon)

  expect(mon.moveRecovery).toEqual([
    {
      move: 'ember',
      level: 1,
      requiredExp: 1,
      progressExp: 0,
      unlocked: false,
    },
  ])
  expect(moveRecoveryStatusText(mon, mon.moveRecovery[0])).toBe('1 EXP left')

  mon.moveRecovery[0].progressExp = 50
  migrateMoveRecovery(mon)
  expect(mon.moveRecovery[0]).toMatchObject({ progressExp: 1, unlocked: true })
  expect(moveRecoveryStatusText(mon, mon.moveRecovery[0])).toBe(
    'ready to relearn',
  )

  const maxed = createPokemon(4, 100, makeRng(8))
  const locked = {
    move: 'ember',
    level: 7,
    requiredExp: 10,
    progressExp: 0,
    unlocked: false,
  }
  expect(moveRecoveryStatusText(maxed, locked)).toBe('1 won battle left')
})

test('Should handle empty recovery helpers and ignore unusable battle progress', () => {
  expect(completeMoveRecovery({}, 'ember')).toBe(false)
  expect(relearnableMoves({ moves: [] })).toEqual([])

  const mon = createPokemon(4, 5, makeRng(9))

  expect(applyMoveRecoveryExp(mon, Number.NaN)).toEqual([])

  queueMissedDaycareMoves(mon, 5, 7)
  expect(applyMoveRecoveryExp(mon, Number.NaN)).toEqual([])
  expect(applyMoveRecoveryExp(mon, -10)).toEqual([])

  mon.moveRecovery[0].unlocked = true
  expect(applyMoveRecoveryExp(mon, 50)).toEqual([])

  const maxed = createPokemon(4, 100, makeRng(10))
  maxed.moves = []
  maxed.moveRecovery = []
  queueMissedDaycareMoves(maxed, 5, 7)
  maxed.moveRecovery[0].unlocked = true
  expect(applyMoveRecoveryExp(maxed, 0, { wonBattle: true })).toEqual([])
})
