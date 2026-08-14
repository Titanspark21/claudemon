import { battleAbility, battleTypes } from './battleActor.mjs'
import { EFFECTIVENESS_MESSAGES } from './constants.mjs'
import { loadData } from './data.mjs'

export const effectiveness = (moveType, defenderTypes) => {
  const chart = loadData().types
  const relations = chart[moveType]

  if (!relations) return 1

  let multiplier = 1

  for (const defenderType of defenderTypes) {
    if (relations.zero.includes(defenderType)) return 0
    if (relations.double.includes(defenderType)) multiplier *= 2
    else if (relations.half.includes(defenderType)) multiplier *= 0.5
  }

  return multiplier
}

export const effectivenessMessage = (multiplier) => {
  if (multiplier === 0) return EFFECTIVENESS_MESSAGES.immune
  if (multiplier >= 2) return EFFECTIVENESS_MESSAGES.superEffective
  if (multiplier < 1) return EFFECTIVENESS_MESSAGES.notVeryEffective

  return null
}

export const battleSideOf = (battle, actor) => {
  if (actor === 'player' || actor === 'foe') return actor
  if (actor?.side === 'player' || actor?.side === 'foe') return actor.side
  if (actor === battle.player) return 'player'
  if (actor === battle.foe) return 'foe'

  return null
}

export const isGrounded = (battle, side) => {
  const actor = battle[side]
  const mon = actor.mon
  const types = battleTypes(actor)

  if (mon.heldItem === 'iron-ball') return true
  if (types.includes('flying')) return false
  if (battleAbility(actor) === 'levitate') return false
  if (mon.heldItem === 'air-balloon') return false

  return true
}
