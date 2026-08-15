import { expect, test } from 'vitest'

import {
  abilityCoverage,
  abilityFamilies,
  abilityHandlers,
  abilityIsActive,
  excludedAbilityKeys,
  refreshAbilityEffects,
  registerAbilityEffects,
  revealAbility,
  supportedAbilityKeys,
  validateAbilityCoverage,
} from './abilities.mjs'

const actor = (ability, hp = 100) => ({
  mon: {
    species: 25,
    ability,
    hp,
    stats: {
      hp: 100,
      attack: 90,
      defense: 80,
      spAttack: 100,
      spDefense: 90,
      speed: 110,
    },
    heldItem: null,
    status: null,
  },
  stages: {
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  },
  volatile: {},
})

const battle = (playerAbility = 'static', foeAbility = 'keeneye') => ({
  player: actor(playerAbility),
  foe: actor(foeAbility),
  effects: [],
  field: { weather: null, terrain: null },
})

test('Should give every supported Generation VII ability an executable handler', () => {
  const supported = supportedAbilityKeys()

  expect(supported.length).toBeGreaterThan(150)
  for (const key of supported) {
    expect(abilityCoverage(key)?.status, key).toBe('supported')
    expect(abilityHandlers(key).length, `${key} handler count`).toBeGreaterThan(
      0,
    )
    expect(abilityFamilies(key).length, `${key} family count`).toBeGreaterThan(
      0,
    )
  }

  expect(validateAbilityCoverage()).toEqual({ valid: true, errors: [] })
})

test('Should keep every approved exclusion explicit and non-executable', () => {
  const excluded = excludedAbilityKeys()

  expect(excluded.length).toBeGreaterThan(0)
  for (const key of excluded) {
    const coverage = abilityCoverage(key)
    expect(
      [
        'no-effect-in-singles',
        'blocked-by-excluded-system',
        'deferred-complex-one-off',
      ],
      key,
    ).toContain(coverage.status)
    expect(coverage.reason?.length, `${key} reason`).toBeGreaterThan(20)
    expect(abilityHandlers(key), key).toEqual([])
  }
})

test('Should normalize display-style ability names before resolving coverage', () => {
  expect(abilityCoverage('Lightning Rod')?.status).toBe('supported')
  expect(abilityHandlers('Lightning-Rod')).toHaveLength(1)
})

test('Should suppress a defender ability under Mold Breaker while keeping ordinary abilities active', () => {
  const normal = battle('static', 'levitate')
  expect(
    abilityIsActive(normal, 'foe', { attacker: 'player', defender: 'foe' }),
  ).toBe(true)

  normal.player.mon.ability = 'moldbreaker'
  expect(
    abilityIsActive(normal, 'foe', { attacker: 'player', defender: 'foe' }),
  ).toBe(false)
  expect(
    abilityIsActive(normal, 'player', { attacker: 'player', defender: 'foe' }),
  ).toBe(true)
})

test('Should not activate fainted or explicitly suppressed abilities', () => {
  const current = battle()
  current.player.mon.hp = 0
  expect(abilityIsActive(current, 'player')).toBe(false)

  current.player.mon.hp = 10
  current.player.volatile.abilitySuppressed = true
  expect(abilityIsActive(current, 'player')).toBe(false)
})

test('Should reveal one deterministic ability activation for the same cause', () => {
  const events = []

  revealAbility(events, 'player', 'Static', 'contact')
  revealAbility(events, 'player', 'static', 'contact')
  revealAbility(events, 'player', 'static', 'switch-in')

  expect(events).toEqual([
    { type: 'ability', side: 'player', ability: 'static', cause: 'contact' },
    { type: 'ability', side: 'player', ability: 'static', cause: 'switch-in' },
  ])
})

test('Should replace stale ability effects after an ability or form change and preserve other effect sources', () => {
  const current = battle('blaze', 'keeneye')
  current.effects.push({
    side: 'field',
    sourceType: 'field',
    key: 'fixture',
    phase: 'endTurn',
    priority: 0,
    handler: () => {},
    order: 0,
  })

  refreshAbilityEffects(current)
  expect(
    current.effects.some(
      (entry) => entry.sourceType === 'ability' && entry.key === 'blaze',
    ),
  ).toBe(true)
  expect(
    current.effects.some(
      (entry) => entry.sourceType === 'field' && entry.key === 'fixture',
    ),
  ).toBe(true)

  current.player.mon.ability = 'torrent'
  refreshAbilityEffects(current)

  expect(
    current.effects.some(
      (entry) => entry.sourceType === 'ability' && entry.key === 'blaze',
    ),
  ).toBe(false)
  expect(
    current.effects.some(
      (entry) => entry.sourceType === 'ability' && entry.key === 'torrent',
    ),
  ).toBe(true)
  expect(
    current.effects.some(
      (entry) => entry.sourceType === 'field' && entry.key === 'fixture',
    ),
  ).toBe(true)
})

test('Should register just one side without disturbing the opponent ability handlers', () => {
  const current = battle('static', 'levitate')
  refreshAbilityEffects(current)
  const foeBefore = current.effects.filter(
    (entry) => entry.sourceType === 'ability' && entry.side === 'foe',
  ).length

  current.player.mon.ability = 'waterabsorb'
  registerAbilityEffects(current, 'player')

  expect(
    current.effects.filter(
      (entry) => entry.sourceType === 'ability' && entry.side === 'foe',
    ),
  ).toHaveLength(foeBefore)
  expect(
    current.effects.some(
      (entry) => entry.side === 'player' && entry.key === 'waterabsorb',
    ),
  ).toBe(true)
})
