// Type effectiveness.

import { loadData } from './data.mjs'

/**
 * How much a move of `moveType` is multiplied against a defender's types.
 *
 * Multiplies across both of the defender's types, so Rock hitting a Fire/Flying
 * Charizard lands at 4x. An immunity anywhere gives 0.
 */
export function effectiveness(moveType, defenderTypes) {
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

/** The line the game shows after a hit, or null when it was neutral. */
export function effectivenessMessage(multiplier) {
  if (multiplier === 0) return "It doesn't affect the foe..."
  if (multiplier >= 2) return "It's super effective!"
  if (multiplier < 1) return "It's not very effective..."
  return null
}
