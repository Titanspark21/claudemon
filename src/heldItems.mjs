import { ITEMS } from './constants.mjs'
import { hasItem, item, items, species } from './data.mjs'
import { runEffectPhase } from './effects.mjs'
import { allPokemon } from './helpers.mjs'
import { displayName, isEvolutionHeldItem } from './pokemon.mjs'

const bagCount = (save, key) => save?.bag?.[key] ?? 0

const addToBag = (save, key, quantity = 1) => {
  save.bag ??= {}
  save.bag[key] = bagCount(save, key) + quantity
}

const removeFromBag = (save, key, quantity = 1) => {
  const remaining = bagCount(save, key) - quantity

  if (remaining > 0) save.bag[key] = remaining
  else delete save.bag[key]
}

const heldName = (key) => {
  if (hasItem(key)) return item(key).name

  return ITEMS[key]?.name ?? key
}

const otherHolder = (save, mon, key) => {
  return allPokemon(save).find(
    (candidate) => candidate !== mon && candidate.heldItem === key,
  )
}

export const canHoldItem = (itemKey) => {
  if (ITEMS[itemKey]?.held === true) return true
  if (!hasItem(itemKey)) return false

  return item(itemKey).held === true || isEvolutionHeldItem(itemKey)
}

export const equipHeldItem = (save, mon, itemKey) => {
  if (!mon || !save?.bag) {
    return {
      ok: false,
      returnedItem: null,
      message: 'No Pokémon was selected.',
    }
  }
  if (!canHoldItem(itemKey)) {
    return {
      ok: false,
      returnedItem: null,
      message: hasItem(itemKey)
        ? `${item(itemKey).name} cannot be equipped as a held item.`
        : 'No such held item.',
    }
  }
  if (mon.heldItem === itemKey) {
    return {
      ok: false,
      returnedItem: null,
      message: `${displayName(mon).toUpperCase()} is already holding ${heldName(itemKey)}.`,
    }
  }
  if (bagCount(save, itemKey) <= 0) {
    return {
      ok: false,
      returnedItem: null,
      message: `You have no ${heldName(itemKey)}.`,
    }
  }

  const record = hasItem(itemKey) ? item(itemKey) : ITEMS[itemKey]

  if (record.megaStone && otherHolder(save, mon, itemKey)) {
    return {
      ok: false,
      returnedItem: null,
      message: `That ${record.name} is already attached to another Pokémon.`,
    }
  }

  const returnedItem = mon.heldItem ?? null

  // Remove first, then return the old item. That order keeps a same-save swap
  // duplication-proof even if the bag only contains one copy of the new item.
  removeFromBag(save, itemKey)
  if (returnedItem) addToBag(save, returnedItem)
  mon.heldItem = itemKey

  return {
    ok: true,
    returnedItem,
    message: returnedItem
      ? `${displayName(mon).toUpperCase()} now holds ${record.name}; ${heldName(returnedItem)} went back in the bag.`
      : `${displayName(mon).toUpperCase()} now holds ${record.name}.`,
  }
}

export const unequipHeldItem = (save, mon) => {
  if (!mon?.heldItem) {
    return { ok: false, item: null, message: 'It is not holding anything.' }
  }

  const itemKey = mon.heldItem

  mon.heldItem = null
  addToBag(save, itemKey)

  return {
    ok: true,
    item: itemKey,
    message: `${heldName(itemKey)} went back in the bag.`,
  }
}

export const consumeHeldItem = (
  battle,
  side,
  cause = 'effect',
  events = [],
) => {
  const actor = battle?.[side]
  const itemKey = actor?.mon?.heldItem

  if (!itemKey) return false

  const record = hasItem(itemKey) ? item(itemKey) : null
  const consumption = runEffectPhase(battle, 'consumeItem', {
    side,
    itemOwnerSide: side,
    itemKey,
    itemKind: record?.berry ? 'berry' : 'item',
    consumed: true,
    reason: cause,
    automatic: true,
    events,
  })

  if (consumption.cancelled) return false

  actor.mon.heldItem = null
  battle.consumedHeldItems ??= []
  battle.consumedHeldItems.push({
    side,
    item: itemKey,
    cause,
    turn: battle.turn ?? 0,
  })
  events.push({ type: 'item', action: 'consumed', side, key: itemKey, cause })

  return true
}

// Gen-VII wild held-item rates used by the current encounter dataset. Entries
// are mutually exclusive cumulative rolls: common slots occupy 50%, rare slots
// the next 5%, matching the canonical common/rare held-item bands.
const WILD_HELD_ITEMS = new Map([
  [
    25,
    [
      { key: 'oran-berry', chance: 0.5 },
      { key: 'light-ball', chance: 0.05 },
    ],
  ],
  [83, [{ key: 'stick', chance: 0.05 }]],
  [104, [{ key: 'thick-club', chance: 0.05 }]],
  [105, [{ key: 'thick-club', chance: 0.05 }]],
  [
    132,
    [
      { key: 'quick-powder', chance: 0.5 },
      { key: 'metal-powder', chance: 0.05 },
    ],
  ],
  [
    366,
    [
      { key: 'deep-sea-tooth', chance: 0.05 },
      { key: 'deep-sea-scale', chance: 0.05 },
    ],
  ],
])

export const wildHeldItemsFor = (speciesId) =>
  WILD_HELD_ITEMS.get(speciesId) ?? []

export const PROGRESSION_HELD_REWARDS = new Map([
  [1, 'quick-claw'],
  [2, 'king-s-rock'],
  [4, 'focus-sash'],
  [6, 'choice-scarf'],
])

const normalizedName = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const compatibleMegaStone = (save) => {
  const ownedSpecies = new Set(
    allPokemon(save).map((mon) => normalizedName(species(mon.species).name)),
  )

  return (
    Object.values(items())
      .filter(
        (record) =>
          record.held &&
          record.megaStone &&
          ownedSpecies.has(normalizedName(record.megaEvolves)),
      )
      .sort((a, b) => a.key.localeCompare(b.key))[0]?.key ?? null
  )
}

export const awardProgressionHeldItems = (save, previousBadgeCount = 0) => {
  const currentBadgeCount = save.badges?.length ?? 0
  const awarded = []

  for (
    let badge = previousBadgeCount + 1;
    badge <= currentBadgeCount;
    badge++
  ) {
    const key =
      badge === 8
        ? compatibleMegaStone(save)
        : PROGRESSION_HELD_REWARDS.get(badge)

    if (!key || !canHoldItem(key)) continue

    addToBag(save, key)
    awarded.push(key)
  }

  return awarded
}

export const rollWildHeldItem = (
  speciesId,
  versionGroup = 'ultra-sun-ultra-moon',
  rng = Math.random,
) => {
  if (versionGroup !== 'ultra-sun-ultra-moon' && versionGroup !== 'sun-moon') {
    return null
  }

  const entries = wildHeldItemsFor(speciesId).filter(({ key }) => hasItem(key))
  const roll = rng()
  let ceiling = 0

  for (const entry of entries) {
    ceiling += entry.chance
    if (roll < ceiling) return entry.key
  }

  return null
}
