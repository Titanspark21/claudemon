import { BALLS, ITEM_MESSAGES, ITEMS, PARTY_ITEM_KINDS } from './constants.mjs'
import { hasItem, item as heldItemData } from './data.mjs'
import {
  displayName,
  evolveInto,
  hpFraction,
  isEvolutionItem,
  isFainted,
  speciesName,
  stoneEvolution,
} from './pokemon.mjs'

export const SHOP_STOCK = Object.keys(ITEMS).filter(
  (key) => ITEMS[key].price !== null,
)

// Held items unlock gradually with badges. Rare progression items, species-
// specific items, Mega Stones and consumables sourced from wild Pokémon stay
// out of ordinary shop stock.
export const HELD_SHOP_STOCK = [
  { key: 'oran-berry', price: 200, badges: 0 },
  { key: 'silk-scarf', price: 1_000, badges: 1 },
  { key: 'charcoal', price: 1_500, badges: 1 },
  { key: 'mystic-water', price: 1_500, badges: 1 },
  { key: 'miracle-seed', price: 1_500, badges: 1 },
  { key: 'magnet', price: 1_500, badges: 2 },
  { key: 'black-belt', price: 1_500, badges: 2 },
  { key: 'sharp-beak', price: 1_500, badges: 2 },
  { key: 'soft-sand', price: 1_500, badges: 3 },
  { key: 'never-melt-ice', price: 1_500, badges: 3 },
  { key: 'spell-tag', price: 1_500, badges: 3 },
  { key: 'black-glasses', price: 1_500, badges: 4 },
  { key: 'leftovers', price: 4_000, badges: 4 },
  { key: 'expert-belt', price: 4_000, badges: 5 },
  { key: 'muscle-band', price: 4_000, badges: 5 },
  { key: 'wise-glasses', price: 4_000, badges: 5 },
  { key: 'wide-lens', price: 4_000, badges: 6 },
  { key: 'life-orb', price: 8_000, badges: 7 },
]

const heldShopEntry = (key) =>
  HELD_SHOP_STOCK.find((entry) => entry.key === key)

export const itemInfo = (key) => {
  if (ITEMS[key]) return ITEMS[key]
  if (!hasItem(key)) return null

  const record = heldItemData(key)
  const stock = heldShopEntry(key)

  return {
    ...record,
    kind: isEvolutionItem(key) ? 'stone' : record.held ? 'held' : 'other',
    price: stock?.price ?? null,
    description: record.description || 'A Pokémon item.',
  }
}

export const shopStock = (save) => {
  const badges = save?.badges?.length ?? 0
  const held = HELD_SHOP_STOCK.filter((entry) => badges >= entry.badges).map(
    (entry) => entry.key,
  )

  return [...SHOP_STOCK, ...held]
}

export const countOf = (save, key) => save.bag[key] ?? 0

export const ballsInBag = (save) => {
  return Object.keys(BALLS)
    .filter((key) => countOf(save, key) > 0)
    .sort((a, b) => BALLS[a].multiplier - BALLS[b].multiplier)
}

export const itemsInBag = (save) => {
  return Object.keys(save.bag).filter(
    (key) => countOf(save, key) > 0 && itemInfo(key) !== null,
  )
}

export const usableOnParty = (key) => {
  const info = itemInfo(key)

  return Boolean(info && PARTY_ITEM_KINDS.has(info.kind))
}

export const countOfKind = (save, kind) => {
  return Object.keys(save.bag)
    .filter((key) => itemInfo(key)?.kind === kind)
    .reduce((total, key) => total + countOf(save, key), 0)
}

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
  const info = itemInfo(key)

  if (!info) return { ok: false, reason: ITEM_MESSAGES.noSuchItem }
  if (!shopStock(save).includes(key) || info.price === null) {
    return { ok: false, reason: `${info.name} is not for sale.` }
  }

  const cost = info.price * quantity

  if (save.money < cost)
    return { ok: false, reason: ITEM_MESSAGES.cannotAfford }

  save.money -= cost
  addItem(save, key, quantity)

  return { ok: true, spent: cost }
}

export const useItem = (save, key, mon) => {
  const info = itemInfo(key)

  if (!info) return { ok: false, message: ITEM_MESSAGES.noSuchItem }
  if (countOf(save, key) <= 0)
    return { ok: false, message: `You have no ${info.name}.` }

  if (info.kind === 'heal') {
    if (isFainted(mon))
      return { ok: false, message: ITEM_MESSAGES.faintedNoEffect }
    if (mon.hp >= mon.stats.hp && !(info.cures && mon.status)) {
      return { ok: false, message: ITEM_MESSAGES.noEffect }
    }

    const healed = Math.min(info.heals, mon.stats.hp - mon.hp)

    mon.hp += healed

    if (info.cures) {
      mon.status = null
      mon.statusTurns = 0
    }

    removeItem(save, key)

    return { ok: true, message: `Restored ${healed} HP.` }
  }

  if (info.kind === 'cure') {
    if (!mon.status) return { ok: false, message: ITEM_MESSAGES.noEffect }

    mon.status = null
    mon.statusTurns = 0
    removeItem(save, key)

    return { ok: true, message: ITEM_MESSAGES.healthyAgain }
  }

  if (info.kind === 'revive') {
    if (!isFainted(mon)) return { ok: false, message: ITEM_MESSAGES.noEffect }

    mon.hp = hpFraction(mon, 2)
    mon.status = null
    mon.statusTurns = 0
    removeItem(save, key)

    return { ok: true, message: ITEM_MESSAGES.revived }
  }

  if (info.kind === 'stone') {
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
