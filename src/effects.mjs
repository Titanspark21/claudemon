export const EFFECT_PHASES = [
  'battleStart',
  'switchOut',
  'switchIn',
  'beforeAction',
  'modifyPriority',
  'modifySpeed',
  'modifyAccuracy',
  'modifyMoveType',
  'modifyPower',
  'checkImmunity',
  'tryStatus',
  'modifyDamage',
  'afterHit',
  'afterDamage',
  'consumeItem',
  'faint',
  'endTurn',
]

const sourceOrder = { player: 0, foe: 1, field: 2, system: 3 }

const compareEffects = (a, b) => {
  return (
    b.priority - a.priority ||
    (sourceOrder[a.side] ?? 9) - (sourceOrder[b.side] ?? 9) ||
    a.sourceType.localeCompare(b.sourceType) ||
    a.key.localeCompare(b.key) ||
    a.order - b.order
  )
}

export const registerEffect = (registry, effect) => {
  if (!EFFECT_PHASES.includes(effect.phase))
    throw new Error(`Unknown effect phase: ${effect.phase}`)
  if (typeof effect.handler !== 'function')
    throw new Error(`Effect ${effect.key} has no handler`)

  registry.push({
    side: effect.side ?? 'system',
    sourceType: effect.sourceType,
    key: effect.key,
    phase: effect.phase,
    priority: effect.priority ?? 0,
    handler: effect.handler,
    order: registry.length,
  })

  return registry
}

export const effectSources = (battle, side, phase) => {
  return (battle.effects ?? [])
    .filter((effect) => effect.phase === phase)
    .filter((effect) => effect.side === side || effect.side === 'field')
    .sort(compareEffects)
}

export const runEffectPhase = (battle, phase, context = {}) => {
  if (!EFFECT_PHASES.includes(phase))
    throw new Error(`Unknown effect phase: ${phase}`)

  const events = context.events ?? []
  const state = {
    battle,
    phase,
    attacker: context.attacker ?? null,
    defender: context.defender ?? null,
    move: context.move ?? null,
    field: context.field ?? battle.field ?? null,
    source: null,
    events,
    value: context.value,
    cancelled: false,
    replacement: null,
  }
  const registry = context.registry ?? battle.effects ?? []
  const effects = registry
    .filter((effect) => effect.phase === phase)
    .sort(compareEffects)

  for (const effect of effects) {
    state.source = effect
    const result = effect.handler(state)

    if (result && typeof result === 'object') {
      if ('value' in result) state.value = result.value
      if (result.event) events.push(result.event)
      if (result.events) events.push(...result.events)
      if (result.replacement) state.replacement = result.replacement
      if (result.cancelled) state.cancelled = true
    } else if (result !== undefined) {
      state.value = result
    }

    if (state.cancelled) break
  }

  return {
    value: state.value,
    cancelled: state.cancelled,
    replacement: state.replacement,
    events,
  }
}
