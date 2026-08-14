import { ITEM_MESSAGES, LINK_CABLE_KEY } from './constants.mjs'
import { equipHeldItem, unequipHeldItem } from './heldItems.mjs'
import { displayName, pendingEvolution, speciesName } from './pokemon.mjs'
import { applyEvolution, learnEvolutionMoves } from './progression.mjs'
import { countOf, useItem } from './shop.mjs'
import { markCaught } from './state.mjs'

const applyLinkCable = (save, mon) => {
  if (countOf(save, LINK_CABLE_KEY) <= 0) {
    return { ok: false, message: ITEM_MESSAGES.noLinkCable, steps: [] }
  }

  const rule = pendingEvolution(mon, {
    trigger: 'trade',
    item: LINK_CABLE_KEY,
  })

  if (!rule) return { ok: false, message: ITEM_MESSAGES.noEffect, steps: [] }

  const before = displayName(mon)
  const evolution = applyEvolution(save, mon, rule)

  return {
    ok: true,
    message: `Congratulations! ${before.toUpperCase()} evolved into ${speciesName(evolution.to).toUpperCase()}!`,
    evolvedInto: evolution.to,
    steps: evolution.steps,
  }
}

export const applyItem = (save, key, mon) => {
  if (key === LINK_CABLE_KEY) return applyLinkCable(save, mon)

  const result = useItem(save, key, mon)

  if (!result.evolvedInto) return { ...result, steps: [] }

  markCaught(save, result.evolvedInto)

  return { ...result, steps: learnEvolutionMoves(mon) }
}

export const giveHeldItem = (save, key, mon) => equipHeldItem(save, mon, key)

export const takeHeldItem = (save, mon) => unequipHeldItem(save, mon)
