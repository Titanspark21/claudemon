import { pick } from './rng.mjs'

const NEUTRAL = { raised: null, lowered: null }

export const NATURES = {
  hardy: NEUTRAL,
  lonely: { raised: 'attack', lowered: 'defense' },
  brave: { raised: 'attack', lowered: 'speed' },
  adamant: { raised: 'attack', lowered: 'spAttack' },
  naughty: { raised: 'attack', lowered: 'spDefense' },
  bold: { raised: 'defense', lowered: 'attack' },
  docile: NEUTRAL,
  relaxed: { raised: 'defense', lowered: 'speed' },
  impish: { raised: 'defense', lowered: 'spAttack' },
  lax: { raised: 'defense', lowered: 'spDefense' },
  timid: { raised: 'speed', lowered: 'attack' },
  hasty: { raised: 'speed', lowered: 'defense' },
  serious: NEUTRAL,
  jolly: { raised: 'speed', lowered: 'spAttack' },
  naive: { raised: 'speed', lowered: 'spDefense' },
  modest: { raised: 'spAttack', lowered: 'attack' },
  mild: { raised: 'spAttack', lowered: 'defense' },
  quiet: { raised: 'spAttack', lowered: 'speed' },
  bashful: NEUTRAL,
  rash: { raised: 'spAttack', lowered: 'spDefense' },
  calm: { raised: 'spDefense', lowered: 'attack' },
  gentle: { raised: 'spDefense', lowered: 'defense' },
  sassy: { raised: 'spDefense', lowered: 'speed' },
  careful: { raised: 'spDefense', lowered: 'spAttack' },
  quirky: NEUTRAL,
}

export const NATURE_KEYS = Object.keys(NATURES)

export const rollNature = (rng) => pick(rng, NATURE_KEYS)

export const natureModifiers = (natureKey) => {
  if (natureKey == null) return NEUTRAL

  const modifiers = NATURES[natureKey]

  if (!modifiers) throw new Error(`unknown nature ${natureKey}`)

  return modifiers
}
