export const makeRng = (seed) => {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0

    let t = state

    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randomSeed = () => Math.floor(Math.random() * 0x100000000) >>> 0

export const randInt = (rng, min, max) => {
  return min + Math.floor(rng() * (max - min + 1))
}

export const chance = (rng, probability) => rng() < probability

export const pick = (rng, items) => items[Math.floor(rng() * items.length)]

export const weightedPick = (rng, items, weightOf) => {
  let total = 0

  for (const item of items) total += weightOf(item)

  if (total <= 0) return pick(rng, items)

  let roll = rng() * total

  for (const item of items) {
    roll -= weightOf(item)

    if (roll < 0) return item
  }

  return items[items.length - 1]
}
