import { MAX_LEVEL } from './constants.mjs'
import { species } from './data.mjs'
import { expForLevel } from './exp.mjs'
import { levelOf } from './pokemon.mjs'

const knownMoveNames = (mon) =>
  new Set((mon.moves ?? []).map((slot) => slot.move))

const learnedMove = (mon, name) => {
  return (mon.moves ?? []).some((slot) => slot.move === name)
}

export const recoveryExpRequirement = (speciesId, skippedAtLevel) => {
  const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(skippedAtLevel)))
  const current = expForLevel(speciesId, level)
  const next = expForLevel(speciesId, Math.min(MAX_LEVEL, level + 1))

  return Math.max(1, Math.ceil((next - current) * 0.25))
}

const recoveryEntry = (speciesId, move, level) => ({
  move,
  level,
  requiredExp: recoveryExpRequirement(speciesId, level),
  progressExp: 0,
  unlocked: false,
})

const crossedLearnset = (speciesId, fromLevel, toLevel) => {
  return species(speciesId)
    .learnset.map((entry, index) => ({ ...entry, index }))
    .filter((entry) => entry.level > fromLevel && entry.level <= toLevel)
    .sort((left, right) => left.level - right.level || left.index - right.index)
}

const normalizeEntry = (entry) => {
  if (!entry || typeof entry.move !== 'string' || entry.move.length === 0)
    return null

  const level = Number.isFinite(entry.level)
    ? Math.max(1, Math.min(MAX_LEVEL, Math.floor(entry.level)))
    : 1
  const requiredExp = Number.isFinite(entry.requiredExp)
    ? Math.max(1, Math.floor(entry.requiredExp))
    : 1
  const progressExp = Number.isFinite(entry.progressExp)
    ? Math.max(0, Math.min(requiredExp, Math.floor(entry.progressExp)))
    : 0

  return {
    move: entry.move,
    level,
    requiredExp,
    progressExp,
    unlocked: entry.unlocked === true || progressExp >= requiredExp,
  }
}

const normalizeExistingQueue = (mon) => {
  const known = knownMoveNames(mon)
  const seen = new Set()
  const normalized = []

  for (const raw of mon.moveRecovery ?? []) {
    const entry = normalizeEntry(raw)

    if (!entry || known.has(entry.move) || seen.has(entry.move)) continue

    seen.add(entry.move)
    Object.assign(raw, entry)
    normalized.push(raw)
  }

  mon.moveRecovery = normalized
  return normalized
}

export const queueMissedDaycareMoves = (mon, fromLevel, toLevel) => {
  mon.moveRecovery ??= []
  const queue = normalizeExistingQueue(mon)
  const known = knownMoveNames(mon)
  const queued = new Set(queue.map((entry) => entry.move))

  for (const entry of crossedLearnset(mon.species, fromLevel, toLevel)) {
    if (known.has(entry.move) || queued.has(entry.move)) continue

    queue.push(recoveryEntry(mon.species, entry.move, entry.level))
    queued.add(entry.move)
  }

  return mon
}

export const migrateMoveRecovery = (mon) => {
  const hadRecovery = Array.isArray(mon.moveRecovery)

  if (hadRecovery) {
    normalizeExistingQueue(mon)
    return mon
  }

  mon.moveRecovery = []

  if (!Number.isFinite(mon.exp) || !Array.isArray(mon.moves)) return mon

  queueMissedDaycareMoves(mon, 0, levelOf(mon))
  return mon
}

export const completeMoveRecovery = (mon, move) => {
  if (!Array.isArray(mon.moveRecovery)) return false

  const before = mon.moveRecovery.length
  mon.moveRecovery = mon.moveRecovery.filter((entry) => entry.move !== move)

  return mon.moveRecovery.length !== before
}

export const relearnableMoves = (mon) => {
  if (!Array.isArray(mon.moveRecovery)) return []

  return mon.moveRecovery.filter((entry) => !learnedMove(mon, entry.move))
}

export const moveRecoveryStatus = (mon, entry) => {
  if (entry.unlocked) {
    return { unlocked: true, remainingExp: 0, remainingWins: 0 }
  }

  if (levelOf(mon) >= MAX_LEVEL) {
    return { unlocked: false, remainingExp: 0, remainingWins: 1 }
  }

  return {
    unlocked: false,
    remainingExp: Math.max(0, entry.requiredExp - entry.progressExp),
    remainingWins: 0,
  }
}

export const moveRecoveryStatusText = (mon, entry) => {
  const status = moveRecoveryStatus(mon, entry)

  if (status.unlocked) return 'ready to relearn'
  if (status.remainingWins > 0) return `${status.remainingWins} won battle left`

  return `${status.remainingExp} EXP left`
}

const unlockStep = (mon, entry) => {
  entry.unlocked = true

  return { kind: 'recovery-unlocked', move: entry.move, mon }
}

export const applyMoveRecoveryExp = (
  mon,
  awardedExp,
  { wonBattle = false } = {},
) => {
  if (!Array.isArray(mon.moveRecovery)) mon.moveRecovery = []

  normalizeExistingQueue(mon)

  if (mon.moveRecovery.length === 0) return []

  if (levelOf(mon) >= MAX_LEVEL) {
    if (!wonBattle) return []

    const next = mon.moveRecovery.find((entry) => !entry.unlocked)

    return next ? [unlockStep(mon, next)] : []
  }

  let remaining = Number.isFinite(awardedExp)
    ? Math.max(0, Math.floor(awardedExp))
    : 0
  const steps = []

  if (remaining === 0) return steps

  for (const entry of mon.moveRecovery) {
    if (remaining === 0) break
    if (entry.unlocked) continue

    const needed = Math.max(0, entry.requiredExp - entry.progressExp)
    const applied = Math.min(remaining, needed)

    entry.progressExp += applied
    remaining -= applied

    if (entry.progressExp >= entry.requiredExp)
      steps.push(unlockStep(mon, entry))
  }

  return steps
}
