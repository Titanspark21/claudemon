// Seeded random numbers.
//
// Battles are seeded so a fight can be replayed exactly, which makes the engine
// testable and means a crash mid-battle can be resumed without rerolling luck.

/** mulberry32: small, fast, good enough for a game. Returns floats in [0, 1). */
export function makeRng(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed() {
  return Math.floor(Math.random() * 0x100000000) >>> 0
}

/** Integer in [min, max], both inclusive. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1))
}

export function chance(rng, probability) {
  return rng() < probability
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)]
}

/** Picks one item, where `weightOf` returns its relative likelihood. */
export function weightedPick(rng, items, weightOf) {
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
