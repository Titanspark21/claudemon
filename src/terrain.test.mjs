import { expect, test } from 'vitest'
import { createBattleField } from './battleField.mjs'
import { registerEffect, runEffectPhase } from './effects.mjs'
import { fieldHandlers, startTerrain } from './terrain.mjs'
import { battleSideOf, isGrounded } from './typechart.mjs'

test('Should start and replace terrain with explicit source and duration', () => {
  const battle = { field: createBattleField(), effects: [] }

  expect(startTerrain(battle, 'electric', 'electric-surge', 5)).toEqual([
    {
      type: 'field',
      kind: 'terrain',
      key: 'electric',
      source: 'electric-surge',
      turns: 5,
    },
  ])

  startTerrain(battle, 'grassy', 'terrain-extender', 8)

  expect(battle.field.terrain).toEqual({
    key: 'grassy',
    source: 'terrain-extender',
    turns: 8,
  })
})

test('Should normalize terrain names and reject invalid field input', () => {
  const battle = { field: createBattleField(), effects: [] }

  startTerrain(battle, 'electric-terrain', 'test')

  expect(battle.field.terrain).toEqual({
    key: 'electric',
    source: 'test',
    turns: 5,
  })
  expect(() => startTerrain(battle, 'inverse', 'test', 5)).toThrow(
    'Unknown terrain',
  )
  expect(() => startTerrain(battle, 'electric', 'test', -1)).toThrow(
    'Invalid field duration',
  )
})

test.each([
  ['electric', 'electric', 'test-move', 150],
  ['grassy', 'grass', 'test-move', 150],
  ['psychic', 'psychic', 'test-move', 150],
  ['misty', 'dragon', 'test-move', 50],
  ['grassy', 'ground', 'earthquake', 50],
])(
  'Should apply %s terrain damage rules for %s moves',
  (terrain, type, key, expected) => {
    const battle = {
      field: createBattleField(),
      effects: [],
      player: { mon: { species: 25 } },
      foe: { mon: { species: 19 } },
    }

    startTerrain(battle, terrain, 'test', 5)
    for (const effect of fieldHandlers(battle.field)) {
      registerEffect(battle.effects, effect)
    }

    const result = runEffectPhase(battle, 'modifyPower', {
      attacker: 'player',
      defender: 'foe',
      move: { type, key },
      value: 100,
    })

    expect(result.value).toBe(expected)
  },
)

test('Should require a grounded attacker for terrain power boosts', () => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { species: 16 } },
    foe: { mon: { species: 19 } },
  }

  startTerrain(battle, 'electric', 'test', 5)
  for (const effect of fieldHandlers(battle.field)) {
    registerEffect(battle.effects, effect)
  }

  const result = runEffectPhase(battle, 'modifyPower', {
    attacker: 'player',
    defender: 'foe',
    move: { type: 'electric', key: 'thunderbolt' },
    value: 100,
  })

  expect(result.value).toBe(100)
})

test.each([
  ['electric', 'sleep', true],
  ['electric', 'burn', false],
  ['misty', 'sleep', true],
  ['misty', 'burn', true],
])(
  'Should apply %s terrain status prevention to %s',
  (terrain, status, cancelled) => {
    const battle = {
      field: createBattleField(),
      effects: [],
      player: { mon: { species: 25 } },
      foe: { mon: { species: 19 } },
    }

    startTerrain(battle, terrain, 'test', 5)
    for (const effect of fieldHandlers(battle.field)) {
      registerEffect(battle.effects, effect)
    }

    const result = runEffectPhase(battle, 'tryStatus', {
      attacker: 'player',
      defender: 'foe',
      value: status,
    })

    expect(result.cancelled).toBe(cancelled)
  },
)

test('Should block positive priority against grounded targets in Psychic Terrain', () => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { species: 25 } },
    foe: { mon: { species: 19 } },
  }

  startTerrain(battle, 'psychic', 'test', 5)
  for (const effect of fieldHandlers(battle.field)) {
    registerEffect(battle.effects, effect)
  }

  const blocked = runEffectPhase(battle, 'modifyPriority', {
    attacker: 'player',
    defender: 'foe',
    move: { type: 'normal', key: 'quick-attack' },
    value: 1,
  })
  const ordinary = runEffectPhase(battle, 'modifyPriority', {
    attacker: 'player',
    defender: 'foe',
    move: { type: 'normal', key: 'tackle' },
    value: 0,
  })

  expect(blocked.cancelled).toBe(true)
  expect(ordinary.cancelled).toBe(false)
})

test('Should resolve effect actors from side names and actor references', () => {
  const battle = {
    player: { mon: { species: 25 } },
    foe: { mon: { species: 19 } },
  }

  expect(battleSideOf(battle, 'player')).toBe('player')
  expect(battleSideOf(battle, battle.player)).toBe('player')
  expect(battleSideOf(battle, battle.foe)).toBe('foe')
  expect(battleSideOf(battle, null)).toBeNull()
})

test.each([
  [{ species: 19 }, true],
  [{ species: 16 }, false],
  [{ species: 92, ability: 'levitate' }, false],
  [{ species: 25, heldItem: 'air-balloon' }, false],
])(
  'Should share grounded rules for Flying, Levitate and Air Balloon',
  (mon, expected) => {
    const battle = {
      player: { mon },
      foe: { mon: { species: 19 } },
    }

    expect(isGrounded(battle, 'player')).toBe(expected)
  },
)

test('Should heal grounded Pokemon on Grassy Terrain before duration expires', () => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { species: 25, hp: 80, stats: { hp: 96 } } },
    foe: { mon: { species: 16, hp: 80, stats: { hp: 96 } } },
  }

  startTerrain(battle, 'grassy', 'test', 1)
  for (const effect of fieldHandlers(battle.field)) {
    registerEffect(battle.effects, effect)
  }

  const result = runEffectPhase(battle, 'endTurn')

  expect(battle.player.mon.hp).toBe(86)
  expect(battle.foe.mon.hp).toBe(80)
  expect(battle.field.terrain).toBeNull()
  expect(result.events).toContainEqual({
    type: 'field-end',
    kind: 'terrain',
    key: 'grassy',
  })
})

test('Should expose no handlers when the field is empty', () => {
  expect(fieldHandlers(createBattleField())).toEqual([])
})

test('Should order field handlers deterministically after side ability and item effects', () => {
  const battle = {
    field: createBattleField(),
    effects: [],
    player: { mon: { species: 25 } },
    foe: { mon: { species: 19 } },
  }
  const seen = []

  startTerrain(battle, 'electric', 'test', 5)
  registerEffect(battle.effects, {
    side: 'player',
    sourceType: 'ability',
    key: 'ability-first',
    phase: 'modifyPower',
    priority: 0,
    handler: ({ value }) => {
      seen.push('ability')
      return value
    },
  })
  registerEffect(battle.effects, {
    side: 'player',
    sourceType: 'item',
    key: 'item-second',
    phase: 'modifyPower',
    priority: 0,
    handler: ({ value }) => {
      seen.push('item')
      return value
    },
  })
  for (const effect of fieldHandlers(battle.field)) {
    registerEffect(battle.effects, {
      ...effect,
      handler: (state) => {
        seen.push('field')
        return effect.handler(state)
      },
    })
  }

  runEffectPhase(battle, 'modifyPower', {
    attacker: 'player',
    defender: 'foe',
    move: { type: 'electric', key: 'thunderbolt' },
    value: 100,
  })

  expect(seen).toEqual(['ability', 'item', 'field'])
})
