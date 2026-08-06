import { BALLS, ITEM_MESSAGES, ITEMS, PARTY_ITEM_KINDS } from './constants.mjs'
import {
  displayName,
  evolveInto,
  hpFraction,
  isFainted,
  speciesName,
  stoneEvolution,
} from './pokemon.mjs'

export const SHOP_STOCK = Object.keys(ITEMS).filter(
  (key) => ITEMS[key].price !== null,
)

export const countOf = (save, key) => save.bag[key] ?? 0

export const ballsInBag = (save) => {
  return Object.keys(BALLS)
    .filter((key) => countOf(save, key) > 0)
    .sort((a, b) => BALLS[a].multiplier - BALLS[b].multiplier)
}

export const itemsInBag = (save) => {
  return Object.keys(ITEMS).filter((key) => countOf(save, key) > 0)
}

export const usableOnParty = (key) => PARTY_ITEM_KINDS.has(ITEMS[key].kind)

export const addItem = (save, key, quantity = 1) => {
  save.bag[key] = countOf(save, key) + quantity

  return save
}

export const removeItem = (save, key, quantity = 1) => {
  const remaining = countOf(save, key) - quantity

  if (remaining > 0) save.bag[key] = remaining
  else delete save.bag[key]

  return save
}

export const buy = (save, key, quantity = 1) => {
  const item = ITEMS[key]

  if (item.price === null)
    return { ok: false, reason: `${item.name} is not for sale.` }

  const cost = item.price * quantity

  if (save.money < cost)
    return { ok: false, reason: ITEM_MESSAGES.cannotAfford }

  save.money -= cost
  addItem(save, key, quantity)

  return { ok: true, spent: cost }
}

export const useItem = (save, key, mon) => {
  const item = ITEMS[key]

  if (countOf(save, key) <= 0)
    return { ok: false, message: `You have no ${item.name}.` }

  if (item.kind === 'heal') {
    if (isFainted(mon))
      return { ok: false, message: ITEM_MESSAGES.faintedNoEffect }
    if (mon.hp >= mon.stats.hp && !(item.cures && mon.status)) {
      return { ok: false, message: ITEM_MESSAGES.noEffect }
    }

    const healed = Math.min(item.heals, mon.stats.hp - mon.hp)

    mon.hp += healed

    if (item.cures) {
      mon.status = null
      mon.statusTurns = 0
    }

    removeItem(save, key)

    return { ok: true, message: `Restored ${healed} HP.` }
  }

  if (item.kind === 'cure') {
    if (!mon.status) return { ok: false, message: ITEM_MESSAGES.noEffect }

    mon.status = null
    mon.statusTurns = 0
    removeItem(save, key)

    return { ok: true, message: ITEM_MESSAGES.healthyAgain }
  }

  if (item.kind === 'revive') {
    if (!isFainted(mon)) return { ok: false, message: ITEM_MESSAGES.noEffect }

    mon.hp = hpFraction(mon, 2)
    mon.status = null
    mon.statusTurns = 0
    removeItem(save, key)

    return { ok: true, message: ITEM_MESSAGES.revived }
  }

  if (item.kind === 'stone') {
    const target = stoneEvolution(mon, key)

    if (!target) return { ok: false, message: ITEM_MESSAGES.noEffect }

    const before = displayName(mon)

    evolveInto(mon, target)
    removeItem(save, key)

    return {
      ok: true,
      message: `Congratulations! ${before.toUpperCase()} evolved into ${speciesName(target).toUpperCase()}!`,
      evolvedInto: target,
    }
  }

  return { ok: false, message: ITEM_MESSAGES.nothingHappened }
}
