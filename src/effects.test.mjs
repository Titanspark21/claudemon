import { expect, test } from 'vitest'
import { effectSources, registerEffect, runEffectPhase } from './effects.mjs'

const effect = (key, priority, handler, extra = {}) => ({
  sourceType: 'ability',
  key,
  phase: 'modifyDamage',
  priority,
  handler,
  ...extra,
})

test('Should order effects by priority, side, source and stable registration', () => {
  const registry = []
  const seen = []

  registerEffect(
    registry,
    effect('late', 0, () => seen.push('late')),
  )
  registerEffect(
    registry,
    effect('foe', 1, () => seen.push('foe'), { side: 'foe' }),
  )
  registerEffect(
    registry,
    effect('player', 1, () => seen.push('player'), { side: 'player' }),
  )

  runEffectPhase({ effects: registry }, 'modifyDamage')

  expect(seen).toEqual(['player', 'foe', 'late'])
})

test('Should chain values and collect messages', () => {
  const registry = []

  registerEffect(
    registry,
    effect('double', 2, ({ value }) => value * 2),
  )
  registerEffect(
    registry,
    effect('add', 1, ({ value }) => ({
      value: value + 3,
      event: { type: 'message', text: 'boosted' },
    })),
  )

  expect(
    runEffectPhase({ effects: registry }, 'modifyDamage', { value: 5 }),
  ).toMatchObject({
    value: 13,
    events: [{ type: 'message', text: 'boosted' }],
  })
})

test('Should stop a phase when an effect cancels it', () => {
  const registry = []
  const seen = []

  registerEffect(
    registry,
    effect('cancel', 2, () => ({ cancelled: true })),
  )
  registerEffect(
    registry,
    effect('never', 1, () => seen.push('never')),
  )

  expect(runEffectPhase({ effects: registry }, 'modifyDamage').cancelled).toBe(
    true,
  )
  expect(seen).toEqual([])
})

test('Should carry replacements and events from faint and item effects', () => {
  const registry = []

  registerEffect(registry, {
    sourceType: 'item',
    key: 'focus-sash',
    phase: 'consumeItem',
    priority: 0,
    handler: () => ({
      replacement: { species: 25 },
      events: [{ type: 'item', consumed: true }, { type: 'faint' }],
    }),
  })

  expect(runEffectPhase({ effects: registry }, 'consumeItem')).toMatchObject({
    replacement: { species: 25 },
    events: [{ type: 'item', consumed: true }, { type: 'faint' }],
  })
})

test('Should expose only matching sources in deterministic order', () => {
  const registry = []

  registerEffect(
    registry,
    effect('foe', 0, () => {}, { side: 'foe', phase: 'endTurn' }),
  )
  registerEffect(
    registry,
    effect('field', 2, () => {}, { side: 'field', phase: 'endTurn' }),
  )
  registerEffect(
    registry,
    effect('player', 1, () => {}, { side: 'player', phase: 'endTurn' }),
  )

  expect(
    effectSources({ effects: registry }, 'player', 'endTurn').map((x) => x.key),
  ).toEqual(['field', 'player'])
})

test('Should replay the same effect sequence from the same registry', () => {
  const registry = []

  registerEffect(
    registry,
    effect('first', 0, ({ value }) => value + 1),
  )
  registerEffect(
    registry,
    effect('second', 0, ({ value }) => value * 3),
  )

  const run = () =>
    runEffectPhase({ effects: registry }, 'modifyDamage', { value: 4 })

  expect(run()).toEqual(run())
})
