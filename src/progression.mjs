import { move as moveData, species } from './data.mjs'
import { movesLearnedAt, MAX_LEVEL, MOVE_LIMIT } from './exp.mjs'
import {
  displayName,
  evolveInto,
  isFainted,
  levelOf,
  makeMoveSlot,
  pendingEvolution,
  refreshStats,
} from './pokemon.mjs'
import { markCaught } from './state.mjs'

export { MOVE_LIMIT }

export function applyVictory(save, mons, rewards) {
  const steps = []

  if (rewards.money > 0) {
    save.money += rewards.money
    steps.push({ kind: 'money', amount: rewards.money })
  }

  for (const mon of mons) {
    if (isFainted(mon)) continue
    steps.push(...gainExp(save, mon, rewards.exp))
  }

  return steps
}

function gainExp(save, mon, amount) {
  const steps = []

  const before = levelOf(mon)
  mon.exp += amount
  steps.push({ kind: 'exp', amount, mon, name: displayName(mon) })

  const after = levelOf(mon)
  if (after === before) return steps

  for (let level = before + 1; level <= after; level++) {
    refreshStats(mon)
    steps.push({
      kind: 'level',
      level,
      mon,
      name: displayName(mon),
      stats: { ...mon.stats },
    })

    steps.push(...learnMovesAt(mon, level))

    const target = pendingEvolution(mon, level)
    if (target) {
      const from = mon.species
      evolveInto(mon, target)
      markCaught(save, target)
      steps.push({
        kind: 'evolve',
        from,
        to: target,
        mon,
        name: species(target).name,
      })
      steps.push(...learnMovesAt(mon, level))
    }
  }

  if (levelOf(mon) >= MAX_LEVEL)
    steps.push({ kind: 'maxed', mon, name: displayName(mon) })

  return steps
}

function learnMovesAt(mon, level) {
  const steps = []

  for (const name of movesLearnedAt(mon.species, level)) {
    if (mon.moves.some((slot) => slot.move === name)) continue

    if (mon.moves.length < MOVE_LIMIT) {
      mon.moves.push(makeMoveSlot(name))
      steps.push({ kind: 'learn', move: name, mon, name: displayName(mon) })
    } else {
      steps.push({
        kind: 'learn-choice',
        move: name,
        mon,
        name: displayName(mon),
      })
    }
  }

  return steps
}

export function learnEvolutionMoves(mon) {
  return learnMovesAt(mon, levelOf(mon))
}

export function learnMove(mon, newMove, slotIndex) {
  if (slotIndex === null || slotIndex === undefined) {
    return { learned: false, forgot: null }
  }
  const forgot = mon.moves[slotIndex]?.move ?? null
  mon.moves[slotIndex] = makeMoveSlot(newMove)
  return { learned: true, forgot }
}

export function describeStep(step) {
  switch (step.kind) {
    case 'money':
      return [`You got ${step.amount}₽ for winning!`]
    case 'exp':
      return [`${step.name} gained ${step.amount} EXP. Points!`]
    case 'level':
      return [`${step.name} grew to level ${step.level}!`]
    case 'learn':
      return [`${step.name} learned ${moveData(step.move).name}!`]
    case 'learn-choice':
      return [
        `${step.name} wants to learn ${moveData(step.move).name},`,
        `but it already knows four moves.`,
      ]
    case 'evolve':
      return [`Congratulations! Your Pokémon evolved into ${step.name}!`]
    case 'maxed':
      return [`${step.name} has reached the highest level.`]
    default:
      return []
  }
}
