import { expect, test } from 'vitest'
import { createBattleField } from './battleField.mjs'
import { registerEffect, runEffectPhase } from './effects.mjs'
import { fieldHandlers } from './terrain.mjs'
import { startWeather } from './weather.mjs'

test('Should start and replace weather with explicit source and duration', () => {
  const battle = { field: createBattleField(), effects: [] }

  expect(startWeather(battle, 'rain', 'drizzle', 5)).toEqual([
    {
      type: 'field',
      kind: 'weather',
      key: 'rain',
      source: 'drizzle',
      turns: 5,
    },
  ])
  expect(battle.field.weather).toEqual({
    key: 'rain',
    source: 'drizzle',
    turns: 5,
  })

  startWeather(battle, 'sun', 'heat-rock', 8)

  expect(battle.field.weather).toEqual({
    key: 'sun',
    source: 'heat-rock',
    turns: 8,
  })
})

test('Should normalize harsh sunlight and reject invalid weather duration', () => {
  const battle = { field: createBattleField(), effects: [] }

  startWeather(battle, 'harsh-sunlight', 'test')

  expect(battle.field.weather).toEqual({ key: 'sun', source: 'test', turns: 5 })
  expect(() => startWeather(battle, 'fog', 'test', 5)).toThrow(
    'Unknown weather',
  )
  expect(() => startWeather(battle, 'rain', 'test', 0)).toThrow(
    'Invalid field duration',
  )
})

test.each([
  ['rain', 'water', 150],
  ['rain', 'fire', 50],
  ['sun', 'fire', 150],
  ['sun', 'water', 50],
])('Should modify %s damage for %s moves', (weather, type, expected) => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { species: 25 } },
    foe: { mon: { species: 19 } },
  }

  startWeather(battle, weather, 'test', 5)
  for (const effect of fieldHandlers(battle.field)) {
    registerEffect(battle.effects, effect)
  }

  const result = runEffectPhase(battle, 'modifyPower', {
    attacker: 'player',
    defender: 'foe',
    move: { type, key: 'test-move' },
    value: 100,
  })

  expect(result.value).toBe(expected)
})

test('Should boost Rock special defense during sandstorm', () => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { species: 25 } },
    foe: { mon: { species: 74 } },
  }

  startWeather(battle, 'sandstorm', 'test', 5)
  for (const effect of fieldHandlers(battle.field)) {
    registerEffect(battle.effects, effect)
  }

  const special = runEffectPhase(battle, 'modifyDamage', {
    attacker: 'player',
    defender: 'foe',
    move: { type: 'water', damageClass: 'special' },
    value: 90,
  })
  const physical = runEffectPhase(battle, 'modifyDamage', {
    attacker: 'player',
    defender: 'foe',
    move: { type: 'water', damageClass: 'physical' },
    value: 90,
  })

  expect(special.value).toBe(60)
  expect(physical.value).toBe(90)
})

test('Should leave sand special defense unchanged without a defender source', () => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { species: 25 } },
    foe: { mon: { species: 74 } },
  }

  startWeather(battle, 'sandstorm', 'test', 5)
  for (const effect of fieldHandlers(battle.field)) {
    registerEffect(battle.effects, effect)
  }

  const result = runEffectPhase(battle, 'modifyDamage', {
    move: { type: 'water', damageClass: 'special' },
    value: 90,
  })

  expect(result.value).toBe(90)
})

test.each([
  ['sandstorm', 25, 90],
  ['sandstorm', 74, 96],
  ['hail', 25, 90],
  ['hail', 87, 96],
])(
  'Should apply %s residual damage only to vulnerable species',
  (weather, species, expectedHp) => {
    const battle = {
      field: createBattleField(),
      effects: [],
      player: {
        mon: { species, hp: 96, stats: { hp: 96 } },
      },
      foe: {
        mon: { species: 19, hp: 96, stats: { hp: 96 } },
      },
    }

    startWeather(battle, weather, 'test', 5)
    for (const effect of fieldHandlers(battle.field)) {
      registerEffect(battle.effects, effect)
    }

    runEffectPhase(battle, 'endTurn')

    expect(battle.player.mon.hp).toBe(expectedHp)
  },
)

test('Should decrement field duration once and expire weather after its final turn', () => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { species: 25, hp: 96, stats: { hp: 96 } } },
    foe: { mon: { species: 19, hp: 96, stats: { hp: 96 } } },
  }

  startWeather(battle, 'hail', 'test', 2)
  for (const effect of fieldHandlers(battle.field)) {
    registerEffect(battle.effects, effect)
  }

  runEffectPhase(battle, 'endTurn')
  expect(battle.field.weather.turns).toBe(1)

  const result = runEffectPhase(battle, 'endTurn')

  expect(battle.field.weather).toBeNull()
  expect(result.events).toContainEqual({
    type: 'field-end',
    kind: 'weather',
    key: 'hail',
  })
})
