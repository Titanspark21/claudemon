import { MOVE_FIELD_EFFECTS } from './constants.mjs'
import { FIXED_DAMAGE } from './damage.mjs'

const GENERIC_FOCUSED_TESTS = {
  'move:damage': 'src/moveEffects.test.mjs#ordinary-damage',
  'move:status-family': 'src/moveEffects.test.mjs#status',
  'move:multi-hit': 'src/moveEffects.test.mjs#multi-hit',
  'move:drain': 'src/moveEffects.test.mjs#drain',
  'move:recoil': 'src/moveEffects.test.mjs#recoil',
  'move:no-op': 'src/moveEffects.test.mjs#runtime-coverage-registry',
}

const SPECIAL_FOCUSED_TESTS = {
  'move:electroball': 'src/moveEffects.test.mjs#electro-ball',
  'move:teleport': 'test/engine.test.mjs#teleport',
}

const FIELD_FOCUSED_TEST = 'src/moveEffects.test.mjs#field-setters'
const FIXED_DAMAGE_FOCUSED_TEST = 'test/engine.test.mjs#imported-runtime'
const OHKO_FOCUSED_TEST = 'test/engine.test.mjs#ohko'

const coverageHandlerForKey = (key) => `move:${key.replaceAll('-', '')}`

const runtimeRegistration = (handler, focusedTest) => ({
  handler,
  focusedTest,
  executable: true,
})

export const resolveMoveRuntimeCoverage = (move) => {
  if (!move?.key) return null

  if (move.key === 'electro-ball')
    return runtimeRegistration(
      'move:electroball',
      SPECIAL_FOCUSED_TESTS['move:electroball'],
    )

  if (move.key === 'teleport')
    return runtimeRegistration(
      'move:teleport',
      SPECIAL_FOCUSED_TESTS['move:teleport'],
    )

  if (MOVE_FIELD_EFFECTS[move.key])
    return runtimeRegistration(
      coverageHandlerForKey(move.key),
      FIELD_FOCUSED_TEST,
    )

  if (move.ohko)
    return runtimeRegistration(
      coverageHandlerForKey(move.key),
      OHKO_FOCUSED_TEST,
    )

  if (move.fixedDamage != null || FIXED_DAMAGE[move.key])
    return runtimeRegistration(
      coverageHandlerForKey(move.key),
      FIXED_DAMAGE_FOCUSED_TEST,
    )

  if (move.key === 'splash')
    return runtimeRegistration(
      'move:no-op',
      GENERIC_FOCUSED_TESTS['move:no-op'],
    )

  if (move.maxHits)
    return runtimeRegistration(
      'move:multi-hit',
      GENERIC_FOCUSED_TESTS['move:multi-hit'],
    )

  if (move.drain > 0)
    return runtimeRegistration(
      'move:drain',
      GENERIC_FOCUSED_TESTS['move:drain'],
    )

  if (move.drain < 0)
    return runtimeRegistration(
      'move:recoil',
      GENERIC_FOCUSED_TESTS['move:recoil'],
    )

  if (move.damageClass === 'status')
    return runtimeRegistration(
      'move:status-family',
      GENERIC_FOCUSED_TESTS['move:status-family'],
    )

  if (move.damageClass === 'physical' || move.damageClass === 'special')
    return runtimeRegistration(
      'move:damage',
      GENERIC_FOCUSED_TESTS['move:damage'],
    )

  return null
}
