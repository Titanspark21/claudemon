import { BALLS, DEFAULT_CATCH_BONUS, STATUS_CATCH_BONUS } from './constants.mjs'
import { species } from './data.mjs'
import { randInt } from './rng.mjs'

const statusBonus = (status) => {
  return STATUS_CATCH_BONUS[status] ?? DEFAULT_CATCH_BONUS
}

export const catchValue = (target, ballKey) => {
  const ball = BALLS[ballKey]

  if (!ball) throw new Error(`no ball called ${ballKey}`)

  const rate = species(target.species).captureRate
  const maxHp = target.stats.hp
  const hp = Math.max(1, target.hp)

  const base = ((3 * maxHp - 2 * hp) * rate * ball.multiplier) / (3 * maxHp)

  return Math.floor(base * statusBonus(target.status))
}

export const attemptCatch = (target, ballKey, rng) => {
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
