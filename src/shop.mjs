import { BALLS } from './capture.mjs'
import {
  displayName,
  evolveInto,
  isFainted,
  speciesName,
  stoneEvolution,
} from './pokemon.mjs'

export const ITEMS = {
  'poke-ball': {
    name: 'Poké Ball',
    kind: 'ball',
    price: 200,
    description: 'A basic ball.',
  },
  'great-ball': {
    name: 'Great Ball',
    kind: 'ball',
    price: 600,
    description: 'Catches better than a Poké Ball.',
  },
  'ultra-ball': {
    name: 'Ultra Ball',
    kind: 'ball',
    price: 1200,
    description: 'A high performance ball.',
  },
  'master-ball': {
    name: 'Master Ball',
    kind: 'ball',
    price: null,
    description: 'Never fails. Cannot be bought.',
  },

  potion: {
    name: 'Potion',
    kind: 'heal',
    heals: 20,
    price: 300,
    description: 'Restores 20 HP.',
  },
  'super-potion': {
    name: 'Super Potion',
    kind: 'heal',
    heals: 50,
    price: 700,
    description: 'Restores 50 HP.',
  },
  'hyper-potion': {
    name: 'Hyper Potion',
    kind: 'heal',
    heals: 200,
    price: 1200,
    description: 'Restores 200 HP.',
  },
  'full-restore': {
    name: 'Full Restore',
    kind: 'heal',
    heals: Infinity,
    cures: true,
    price: 3000,
    description: 'Fully restores HP and status.',
  },
  'full-heal': {
    name: 'Full Heal',
    kind: 'cure',
    price: 600,
    description: 'Cures any status condition.',
  },
  revive: {
    name: 'Revive',
    kind: 'revive',
    price: 1500,
    description: 'Revives a fainted Pokémon to half HP.',
  },

  'fire-stone': {
    name: 'Fire Stone',
    kind: 'stone',
    price: 2100,
    description: 'Evolves certain Pokémon.',
  },
  'water-stone': {
    name: 'Water Stone',
    kind: 'stone',
    price: 2100,
    description: 'Evolves certain Pokémon.',
  },
  'thunder-stone': {
    name: 'Thunder Stone',
    kind: 'stone',
    price: 2100,
    description: 'Evolves certain Pokémon.',
  },
  'leaf-stone': {
    name: 'Leaf Stone',
    kind: 'stone',
    price: 2100,
    description: 'Evolves certain Pokémon.',
  },
  'moon-stone': {
    name: 'Moon Stone',
    kind: 'stone',
    price: 2100,
    description: 'Evolves certain Pokémon.',
  },
}

export const SHOP_STOCK = Object.keys(ITEMS).filter(
  (key) => ITEMS[key].price !== null,
)

export function ballsInBag(save) {
  return Object.keys(BALLS)
    .filter((key) => (save.bag[key] ?? 0) > 0)
    .sort((a, b) => BALLS[a].multiplier - BALLS[b].multiplier)
}

export function itemsInBag(save) {
  return Object.keys(ITEMS).filter((key) => countOf(save, key) > 0)
}

const PARTY_ITEM_KINDS = new Set(['heal', 'cure', 'revive', 'stone'])

export function usableOnParty(key) {
  return PARTY_ITEM_KINDS.has(ITEMS[key]?.kind)
}

export function countOf(save, key) {
  return save.bag?.[key] ?? 0
}

export function addItem(save, key, quantity = 1) {
  save.bag ??= {}
  save.bag[key] = (save.bag[key] ?? 0) + quantity
  return save
}

export function removeItem(save, key, quantity = 1) {
  const remaining = (save.bag[key] ?? 0) - quantity
  if (remaining > 0) save.bag[key] = remaining
  else delete save.bag[key]
  return save
}

export function buy(save, key, quantity = 1) {
  const item = ITEMS[key]
  if (!item) return { ok: false, reason: 'No such item.' }
  if (item.price === null)
    return { ok: false, reason: `${item.name} is not for sale.` }

  const cost = item.price * quantity
  if (save.money < cost) return { ok: false, reason: "You can't afford that." }

  save.money -= cost
  addItem(save, key, quantity)
  return { ok: true, spent: cost }
}

export function useItem(save, key, mon) {
  const item = ITEMS[key]
  if (!item) return { ok: false, message: 'Nothing happened.' }
  if (countOf(save, key) <= 0)
    return { ok: false, message: `You have no ${item.name}.` }

  if (item.kind === 'heal') {
    if (isFainted(mon))
      return { ok: false, message: 'It had no effect on a fainted Pokémon.' }
    if (mon.hp >= mon.stats.hp && !(item.cures && mon.status)) {
      return { ok: false, message: 'It would have no effect.' }
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
    if (!mon.status) return { ok: false, message: 'It would have no effect.' }
    mon.status = null
    mon.statusTurns = 0
    removeItem(save, key)
    return { ok: true, message: 'It became healthy again.' }
  }

  if (item.kind === 'revive') {
    if (!isFainted(mon))
      return { ok: false, message: 'It would have no effect.' }
    mon.hp = Math.max(1, Math.floor(mon.stats.hp / 2))
    mon.status = null
    removeItem(save, key)
    return { ok: true, message: 'It was revived!' }
  }

  if (item.kind === 'stone') {
    const target = stoneEvolution(mon, key)
    if (!target) return { ok: false, message: 'It would have no effect.' }

    const before = displayName(mon)
    evolveInto(mon, target)
    removeItem(save, key)
    return {
      ok: true,
      message: `Congratulations! ${before.toUpperCase()} evolved into ${speciesName(target).toUpperCase()}!`,
      evolvedInto: target,
    }
  }

  return { ok: false, message: 'Nothing happened.' }
}
