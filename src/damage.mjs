import { battleStats, battleTypes, stageMultiplier } from './battleActor.mjs'
import { other } from './battleEvents.mjs'
import {
  CRIT_MULTIPLIER,
  DAMAGE_VARIANCE,
  FALLBACK_POWER,
  STAB_MULTIPLIER,
} from './constants.mjs'
import { levelOf } from './pokemon.mjs'
import { randInt } from './rng.mjs'
import { effectiveness } from './typechart.mjs'

export const baseDamage = ({ level, power, attack, defense }) => {
  return (
    Math.floor(
      Math.floor((Math.floor((2 * level) / 5 + 2) * power * attack) / defense) /
        50,
    ) + 2
  )
}

export const FIXED_DAMAGE = {
  'dragon-rage': () => 40,
  'sonic-boom': () => 20,
  'seismic-toss': ({ attackerLevel }) => attackerLevel,
  'night-shade': ({ attackerLevel }) => attackerLevel,
  'super-fang': ({ defender }) => Math.max(1, Math.floor(defender.hp / 2)),
  psywave: ({ attackerLevel, rng }) => {
    return Math.max(
      1,
      Math.floor((attackerLevel * randInt(rng, 50, 150)) / 100),
    )
  },
}

const getMovePower = (move) => move.power ?? FALLBACK_POWER[move.key] ?? 50

export const computeDamage = (battle, attackerSide, move, isCrit) => {
  const attacker = battle[attackerSide]
  const defender = battle[other(attackerSide)]
  const attackerLevel = levelOf(attacker.mon)

  const physical = move.damageClass === 'physical'
  const attackStat = physical ? 'attack' : 'spAttack'
  const defenseStat = physical ? 'defense' : 'spDefense'

  const a =
    battleStats(attacker)[attackStat] *
    (isCrit ? 1 : stageMultiplier(attacker.stages[attackStat]))
  const d =
    battleStats(defender)[defenseStat] *
    (isCrit ? 1 : stageMultiplier(defender.stages[defenseStat]))

  let damage = baseDamage({
    level: attackerLevel,
    power: getMovePower(move),
    attack: a,
    defense: d,
  })

  if (isCrit) damage = Math.floor(damage * CRIT_MULTIPLIER)

  const attackerTypes = battleTypes(attacker)

  if (attackerTypes.includes(move.type))
    damage = Math.floor(damage * STAB_MULTIPLIER)

  const multiplier = effectiveness(move.type, battleTypes(defender))

  damage = Math.floor(damage * multiplier)

  if (attacker.mon.status === 'burn' && physical)
    damage = Math.floor(damage / 2)

  damage = Math.floor(
    (damage * randInt(battle.rng, DAMAGE_VARIANCE.min, DAMAGE_VARIANCE.max)) /
      DAMAGE_VARIANCE.max,
  )

  return { damage: multiplier === 0 ? 0 : Math.max(1, damage), multiplier }
}
