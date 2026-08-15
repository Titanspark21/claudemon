import { battleMaxHp } from './battleActor.mjs'
import { FOE_LABELS } from './constants.mjs'
import { item, loadData, species } from './data.mjs'
import { displayName, isFainted } from './pokemon.mjs'

export const other = (side) => (side === 'player' ? 'foe' : 'player')

export const label = (battle, side) => {
  const name = displayName(battle[side].mon)

  if (side === 'player') return name
  if (battle.trainer) return `${FOE_LABELS.trainer} ${name}`

  return `${FOE_LABELS.wild} ${name}`
}

export const say = (events, text) => {
  events.push({ type: 'message', text })
}

const titleCase = (value) =>
  String(value ?? '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')

const abilityName = (key) => loadData().abilities[key]?.name ?? titleCase(key)
const itemName = (key) => {
  try {
    return item(key).name
  } catch {
    return titleCase(key)
  }
}
const speciesName = (id) => {
  try {
    return species(id).name
  } catch {
    return 'its Mega form'
  }
}
const fieldName = (kind, key) => {
  const names = {
    weather: {
      rain: 'Rain',
      sun: 'Harsh sunlight',
      sandstorm: 'Sandstorm',
      hail: 'Hail',
    },
    terrain: {
      electric: 'Electric',
      grassy: 'Grassy',
      misty: 'Misty',
      psychic: 'Psychic',
    },
  }

  return names[kind]?.[key] ?? titleCase(key)
}

export const effectAnnouncement = (event) => {
  if (!event) return null

  if (event.type === 'ability') {
    const owner = event.side === 'player' ? 'Your ability' : 'Foe ability'
    return `${owner}: ${abilityName(event.ability)}`
  }

  if (event.type === 'item') {
    const name = itemName(event.key)

    if (event.action === 'activated') {
      const owner = event.side === 'player' ? 'Your held item' : 'Foe held item'
      return `${owner}: ${name} activated!`
    }
    if (event.action === 'consumed')
      return event.side === 'player'
        ? `Your ${name} was consumed.`
        : `Foe's ${name} was consumed.`
  }

  if (event.type === 'field' || event.type === 'field-end') {
    const label = event.kind === 'weather' ? 'Weather' : 'Terrain'
    const name = fieldName(event.kind, event.key)

    if (event.type === 'field-end') return `${label}: ${name} ended.`

    return `${label}: ${name} began · ${event.turns} ${event.turns === 1 ? 'turn' : 'turns'}`
  }

  if (event.type === 'mega-toggle' && event.side === 'player')
    return event.enabled
      ? 'Mega Evolution ready — choose a move.'
      : 'Mega Evolution cancelled.'

  if (event.type === 'mega') {
    const name = speciesName(event.targetId)
    return event.side === 'player'
      ? `Your Pokémon Mega Evolved into ${name}!`
      : `The foe Mega Evolved into ${name}!`
  }

  return null
}

export const applyDamage = (battle, side, amount, events) => {
  const mon = battle[side].mon
  const dealt = Math.min(amount, mon.hp)

  mon.hp -= dealt

  events.push({ type: 'damage', side, amount: dealt, hpAfter: mon.hp })

  return dealt
}

export const applyHeal = (battle, side, amount, events) => {
  const mon = battle[side].mon

  if (isFainted(mon)) return 0

  const healed = Math.min(amount, battleMaxHp(battle[side]) - mon.hp)

  if (healed <= 0) return 0

  mon.hp += healed

  events.push({ type: 'heal', side, amount: healed, hpAfter: mon.hp })

  return healed
}
