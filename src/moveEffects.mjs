import { battleAbility, battleTypes, effectiveSpeed } from './battleActor.mjs'
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
import { levelOf } from './pokemon.mjs'
import { fieldHandlers, startTerrain } from './terrain.mjs'
import { startWeather } from './weather.mjs'

const preserveValue = ({ value }) => value

const weatherBallType = ({ field, value }) => {
  return WEATHER_BALL_TYPES[field?.weather?.key] ?? value
}

const weatherBallPower = ({ field, value }) => {
  return field?.weather ? value * 2 : value
}

const sideOfActor = (battle, actor) =>
  battle.player === actor ? 'player' : 'foe'

const resolvedSpeed = (state, actor) => {
  const side = sideOfActor(state.battle, actor)
  const opponentSide = side === 'player' ? 'foe' : 'player'

  return runEffectPhase(state.battle, 'modifySpeed', {
    side,
    attacker: side,
    defender: opponentSide,
    value: effectiveSpeed(actor),
    paralysisApplied: actor.mon.status === 'paralysis',
    events: state.events,
  }).value
}

const electroBallPower = (state) => {
  const attackerSpeed = resolvedSpeed(state, state.attacker)
  const defenderSpeed = resolvedSpeed(state, state.defender)
  const ratio = defenderSpeed > 0 ? attackerSpeed / defenderSpeed : Infinity

  if (ratio >= 4) return 150
  if (ratio >= 3) return 120
  if (ratio >= 2) return 80
  if (ratio > 1) return 60
  return 40
}

const ohkoAccuracy = (state) => {
  const attackerLevel = levelOf(state.attacker.mon)
  const defenderLevel = levelOf(state.defender.mon)

  if (attackerLevel < defenderLevel) return 0
  if (
    state.move.key === 'sheer-cold' &&
    battleTypes(state.defender).includes('ice')
  )
    return 0
  if (
    battleAbility(state.attacker) === 'noguard' ||
    battleAbility(state.defender) === 'noguard'
  )
    return 100

  const base =
    state.move.key === 'sheer-cold' &&
    !battleTypes(state.attacker).includes('ice')
      ? 20
      : 30

  return base + attackerLevel - defenderLevel
}

const minimizedTarget = ({ defender }) => defender?.volatile?.minimized === true
const minimizePower = (state) =>
  minimizedTarget(state) && Number.isFinite(state.value)
    ? state.value * 2
    : state.value
const minimizeAccuracy = (state) => (minimizedTarget(state) ? 100 : state.value)
const markMinimized = (state) => {
  if (state.kind === 'stat-change-applied')
    state.attacker.volatile.minimized = true

  return state.value
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
  if (move.ohko) {
    handlers.push(
      effectHandler('move:ohko', 'modifyDamage'),
      effectHandler('move:ohko-accuracy', 'modifyAccuracy', ohkoAccuracy, -100),
    )
  }
  if (moveHasFlag(move, 'contact'))
    handlers.push(effectHandler('move:contact', 'afterHit'))
  if (moveHasFlag(move, 'sound'))
    handlers.push(effectHandler('move:sound', 'afterHit'))
  if (moveHasFlag(move, 'powder'))
    handlers.push(effectHandler('move:powder', 'afterHit'))
  if (moveHasFlag(move, 'minimize')) {
    handlers.push(
      effectHandler('move:minimize-power', 'modifyPower', minimizePower, -90),
      effectHandler(
        'move:minimize-accuracy',
        'modifyAccuracy',
        minimizeAccuracy,
        -90,
      ),
    )
  }
  if (move.key === 'minimize')
    handlers.push(
      effectHandler('move:minimize-state', 'afterHit', markMinimized),
    )
  if (move.key === 'electro-ball')
    handlers.push(
      effectHandler(
        'move:electro-ball-power',
        'modifyPower',
        electroBallPower,
        200,
      ),
    )

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

const weatherIsSuppressed = (battle) =>
  ['player', 'foe'].some((side) =>
    ['airlock', 'cloudnine'].includes(battleAbility(battle?.[side])),
  )

const activeFieldHandlers = (battle) =>
  fieldHandlers(battle.field).filter(
    (handler) =>
      !weatherIsSuppressed(battle) || handler.sourceType !== 'weather',
  )

export const runMoveEffectPhase = (battle, phase, context) => {
  const registry = effectRegistry([
    ...(battle.effects ?? []),
    ...moveEffectHandlers(context.move),
    ...(battle.field ? activeFieldHandlers(battle) : []),
  ])

  return runEffectPhase(battle, phase, {
    ...context,
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
    ...(battle.effects ?? []),
    ...activeFieldHandlers(battle),
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
