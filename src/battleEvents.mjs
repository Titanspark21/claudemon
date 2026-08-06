import { displayName, isFainted } from './pokemon.mjs'

export const other = (side) => (side === 'player' ? 'foe' : 'player')

export const label = (battle, side) => {
  const name = displayName(battle[side].mon)

  return side === 'player' ? name : `the wild ${name}`
}

export const say = (events, text) => {
  events.push({ type: 'message', text })
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

  const healed = Math.min(amount, mon.stats.hp - mon.hp)

  if (healed <= 0) return 0

  mon.hp += healed

  events.push({ type: 'heal', side, amount: healed, hpAfter: mon.hp })

  return healed
}
