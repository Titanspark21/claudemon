import { readFileSync } from 'node:fs'

import {
  abilityBreaksMold,
  abilityEffectFamilies,
  emitAbilityReveal,
  handlersForAbility,
} from './abilityEffects.mjs'
import { registerEffect } from './effects.mjs'

const coverage = JSON.parse(
  readFileSync(
    new URL('../data/mechanics-coverage.json', import.meta.url),
    'utf8',
  ),
).abilities

export const normalizeAbilityKey = (abilityKey) =>
  String(abilityKey ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const coverageByNormalizedKey = new Map(
  Object.entries(coverage).map(([key, entry]) => [
    normalizeAbilityKey(key),
    { key, ...entry },
  ]),
)

export const abilityCoverage = (abilityKey) =>
  coverageByNormalizedKey.get(normalizeAbilityKey(abilityKey)) ?? null

export const supportedAbilityKeys = () =>
  Object.entries(coverage)
    .filter(([, entry]) => entry.status === 'supported')
    .map(([key]) => key)
    .sort()

export const excludedAbilityKeys = () =>
  Object.entries(coverage)
    .filter(([, entry]) => entry.status !== 'supported')
    .map(([key]) => key)
    .sort()

export const abilityHandlers = (abilityKey) => {
  const normalized = normalizeAbilityKey(abilityKey)
  const entry = abilityCoverage(normalized)

  if (!entry || entry.status !== 'supported') return []

  return handlersForAbility(normalized).map((handler) => ({
    ...handler,
    key: normalized,
    sourceType: 'ability',
  }))
}

export const abilityIsActive = (battle, side, context = {}) => {
  const actor = battle?.[side]
  if (!actor?.mon?.ability || actor.mon.hp <= 0) return false
  if (actor.volatile?.abilitySuppressed || actor.mon.abilitySuppressed)
    return false

  const attackerSide =
    context.attacker === 'player' || context.attacker === 'foe'
      ? context.attacker
      : context.attacker === battle?.player
        ? 'player'
        : context.attacker === battle?.foe
          ? 'foe'
          : null

  if (context.ignoreDefenderAbility && context.defender === side) return false

  if (
    attackerSide &&
    attackerSide !== side &&
    context.defender === side &&
    abilityBreaksMold(battle[attackerSide]?.mon?.ability)
  )
    return false

  return true
}

export const revealAbility = (
  events,
  side,
  abilityKey,
  cause = 'activation',
) => {
  emitAbilityReveal(events, side, normalizeAbilityKey(abilityKey), cause)
}

export const registerAbilityEffects = (battle, side) => {
  if (!battle?.[side]?.mon) return battle?.effects ?? []

  battle.effects ??= []
  battle.effects = battle.effects.filter(
    (entry) => !(entry.sourceType === 'ability' && entry.side === side),
  )

  const abilityKey = normalizeAbilityKey(battle[side].mon.ability)
  if (!abilityKey) return battle.effects

  for (const handler of abilityHandlers(abilityKey))
    registerEffect(battle.effects, {
      ...handler,
      side,
      handler: (state) => {
        if (normalizeAbilityKey(battle[side]?.mon?.ability) !== abilityKey)
          return
        if (
          ['switchIn', 'switchOut'].includes(state.phase) &&
          state.side &&
          state.side !== side
        )
          return
        if (!abilityIsActive(battle, side, state) && state.phase !== 'faint')
          return
        return handler.handler(state)
      },
    })

  return battle.effects
}

export const refreshAbilityEffects = (battle) => {
  battle.effects ??= []
  battle.effects = battle.effects.filter(
    (entry) => entry.sourceType !== 'ability',
  )

  for (const side of ['player', 'foe']) registerAbilityEffects(battle, side)

  return battle.effects
}

export const validateAbilityCoverage = () => {
  const errors = []

  for (const [key, entry] of Object.entries(coverage)) {
    const handlers = abilityHandlers(key)

    if (entry.status === 'supported' && handlers.length === 0)
      errors.push(`${key} is supported without an executable handler`)
    if (entry.status !== 'supported' && handlers.length !== 0)
      errors.push(`${key} is excluded but still has executable handlers`)
    if (entry.status === 'supported' && entry.handler !== `ability:${key}`)
      errors.push(`${key} has mismatched handler id ${String(entry.handler)}`)
  }

  return { valid: errors.length === 0, errors }
}

export const abilityFamilies = (abilityKey) => {
  if (abilityCoverage(abilityKey)?.status !== 'supported') return []
  return abilityEffectFamilies(normalizeAbilityKey(abilityKey))
}
