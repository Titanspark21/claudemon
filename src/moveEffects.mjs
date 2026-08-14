import {
  MOVE_FIELD_EFFECTS,
  MOVE_GENERIC_COVERAGE_HANDLERS,
  MOVE_RUNTIME_ONE_OFF_HANDLERS,
  MOVE_SPECIAL_FIXED_DAMAGE,
  MULTI_HIT_ROLLS,
  WEATHER_BALL_TYPES,
} from './constants.mjs'
import { moveCoverage } from './data.mjs'
import { registerEffect, runEffectPhase } from './effects.mjs'
import { fieldHandlers, startTerrain } from './terrain.mjs'
import { startWeather } from './weather.mjs'

const preserveValue = ({ value }) => value

const weatherBallType = ({ field, value }) => {
  return WEATHER_BALL_TYPES[field?.weather?.key] ?? value
}

const weatherBallPower = ({ field, value }) => {
  return field?.weather ? value * 2 : value
}

const effectHandler = (key, phase, handler = preserveValue, priority = 100) => {
  return {
    side: 'system',
    sourceType: 'move',
    key,
    phase,
    priority,
    handler,
  }
}

const isFixedDamageFamily = (move) => {
  return move.fixedDamage != null || MOVE_SPECIAL_FIXED_DAMAGE.has(move.key)
}

const runtimeHandlerExists = (move, coverage) => {
  if (MOVE_GENERIC_COVERAGE_HANDLERS.has(coverage.handler)) return true
  if (MOVE_RUNTIME_ONE_OFF_HANDLERS.has(coverage.handler)) return true
  if (isFixedDamageFamily(move)) return true
  if (move.ohko) return true

  return false
}

export const resolveMoveCoverage = (moveKey) => moveCoverage(moveKey)

export const moveHasFlag = (move, flag) => move.flags.includes(flag)

export const moveEffectHandlers = (move) => {
  const handlers = []
  const fixedDamage = isFixedDamageFamily(move)

  if (move.damageClass !== 'status' && !fixedDamage && !move.ohko)
    handlers.push(effectHandler('move:damage', 'modifyPower'))
  if (move.damageClass === 'status' || move.ailment)
    handlers.push(effectHandler('move:status', 'tryStatus'))
  if ((move.statChanges?.length ?? 0) > 0)
    handlers.push(effectHandler('move:stat-stages', 'afterHit'))
  if (move.priority)
    handlers.push(effectHandler('move:priority', 'modifyPriority'))
  if (move.maxHits) handlers.push(effectHandler('move:multi-hit', 'afterHit'))
  if (move.drain < 0) handlers.push(effectHandler('move:recoil', 'afterDamage'))
  if (move.drain > 0) handlers.push(effectHandler('move:drain', 'afterDamage'))
  if (move.healing) handlers.push(effectHandler('move:healing', 'afterHit'))
  if (fixedDamage)
    handlers.push(effectHandler('move:fixed-damage', 'modifyDamage'))
  if (move.ohko) handlers.push(effectHandler('move:ohko', 'modifyDamage'))
  if (moveHasFlag(move, 'contact'))
    handlers.push(effectHandler('move:contact', 'afterHit'))
  if (moveHasFlag(move, 'sound'))
    handlers.push(effectHandler('move:sound', 'afterHit'))
  if (moveHasFlag(move, 'powder'))
    handlers.push(effectHandler('move:powder', 'afterHit'))

  if (move.key === 'weather-ball') {
    handlers.push(
      effectHandler(
        'move:weather-ball-type',
        'modifyMoveType',
        weatherBallType,
      ),
      effectHandler(
        'move:weather-ball-power',
        'modifyPower',
        weatherBallPower,
        90,
      ),
    )
  }

  return handlers
}

const effectRegistry = (sources) => {
  const registry = []

  for (const effect of sources) registerEffect(registry, effect)

  return registry
}

export const runMoveEffectPhase = (battle, phase, context) => {
  const registry = effectRegistry([
    ...(battle.effects ?? []),
    ...moveEffectHandlers(context.move),
    ...(battle.field ? fieldHandlers(battle.field) : []),
  ])

  return runEffectPhase(battle, phase, {
    attacker: context.attacker,
    defender: context.defender,
    move: context.move,
    field: battle.field,
    events: context.events,
    value: context.value,
    registry,
  })
}

export const runFieldEffectPhase = (battle, phase, events) => {
  const registry = effectRegistry([
    ...battle.effects,
    ...fieldHandlers(battle.field),
  ])

  return runEffectPhase(battle, phase, {
    field: battle.field,
    events,
    registry,
  })
}

export const rollMoveHits = (rng, move) => {
  if (!move.maxHits) return 1

  const min = move.minHits ?? move.maxHits

  if (min === 2 && move.maxHits === 5) {
    return MULTI_HIT_ROLLS[Math.floor(rng() * MULTI_HIT_ROLLS.length)]
  }

  return min + Math.floor(rng() * (move.maxHits - min + 1))
}

export const moveExecutionFailure = (battle, side, move) => {
  if (move.key === 'struggle') return null

  const coverage = resolveMoveCoverage(move.key)

  if (coverage.status !== 'supported') return coverage.reason ?? coverage.status
  if (!runtimeHandlerExists(move, coverage))
    return `Runtime handler ${coverage.handler} is not implemented.`

  if (move.priority > 0 && battle.field?.terrain) {
    const defenderSide = side === 'player' ? 'foe' : 'player'
    const priority = runMoveEffectPhase(battle, 'modifyPriority', {
      attacker: battle[side],
      defender: battle[defenderSide],
      move,
      value: move.priority,
    })

    if (priority.cancelled) return 'The field blocks this priority move.'
  }

  return null
}

export const moveCanExecute = (battle, side, move) => {
  return moveExecutionFailure(battle, side, move) === null
}

export const applyMoveFieldEffect = (battle, side, move) => {
  const effect = MOVE_FIELD_EFFECTS[move.key]

  if (!effect) return []

  const source = { side, move: move.key }

  if (effect.kind === 'weather') return startWeather(battle, effect.key, source)

  return startTerrain(battle, effect.key, source)
}
