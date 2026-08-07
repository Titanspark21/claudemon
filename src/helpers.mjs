import { randInt } from './rng.mjs'

export const pickLevel = (rng, leadLevel, spread) => {
  if (!leadLevel) return randInt(rng, spread.min, spread.fallbackMax)

  const min = Math.max(spread.min, leadLevel - spread.below)
  const max = Math.min(spread.ceiling, Math.max(min, leadLevel + spread.above))

  return randInt(rng, min, max)
}
