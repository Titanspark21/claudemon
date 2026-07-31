// What happens after the last hit lands.
//
// Experience, levels, new moves and evolution, produced as an ordered list of
// steps rather than applied all at once. The interface walks the list, pausing on
// the one step that needs an answer — which move to forget — so the pacing lives
// in the view and the rules live here.

import { move as moveData, species } from './data.mjs'
import { movesLearnedAt, MAX_LEVEL, MOVE_LIMIT } from './exp.mjs'
import {
  displayName, evolveInto, isFainted, levelOf, makeMoveSlot, pendingEvolution, refreshStats,
} from './pokemon.mjs'

// Owned by exp.mjs, which builds the movesets this cap applies to. Re-exported
// because callers reach for it alongside applyVictory.
export { MOVE_LIMIT }

/**
 * Applies a won battle to everyone who fought it.
 *
 * Every Pokemon that was on the field earns the full experience, whether it
 * landed a blow or not: coming out to soak a hit is taking part, and a divisor
 * would only teach people never to switch. One still fainted at the end earns
 * nothing, the same as in the games. Prize money is paid once, to the trainer.
 *
 * Everything except a forgotten move is applied immediately; `learn-choice` steps
 * are left for the interface to resolve with {@link learnMove} or ignore.
 *
 * @param {object[]} mons everyone who took part, in the order they came out
 * @returns {object[]} steps: money, exp, level, learn, learn-choice, evolve
 */
export function applyVictory(save, mons, rewards) {
  const steps = []

  if (rewards.money > 0) {
    save.money += rewards.money
    steps.push({ kind: 'money', amount: rewards.money })
  }

  for (const mon of mons) {
    if (isFainted(mon)) continue
    steps.push(...gainExp(mon, rewards.exp))
  }

  return steps
}

/**
 * One Pokemon's share of a win: the experience, the levels it crosses and what
 * those bring with them.
 *
 * Every step carries its `mon`, because the one a step belongs to is not
 * necessarily the one on the field — a Pokemon on the bench can level up, learn
 * a move and evolve on the back of a fight it left halfway through.
 */
function gainExp(mon, amount) {
  const steps = []

  const before = levelOf(mon)
  mon.exp += amount
  steps.push({ kind: 'exp', amount, mon, name: displayName(mon) })

  const after = levelOf(mon)
  if (after === before) return steps

  // Walk each level crossed, so nothing learned on the way up is skipped.
  for (let level = before + 1; level <= after; level++) {
    refreshStats(mon)
    steps.push({ kind: 'level', level, mon, name: displayName(mon), stats: { ...mon.stats } })

    for (const name of movesLearnedAt(mon.species, level)) {
      if (mon.moves.some((slot) => slot.move === name)) continue

      if (mon.moves.length < MOVE_LIMIT) {
        mon.moves.push(makeMoveSlot(name))
        steps.push({ kind: 'learn', move: name, mon, name: displayName(mon) })
      } else {
        steps.push({ kind: 'learn-choice', move: name, mon, name: displayName(mon) })
      }
    }
  }

  // Evolution comes last, after every level has been counted.
  const target = pendingEvolution(mon)
  if (target) {
    const from = mon.species
    evolveInto(mon, target)
    steps.push({ kind: 'evolve', from, to: target, mon, name: species(target).name })
  }

  if (levelOf(mon) >= MAX_LEVEL) steps.push({ kind: 'maxed', mon, name: displayName(mon) })

  return steps
}

/** Swaps a known move for a new one. Pass a null slot to decline. */
export function learnMove(mon, newMove, slotIndex) {
  if (slotIndex === null || slotIndex === undefined) {
    return { learned: false, forgot: null }
  }
  const forgot = mon.moves[slotIndex]?.move ?? null
  mon.moves[slotIndex] = makeMoveSlot(newMove)
  return { learned: true, forgot }
}

/** Human-readable lines for a step, for the battle message box. */
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
