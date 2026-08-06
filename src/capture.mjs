import { species } from './data.mjs'
import { randInt } from './rng.mjs'

export const BALLS = {
  'poke-ball': { name: 'Poké Ball', multiplier: 1 },
  'great-ball': { name: 'Great Ball', multiplier: 1.5 },
  'ultra-ball': { name: 'Ultra Ball', multiplier: 2 },
  'master-ball': { name: 'Master Ball', multiplier: 255 },
}

function statusBonus(status) {
  if (status === 'sleep' || status === 'freeze') return 2
  if (status === 'paralysis' || status === 'burn' || status === 'poison')
    return 1.5
  return 1
}

export function catchValue(target, ballKey) {
  const ball = BALLS[ballKey]
  if (!ball) throw new Error(`no ball called ${ballKey}`)

  const rate = species(target.species).captureRate
  const maxHp = target.stats.hp
  const hp = Math.max(1, target.hp)

  const base = ((3 * maxHp - 2 * hp) * rate * ball.multiplier) / (3 * maxHp)
  return Math.floor(base * statusBonus(target.status))
}

export function attemptCatch(target, ballKey, rng) {
  const a = catchValue(target, ballKey)
  if (a >= 255) return { caught: true, shakes: 4 }

  const b = Math.floor(
    1048560 / Math.floor(Math.sqrt(Math.floor(Math.sqrt(16711680 / a)))),
  )

  let shakes = 0
  for (let i = 0; i < 4; i++) {
    if (randInt(rng, 0, 65535) >= b) return { caught: false, shakes }
    shakes++
  }
  return { caught: true, shakes: 4 }
}
