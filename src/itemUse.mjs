import { equipHeldItem, unequipHeldItem } from './heldItems.mjs'
import { learnEvolutionMoves } from './progression.mjs'
import { useItem } from './shop.mjs'
import { markCaught } from './state.mjs'

export const applyItem = (save, key, mon) => {
  const result = useItem(save, key, mon)

  if (!result.evolvedInto) return { ...result, steps: [] }

  markCaught(save, result.evolvedInto)

  return { ...result, steps: learnEvolutionMoves(mon) }
}

export const giveHeldItem = (save, key, mon) => equipHeldItem(save, mon, key)

export const takeHeldItem = (save, mon) => unequipHeldItem(save, mon)
