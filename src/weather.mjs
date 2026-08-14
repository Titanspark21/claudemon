import { applyDamage } from './battleEvents.mjs'
import {
  FIELD_DEFAULT_TURNS,
  FIELD_RESIDUAL_FRACTION,
  HAIL_IMMUNE_TYPES,
  SAND_ROCK_SPDEF_MULTIPLIER,
  SANDSTORM_IMMUNE_TYPES,
  WEATHER_KEY_ALIASES,
  WEATHER_KEYS,
  WEATHER_POWER_MULTIPLIER,
} from './constants.mjs'
import { species } from './data.mjs'
import { heldFieldDuration } from './itemEffects.mjs'
import { isFainted } from './pokemon.mjs'
import { replaceFieldEffect } from './battleField.mjs'
import { battleSideOf } from './typechart.mjs'

const normalizeWeather = (weather) => WEATHER_KEY_ALIASES[weather] ?? weather

const assertWeather = (weather) => {
  if (!WEATHER_KEYS.has(weather)) throw new Error(`Unknown weather: ${weather}`)
}

const assertTurns = (turns) => {
  if (!Number.isInteger(turns) || turns <= 0)
    throw new Error(`Invalid field duration: ${turns}`)
}

export const startWeather = (
  battle,
  weather,
  source,
  turns = FIELD_DEFAULT_TURNS,
) => {
  const key = normalizeWeather(weather)

  assertWeather(key)
  assertTurns(turns)

  const side = battleSideOf(battle, source)
  const duration = side
    ? heldFieldDuration(battle, side, 'weather', key, turns)
    : turns

  replaceFieldEffect(battle.field, 'weather', {
    key,
    source,
    turns: duration,
  })

  return [{ type: 'field', kind: 'weather', key, source, turns: duration }]
}

const weatherPower = ({ field, move, value }) => {
  const weather = field.weather?.key

  if (weather === 'rain' && move.type === 'water')
    return Math.floor(value * WEATHER_POWER_MULTIPLIER)
  if (weather === 'rain' && move.type === 'fire') return Math.floor(value / 2)
  if (weather === 'sun' && move.type === 'fire')
    return Math.floor(value * WEATHER_POWER_MULTIPLIER)
  if (weather === 'sun' && move.type === 'water') return Math.floor(value / 2)

  return value
}

const sandRockDefense = ({ battle, field, defender, move, value }) => {
  if (field.weather?.key !== 'sandstorm') return value
  if (move.damageClass !== 'special') return value

  const side = battleSideOf(battle, defender)

  if (!side) return value

  const types = species(battle[side].mon.species).types

  if (!types.includes('rock')) return value

  return Math.floor(value / SAND_ROCK_SPDEF_MULTIPLIER)
}

const immuneToResidual = (weather, types) => {
  const immune =
    weather === 'sandstorm' ? SANDSTORM_IMMUNE_TYPES : HAIL_IMMUNE_TYPES

  return types.some((type) => immune.has(type))
}

const weatherResidual = ({ battle, field, events }) => {
  const weather = field.weather?.key

  if (weather !== 'sandstorm' && weather !== 'hail') return

  for (const side of ['player', 'foe']) {
    const mon = battle[side].mon
    const types = species(mon.species).types

    if (
      isFainted(mon) ||
      mon.heldItem === 'safety-goggles' ||
      immuneToResidual(weather, types)
    )
      continue

    const amount = Math.max(
      1,
      Math.floor(mon.stats.hp / FIELD_RESIDUAL_FRACTION),
    )

    applyDamage(battle, side, amount, events)
  }
}

const WEATHER_POWER_HANDLER = {
  side: 'field',
  sourceType: 'weather',
  key: 'weather-power',
  phase: 'modifyPower',
  priority: 0,
  handler: weatherPower,
}

const SAND_ROCK_DEFENSE_HANDLER = {
  side: 'field',
  sourceType: 'weather',
  key: 'sand-rock-defense',
  phase: 'modifyDamage',
  priority: 0,
  handler: sandRockDefense,
}

const WEATHER_RESIDUAL_HANDLER = {
  side: 'field',
  sourceType: 'weather',
  key: 'weather-residual',
  phase: 'endTurn',
  priority: 0,
  handler: weatherResidual,
}

export const weatherHandlers = (field) => {
  if (!field.weather) return []

  return [
    WEATHER_POWER_HANDLER,
    SAND_ROCK_DEFENSE_HANDLER,
    WEATHER_RESIDUAL_HANDLER,
  ]
}
