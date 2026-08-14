import { battleAbility } from './battleActor.mjs'
import { hasItem } from './data.mjs'
import { registerEffect, runEffectPhase } from './effects.mjs'
import { itemHandlersForSide } from './itemEffects.mjs'
import { fieldHandlers } from './terrain.mjs'

const effectRegistry = (sources) => {
  const registry = []

  for (const effect of sources) registerEffect(registry, effect)

  return registry
}

export const registerHeldItemEffects = (battle, side) => {
  battle.effects ??= []
  battle.effects = battle.effects.filter(
    (entry) => !(entry.sourceType === 'item' && entry.side === side),
  )

  const held = battle?.[side]?.mon?.heldItem
  if (!held || !hasItem(held)) return battle.effects

  for (const handler of itemHandlersForSide(held, side))
    registerEffect(battle.effects, {
      ...handler,
      side,
      handler: (state) => {
        if (battle?.[side]?.mon?.heldItem !== held) return
        if (battleAbility(battle?.[side]) === 'klutz') return
        return handler.handler(state)
      },
    })

  return battle.effects
}

export const refreshHeldItemEffects = (battle) => {
  battle.effects ??= []
  battle.effects = battle.effects.filter((entry) => entry.sourceType !== 'item')

  for (const side of ['player', 'foe']) registerHeldItemEffects(battle, side)

  return battle.effects
}

export const battleEffectRegistry = (battle) => {
  return effectRegistry([
    ...(battle.effects ?? []),
    ...fieldHandlers(battle.field ?? { weather: null, terrain: null }),
  ])
}

export const runBattleEffectPhase = (battle, phase, context = {}) => {
  return runEffectPhase(battle, phase, {
    ...context,
    field: context.field ?? battle.field,
    registry: battleEffectRegistry(battle),
  })
}
