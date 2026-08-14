import { expect, test } from 'vitest'

import { createBattleField } from './battleField.mjs'
import { move } from './data.mjs'
import {
  applyMoveFieldEffect,
  moveCanExecute,
  moveEffectHandlers,
  moveHasFlag,
  resolveMoveCoverage,
  rollMoveHits,
  runMoveEffectPhase,
} from './moveEffects.mjs'

const FAMILY_CASES = [
  {
    family: 'ordinary damage',
    key: 'move:damage',
    move: { key: 'tackle', damageClass: 'physical', power: 40, flags: [] },
  },
  {
    family: 'status',
    key: 'move:status',
    move: {
      key: 'thunder-wave',
      damageClass: 'status',
      ailment: 'paralysis',
      flags: [],
    },
  },
  {
    family: 'stat stages',
    key: 'move:stat-stages',
    move: {
      key: 'growl',
      damageClass: 'status',
      statChanges: [{ stat: 'attack', change: -1 }],
      flags: [],
    },
  },
  {
    family: 'priority',
    key: 'move:priority',
    move: {
      key: 'quick-attack',
      damageClass: 'physical',
      power: 40,
      priority: 1,
      flags: [],
    },
  },
  {
    family: 'multi-hit',
    key: 'move:multi-hit',
    move: {
      key: 'double-slap',
      damageClass: 'physical',
      power: 15,
      minHits: 2,
      maxHits: 5,
      flags: [],
    },
  },
  {
    family: 'recoil',
    key: 'move:recoil',
    move: {
      key: 'take-down',
      damageClass: 'physical',
      power: 90,
      drain: -25,
      flags: [],
    },
  },
  {
    family: 'drain',
    key: 'move:drain',
    move: {
      key: 'giga-drain',
      damageClass: 'special',
      power: 75,
      drain: 50,
      flags: [],
    },
  },
  {
    family: 'healing',
    key: 'move:healing',
    move: {
      key: 'recover',
      damageClass: 'status',
      healing: 50,
      flags: [],
    },
  },
  {
    family: 'fixed damage',
    key: 'move:fixed-damage',
    move: {
      key: 'dragon-rage',
      damageClass: 'special',
      fixedDamage: 40,
      flags: [],
    },
  },
  {
    family: 'OHKO',
    key: 'move:ohko',
    move: {
      key: 'sheer-cold',
      damageClass: 'special',
      ohko: true,
      flags: [],
    },
  },
  {
    family: 'contact',
    key: 'move:contact',
    move: {
      key: 'tackle',
      damageClass: 'physical',
      power: 40,
      flags: ['contact'],
    },
  },
  {
    family: 'sound',
    key: 'move:sound',
    move: {
      key: 'boomburst',
      damageClass: 'special',
      power: 140,
      flags: ['sound'],
    },
  },
  {
    family: 'powder',
    key: 'move:powder',
    move: {
      key: 'sleep-powder',
      damageClass: 'status',
      ailment: 'sleep',
      flags: ['powder'],
    },
  },
]

test.each(FAMILY_CASES)(
  'Should expose the $family move family',
  ({ key, move }) => {
    expect(moveEffectHandlers(move).map((handler) => handler.key)).toContain(
      key,
    )
  },
)

test('Should use the Generation VII distribution for ordinary two-to-five-hit moves', () => {
  const rolls = [0.01, 0.13, 0.26, 0.38, 0.51, 0.63, 0.76, 0.9]
  let index = 0
  const rng = () => rolls[index++]
  const multiHit = { minHits: 2, maxHits: 5 }

  expect(rolls.map(() => rollMoveHits(rng, multiHit))).toEqual([
    2, 2, 2, 3, 3, 3, 4, 5,
  ])
})

test('Should resolve single-hit and nonstandard multi-hit ranges', () => {
  expect(rollMoveHits(() => 0.5, {})).toBe(1)
  expect(rollMoveHits(() => 0.5, { minHits: 2, maxHits: 3 })).toBe(3)
  expect(rollMoveHits(() => 0.5, { maxHits: 3 })).toBe(3)
})

test('Should preserve imported contact, sound and powder flags', () => {
  expect(moveHasFlag(move('tackle'), 'contact')).toBe(true)
  expect(moveHasFlag(move('boomburst'), 'sound')).toBe(true)
  expect(moveHasFlag(move('sleep-powder'), 'powder')).toBe(true)
})

test('Should expose fixed-damage and OHKO metadata from the pinned move source', () => {
  expect(move('dragon-rage').fixedDamage).toBe(40)
  expect(move('seismic-toss').fixedDamage).toBe('level')
  expect(move('sheer-cold').ohko).toBe(true)
})

test('Should chain weather and terrain power modifiers through the effect pipeline', () => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { species: 4 } },
    foe: { mon: { species: 1 } },
  }
  const fireMove = {
    key: 'ember',
    type: 'fire',
    power: 40,
    damageClass: 'special',
    flags: [],
  }
  const grassMove = {
    key: 'vine-whip',
    type: 'grass',
    power: 45,
    damageClass: 'physical',
    flags: ['contact'],
  }

  battle.field.weather = { key: 'sun', source: 'test', turns: 5 }

  expect(
    runMoveEffectPhase(battle, 'modifyPower', {
      attacker: battle.player,
      defender: battle.foe,
      move: fireMove,
      value: fireMove.power,
    }).value,
  ).toBe(60)

  battle.field.weather = null
  battle.field.terrain = { key: 'grassy', source: 'test', turns: 5 }

  expect(
    runMoveEffectPhase(battle, 'modifyPower', {
      attacker: battle.player,
      defender: battle.foe,
      move: grassMove,
      value: grassMove.power,
    }).value,
  ).toBe(67)
})

test('Should change Weather Ball type and power while weather is active', () => {
  const battle = {
    field: {
      weather: { key: 'rain', source: 'test', turns: 5 },
      terrain: null,
    },
    effects: [],
    player: { mon: { species: 7 } },
    foe: { mon: { species: 4 } },
  }
  const weatherBall = {
    key: 'weather-ball',
    type: 'normal',
    power: 50,
    damageClass: 'special',
    flags: ['bullet'],
  }
  const type = runMoveEffectPhase(battle, 'modifyMoveType', {
    attacker: battle.player,
    defender: battle.foe,
    move: weatherBall,
    value: weatherBall.type,
  })
  const power = runMoveEffectPhase(battle, 'modifyPower', {
    attacker: battle.player,
    defender: battle.foe,
    move: { ...weatherBall, type: type.value },
    value: weatherBall.power,
  })

  expect(type.value).toBe('water')
  expect(power.value).toBe(150)
})

test('Should leave Weather Ball unchanged without weather or a field registry', () => {
  const battle = {
    player: { mon: { species: 7 } },
    foe: { mon: { species: 4 } },
  }
  const weatherBall = {
    ...move('weather-ball'),
    key: 'weather-ball',
  }
  const type = runMoveEffectPhase(battle, 'modifyMoveType', {
    attacker: battle.player,
    defender: battle.foe,
    move: weatherBall,
    value: weatherBall.type,
  })
  const power = runMoveEffectPhase(battle, 'modifyPower', {
    attacker: battle.player,
    defender: battle.foe,
    move: weatherBall,
    value: weatherBall.power,
  })

  expect(type.value).toBe('normal')
  expect(power.value).toBe(50)
})

test('Should start weather and terrain from their Generation VII setter moves', () => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { species: 25, heldItem: 'damp-rock' } },
    foe: { mon: { species: 16 } },
  }

  expect(
    applyMoveFieldEffect(battle, 'player', { key: 'rain-dance' }),
  ).toContainEqual({
    type: 'field',
    kind: 'weather',
    key: 'rain',
    source: { side: 'player', move: 'rain-dance' },
    turns: 8,
  })
  expect(battle.field.weather.key).toBe('rain')

  battle.player.mon.heldItem = 'terrain-extender'
  expect(
    applyMoveFieldEffect(battle, 'player', { key: 'grassy-terrain' }),
  ).toContainEqual({
    type: 'field',
    kind: 'terrain',
    key: 'grassy',
    source: { side: 'player', move: 'grassy-terrain' },
    turns: 8,
  })
  expect(battle.field.terrain.key).toBe('grassy')
  expect(applyMoveFieldEffect(battle, 'player', { key: 'tackle' })).toEqual([])
})

test('Should recognize each supported runtime coverage path', () => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { species: 19 } },
    foe: { mon: { species: 19 } },
  }

  expect(moveCanExecute(battle, 'player', { key: 'struggle' })).toBe(true)
  expect(
    moveCanExecute(battle, 'player', { ...move('tackle'), key: 'tackle' }),
  ).toBe(true)
  expect(
    moveCanExecute(battle, 'player', {
      ...move('rain-dance'),
      key: 'rain-dance',
    }),
  ).toBe(true)
  expect(
    moveCanExecute(battle, 'player', {
      ...move('dragon-rage'),
      key: 'dragon-rage',
    }),
  ).toBe(true)
  expect(
    moveCanExecute(battle, 'player', {
      ...move('sheer-cold'),
      key: 'sheer-cold',
    }),
  ).toBe(true)
})

test('Should enforce Psychic Terrain priority blocking for either attacking side', () => {
  const battle = {
    field: {
      weather: null,
      terrain: { key: 'psychic', source: 'test', turns: 5 },
    },
    effects: [],
    player: { mon: { species: 19 } },
    foe: { mon: { species: 19 } },
  }
  const quickAttack = { ...move('quick-attack'), key: 'quick-attack' }

  expect(moveCanExecute(battle, 'player', quickAttack)).toBe(false)
  expect(moveCanExecute(battle, 'foe', quickAttack)).toBe(false)

  battle.field.terrain.key = 'grassy'

  expect(moveCanExecute(battle, 'player', quickAttack)).toBe(true)
})

test('Should keep deferred moves visible but non-executable with their coverage reason', () => {
  const coverage = resolveMoveCoverage('metronome')
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { hp: 10, stats: { hp: 20 } } },
    foe: { mon: { hp: 10, stats: { hp: 20 } } },
  }

  expect(coverage.status).toBe('deferred-complex-one-off')
  expect(coverage.reason).toMatch(/copy|replay|battle state/i)
  expect(
    moveCanExecute(battle, 'player', {
      ...move('metronome'),
      key: 'metronome',
    }),
  ).toBe(false)
})

test('Should reject a falsely generic custom move until its dedicated runtime semantics exist', () => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { hp: 10, stats: { hp: 20 } } },
    foe: { mon: { hp: 10, stats: { hp: 20 } } },
  }

  expect(
    moveCanExecute(battle, 'player', {
      ...move('counter'),
      key: 'counter',
    }),
  ).toBe(false)
})
