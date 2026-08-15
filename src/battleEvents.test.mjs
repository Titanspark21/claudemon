import { expect, test } from 'vitest'

import { sourceSpeciesIdentity } from './data.mjs'
import {
  applyDamage,
  applyHeal,
  effectAnnouncement,
  label,
  other,
  say,
} from './battleEvents.mjs'

const aBattle = () => {
  return {
    player: { mon: { species: 25, nickname: null, hp: 30, stats: { hp: 50 } } },
    foe: { mon: { species: 16, nickname: null, hp: 20, stats: { hp: 20 } } },
  }
}

test('Should name the player Pokemon plainly and mark the foe as wild', () => {
  const battle = aBattle()

  expect(label(battle, 'player')).toBe('Pikachu')
  expect(label(battle, 'foe')).toBe('the wild Pidgey')
})

test('Should flip a side to its opponent', () => {
  expect(other('player')).toBe('foe')
  expect(other('foe')).toBe('player')
})

test('Should push a message event', () => {
  const events = []

  say(events, 'Hello!')

  expect(events).toEqual([{ type: 'message', text: 'Hello!' }])
})

test('Should announce ability, item, field, and Mega events without exposing idle held items', () => {
  expect(
    effectAnnouncement({ type: 'ability', side: 'foe', ability: 'intimidate' }),
  ).toBe('Foe ability: Intimidate')
  expect(
    effectAnnouncement({
      type: 'item',
      action: 'activated',
      side: 'foe',
      key: 'quick-claw',
    }),
  ).toBe('Foe held item: Quick Claw activated!')
  expect(
    effectAnnouncement({
      type: 'item',
      action: 'consumed',
      side: 'player',
      key: 'oran-berry',
    }),
  ).toBe('Your Oran Berry was consumed.')
  expect(
    effectAnnouncement({
      type: 'field',
      kind: 'weather',
      key: 'rain',
      turns: 5,
    }),
  ).toBe('Weather: Rain began · 5 turns')
  expect(
    effectAnnouncement({ type: 'mega-toggle', side: 'player', enabled: true }),
  ).toBe('Mega Evolution ready — choose a move.')
  expect(
    effectAnnouncement({
      type: 'mega',
      side: 'player',
      targetId: sourceSpeciesIdentity('charizardmegax').id,
    }),
  ).toContain('Mega Evolved')
  expect(
    effectAnnouncement({ type: 'damage', side: 'foe', amount: 5 }),
  ).toBeNull()
})

test('Should cap the damage at the remaining HP and report what actually landed', () => {
  const battle = aBattle()
  const events = []

  expect(applyDamage(battle, 'foe', 100, events)).toBe(20)
  expect(battle.foe.mon.hp).toBe(0)
  expect(events).toEqual([
    { type: 'damage', side: 'foe', amount: 20, hpAfter: 0 },
  ])
})

test('Should cap the healing at the missing HP and stay silent when already full', () => {
  const battle = aBattle()
  const events = []

  expect(applyHeal(battle, 'player', 100, events)).toBe(20)
  expect(battle.player.mon.hp).toBe(50)
  expect(events).toEqual([
    { type: 'heal', side: 'player', amount: 20, hpAfter: 50 },
  ])

  expect(applyHeal(battle, 'player', 10, events)).toBe(0)
  expect(events).toHaveLength(1)
})

test('Should refuse to heal a Pokemon that has already fainted', () => {
  const battle = aBattle()
  const events = []

  battle.foe.mon.hp = 0

  expect(applyHeal(battle, 'foe', 15, events)).toBe(0)
  expect(battle.foe.mon.hp, 'the fainted stay fainted').toBe(0)
  expect(events).toEqual([])
})
