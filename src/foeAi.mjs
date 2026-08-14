import { effectiveSpeed, moveSlotOf } from './battleActor.mjs'
import { other } from './battleEvents.mjs'
import { FOE_AI_SCORES } from './constants.mjs'
import { move as moveData, species } from './data.mjs'
import { runEffectPhase } from './effects.mjs'
import { moveCanExecute } from './moveEffects.mjs'
import { chance } from './rng.mjs'
import { effectiveness } from './typechart.mjs'
import { isMoveDisabled } from './volatile.mjs'

const scoreFoeMove = (move, playerTypes) => {
  if (move.damageClass === 'status') return FOE_AI_SCORES.status

  const power = move.power ?? FOE_AI_SCORES.defaultPower
  const accuracy = move.accuracy ?? 100

  return (power * effectiveness(move.type, playerTypes) * accuracy) / 100
}

export const pickFoeMove = (battle) => {
  const playerTypes = species(battle.player.mon.species).types

  let bestIndex = null
  let bestScore = -1

  battle.foe.mon.moves.forEach((slot, index) => {
    if (slot.pp <= 0) return
    if (isMoveDisabled(battle.foe, index)) return

    const move = { ...moveData(slot.move), key: slot.move }

    if (!moveCanExecute(battle, 'foe', move)) return

    const score = scoreFoeMove(move, playerTypes)

    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })

  return bestIndex
}

const actionPriority = (battle, side, slot) => {
  if (!slot) return 0

  const move = { ...moveData(slot.move), key: slot.move }

  return runEffectPhase(battle, 'modifyPriority', {
    attacker: side,
    defender: other(side),
    move,
    value: move.priority ?? 0,
    events: [],
  }).value
}

const actionSpeed = (battle, side) => {
  const actor = battle[side]

  return runEffectPhase(battle, 'modifySpeed', {
    side,
    attacker: side,
    defender: other(side),
    value: effectiveSpeed(actor),
    paralysisApplied: actor.mon.status === 'paralysis',
    events: [],
  }).value
}

export const decideOrder = (battle, playerMoveIndex, foeMoveIndex) => {
  const playerSlot = moveSlotOf(battle.player, playerMoveIndex)
  const foeSlot = moveSlotOf(battle.foe, foeMoveIndex)

  const playerPriority = actionPriority(battle, 'player', playerSlot)
  const foePriority = actionPriority(battle, 'foe', foeSlot)

  if (playerPriority !== foePriority) return playerPriority > foePriority

  const playerSpeed = actionSpeed(battle, 'player')
  const foeSpeed = actionSpeed(battle, 'foe')

  if (playerSpeed !== foeSpeed) return playerSpeed > foeSpeed

  return chance(battle.rng, 0.5)
}
