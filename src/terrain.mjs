import { applyHeal } from './battleEvents.mjs'
import { fieldDurationHandler, replaceFieldEffect } from './battleField.mjs'
import {
  FIELD_DEFAULT_TURNS,
  FIELD_RESIDUAL_FRACTION,
  GRASSY_WEAKENED_MOVES,
  MISTY_DRAGON_MULTIPLIER,
  TERRAIN_KEY_ALIASES,
  TERRAIN_KEYS,
  TERRAIN_POWER_MULTIPLIER,
} from './constants.mjs'
import { heldFieldDuration } from './itemEffects.mjs'
import { isFainted } from './pokemon.mjs'
import { battleSideOf, isGrounded } from './typechart.mjs'
import { weatherHandlers } from './weather.mjs'

const normalizeTerrain = (terrain) => TERRAIN_KEY_ALIASES[terrain] ?? terrain

const assertTerrain = (terrain) => {
  if (!TERRAIN_KEYS.has(terrain)) throw new Error(`Unknown terrain: ${terrain}`)
}

const assertTurns = (turns) => {
  if (!Number.isInteger(turns) || turns <= 0)
    throw new Error(`Invalid field duration: ${turns}`)
}

export const startTerrain = (
  battle,
  terrain,
  source,
  turns = FIELD_DEFAULT_TURNS,
) => {
  const key = normalizeTerrain(terrain)

  assertTerrain(key)
  assertTurns(turns)

  const side = battleSideOf(battle, source)
  const duration = side
    ? heldFieldDuration(battle, side, 'terrain', key, turns)
    : turns

  replaceFieldEffect(battle.field, 'terrain', {
    key,
    source,
    turns: duration,
  })

  return [{ type: 'field', kind: 'terrain', key, source, turns: duration }]
}

const terrainPower = ({ battle, field, attacker, defender, move, value }) => {
  const terrain = field.terrain?.key
  const attackerSide = battleSideOf(battle, attacker)
  const defenderSide = battleSideOf(battle, defender)

  if (
    terrain === 'electric' &&
    move.type === 'electric' &&
    attackerSide &&
    isGrounded(battle, attackerSide)
  )
    return Math.floor(value * TERRAIN_POWER_MULTIPLIER)

  if (
    terrain === 'grassy' &&
    move.type === 'grass' &&
    attackerSide &&
    isGrounded(battle, attackerSide)
  )
    return Math.floor(value * TERRAIN_POWER_MULTIPLIER)

  if (
    terrain === 'psychic' &&
    move.type === 'psychic' &&
    attackerSide &&
    isGrounded(battle, attackerSide)
  )
    return Math.floor(value * TERRAIN_POWER_MULTIPLIER)

  if (
    terrain === 'misty' &&
    move.type === 'dragon' &&
    defenderSide &&
    isGrounded(battle, defenderSide)
  )
    return Math.floor(value * MISTY_DRAGON_MULTIPLIER)

  if (
    terrain === 'grassy' &&
    GRASSY_WEAKENED_MOVES.has(move.key) &&
    defenderSide &&
    isGrounded(battle, defenderSide)
  )
    return Math.floor(value / 2)

  return value
}

const terrainStatus = ({ battle, field, defender, value }) => {
  const terrain = field.terrain?.key
  const side = battleSideOf(battle, defender)

  if (!side || !isGrounded(battle, side)) return { value }
  if (terrain === 'electric' && value === 'sleep')
    return { value, cancelled: true }
  if (terrain === 'misty') return { value, cancelled: true }

  return { value }
}

const terrainPriority = ({ battle, field, attacker, defender, value }) => {
  if (field.terrain?.key !== 'psychic' || value <= 0) return value

  const attackerSide = battleSideOf(battle, attacker)
  const defenderSide = battleSideOf(battle, defender)

  if (!defenderSide || attackerSide === defenderSide) return value
  if (!isGrounded(battle, defenderSide)) return value

  return { value, cancelled: true }
}

const grassyRecovery = ({ battle, field, events }) => {
  if (field.terrain?.key !== 'grassy') return

  for (const side of ['player', 'foe']) {
    const mon = battle[side].mon

    if (isFainted(mon) || !isGrounded(battle, side)) continue

    const amount = Math.max(
      1,
      Math.floor(mon.stats.hp / FIELD_RESIDUAL_FRACTION),
    )

    applyHeal(battle, side, amount, events)
  }
}

const TERRAIN_POWER_HANDLER = {
  side: 'field',
  sourceType: 'terrain',
  key: 'terrain-power',
  phase: 'modifyPower',
  priority: 0,
  handler: terrainPower,
}

const TERRAIN_STATUS_HANDLER = {
  side: 'field',
  sourceType: 'terrain',
  key: 'terrain-status',
  phase: 'tryStatus',
  priority: -100,
  handler: terrainStatus,
}

const TERRAIN_PRIORITY_HANDLER = {
  side: 'field',
  sourceType: 'terrain',
  key: 'terrain-priority',
  phase: 'modifyPriority',
  priority: -100,
  handler: terrainPriority,
}

const GRASSY_RECOVERY_HANDLER = {
  side: 'field',
  sourceType: 'terrain',
  key: 'grassy-recovery',
  phase: 'endTurn',
  priority: 0,
  handler: grassyRecovery,
}

export const terrainHandlers = (field) => {
  if (!field.terrain) return []

  return [
    TERRAIN_POWER_HANDLER,
    TERRAIN_STATUS_HANDLER,
    TERRAIN_PRIORITY_HANDLER,
    GRASSY_RECOVERY_HANDLER,
  ]
}

export const fieldHandlers = (field) => {
  if (!field.weather && !field.terrain) return []

  return [
    ...weatherHandlers(field),
    ...terrainHandlers(field),
    fieldDurationHandler,
  ]
}

export { isGrounded } from './typechart.mjs'
