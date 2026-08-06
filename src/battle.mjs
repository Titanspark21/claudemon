// The turn engine.
//
// Pure logic over a battle object, driven by one action at a time and returning a
// list of events. The interface animates those events; it never computes anything.
// That split is what makes the whole engine testable without a terminal.
//
// The maths is Gen 1's damage formula with modern stat stages and a modern type
// chart — recognisable to anyone who played Red, without inheriting its bugs.

import { move as moveData, species } from './data.mjs'
import { attemptCatch, BALLS } from './capture.mjs'
import { expFromDefeating, moneyFromDefeating } from './exp.mjs'
import { displayName, isFainted, levelOf } from './pokemon.mjs'
import { chance, makeRng, randInt } from './rng.mjs'
import { effectiveness, effectivenessMessage } from './typechart.mjs'

const CRIT_CHANCE = 1 / 16
const HIGH_CRIT_CHANCE = 1 / 8
const SLEEP_WAKE_CHANCE = 1 / 3
const THAW_CHANCE = 0.2
const PARALYSIS_SKIP_CHANCE = 0.25

/** Used when every move is out of PP. */
const STRUGGLE = {
  move: 'struggle',
  data: {
    name: 'Struggle',
    type: 'normal',
    power: 50,
    accuracy: null,
    pp: 1,
    priority: 0,
    damageClass: 'physical',
    ailment: null,
    statChanges: [],
    critRate: 0,
  },
}

/** Moves whose damage ignores the usual formula. */
const FIXED_DAMAGE = {
  'dragon-rage': () => 40,
  'sonic-boom': () => 20,
  'seismic-toss': ({ attackerLevel }) => attackerLevel,
  'night-shade': ({ attackerLevel }) => attackerLevel,
  'super-fang': ({ defender }) => Math.max(1, Math.floor(defender.hp / 2)),
  psywave: ({ attackerLevel, rng }) =>
    Math.max(1, Math.floor((attackerLevel * randInt(rng, 50, 150)) / 100)),
}

const OHKO_MOVES = new Set(['guillotine', 'horn-drill', 'fissure'])

/** Moves we do not model. Counter needs damage history the engine does not keep. */
const UNSUPPORTED_MOVES = new Set(['counter', 'mirror-move', 'metronome', 'transform'])

/** Low Kick is weight-based in modern data, which the dataset has no weights for. */
const FALLBACK_POWER = { 'low-kick': 50 }

const STATUS_LABELS = {
  burn: 'was burned',
  poison: 'was poisoned',
  paralysis: 'is paralysed',
  sleep: 'fell asleep',
  freeze: 'was frozen solid',
}

const STAT_LABELS = {
  attack: 'Attack',
  defense: 'Defense',
  spAttack: 'Sp. Atk',
  spDefense: 'Sp. Def',
  speed: 'Speed',
  accuracy: 'accuracy',
  evasion: 'evasion',
}

/** Types that shrug off an ailment outright, because a Fire type cannot burn. */
const AILMENT_IMMUNE_TYPES = {
  burn: ['fire'],
  poison: ['poison', 'steel'],
  freeze: ['ice'],
  paralysis: ['electric'],
}

/** The engine owns which stat stages exist; nothing else should spell them out. */
export function emptyStages() {
  return { attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0, accuracy: 0, evasion: 0 }
}

/** Modern stage multiplier: +1 is 1.5x, -1 is 0.67x, capped at six steps. */
function stageMultiplier(stage) {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage)
}

/**
 * @param {object[]} [participants] everyone who has already been on the field
 *   this encounter, for a battle that continues one — a Pokemon replacing a
 *   fainted one is a new battle object against the same wild Pokemon, and the
 *   payout still owes whoever came before it.
 */
export function createBattle({ playerMon, wildMon, seed, participants = [] }) {
  return {
    seed,
    rng: makeRng(seed),
    turn: 0,
    player: { mon: playerMon, stages: emptyStages() },
    foe: { mon: wildMon, stages: emptyStages() },
    // Everyone who has stood on the field, in the order they came out. Being
    // there is what earns experience, so this only ever grows.
    participants: [...new Set([...participants, playerMon])],
    over: false,
    outcome: null,
    rewards: null,
    runAttempts: 0,
  }
}

/**
 * Brings another party member out.
 *
 * Choosing one is the interface's business, but what a switch means is the
 * engine's: stat stages reset, the same as they do in the games, and standing on
 * the field at all puts a Pokemon on the payout list.
 */
export function switchIn(battle, mon) {
  battle.player.mon = mon
  battle.player.stages = emptyStages()
  if (!battle.participants.includes(mon)) battle.participants.push(mon)
  return battle
}

/** Rebuilds the callable rng after a battle has been through JSON. */
export function rehydrate(battle) {
  if (!battle.rng) battle.rng = makeRng(battle.seed)
  return battle
}

function other(side) {
  return side === 'player' ? 'foe' : 'player'
}

function label(battle, side) {
  const name = displayName(battle[side].mon)
  return side === 'player' ? name : `the wild ${name}`
}

function say(events, text) {
  events.push({ type: 'message', text })
}

/** Effective speed, including paralysis and stat stages. */
function effectiveSpeed(actor) {
  const base = actor.mon.stats.speed * stageMultiplier(actor.stages.speed)
  return actor.mon.status === 'paralysis' ? base / 2 : base
}

function moveSlotOf(actor, index) {
  const slot = actor.mon.moves[index]
  if (!slot) return null
  return slot.pp > 0 ? slot : null
}

/** Whether a Pokemon has any move left with PP. */
function hasUsableMove(actor) {
  return actor.mon.moves.some((slot) => slot.pp > 0)
}

/**
 * Whether a status stops the attack before it starts, emitting whatever it says.
 */
function blockedByStatus(battle, side, events) {
  const actor = battle[side]
  const mon = actor.mon
  const who = label(battle, side)

  if (mon.status === 'sleep') {
    if (mon.statusTurns <= 0 || chance(battle.rng, SLEEP_WAKE_CHANCE)) {
      mon.status = null
      mon.statusTurns = 0
      say(events, `${who} woke up!`)
      return false
    }
    mon.statusTurns--
    say(events, `${who} is fast asleep.`)
    return true
  }

  if (mon.status === 'freeze') {
    if (chance(battle.rng, THAW_CHANCE)) {
      mon.status = null
      say(events, `${who} thawed out!`)
      return false
    }
    say(events, `${who} is frozen solid!`)
    return true
  }

  if (mon.status === 'paralysis' && chance(battle.rng, PARALYSIS_SKIP_CHANCE)) {
    say(events, `${who} is paralysed and can't move!`)
    return true
  }

  return false
}

function applyDamage(battle, side, amount, events) {
  const actor = battle[side]
  const dealt = Math.min(amount, actor.mon.hp)
  actor.mon.hp -= dealt
  events.push({ type: 'damage', side, amount: dealt, hpAfter: actor.mon.hp })
  return dealt
}

function computeDamage(battle, attackerSide, move, isCrit) {
  const attacker = battle[attackerSide]
  const defender = battle[other(attackerSide)]
  const attackerLevel = levelOf(attacker.mon)

  const physical = move.damageClass === 'physical'
  const attackStat = physical ? 'attack' : 'spAttack'
  const defenseStat = physical ? 'defense' : 'spDefense'

  // A critical hit ignores stat stages, so a defence boost cannot blunt it.
  const a =
    attacker.mon.stats[attackStat] * (isCrit ? 1 : stageMultiplier(attacker.stages[attackStat]))
  const d =
    defender.mon.stats[defenseStat] * (isCrit ? 1 : stageMultiplier(defender.stages[defenseStat]))

  const power = move.power ?? FALLBACK_POWER[move.key] ?? 50
  let damage =
    Math.floor(Math.floor((Math.floor((2 * attackerLevel) / 5 + 2) * power * a) / d) / 50) + 2

  if (isCrit) damage = Math.floor(damage * 1.5)

  const attackerTypes = species(attacker.mon.species).types
  if (attackerTypes.includes(move.type)) damage = Math.floor(damage * 1.5)

  const multiplier = effectiveness(move.type, species(defender.mon.species).types)
  damage = Math.floor(damage * multiplier)

  // A burn halves physical output.
  if (attacker.mon.status === 'burn' && physical) damage = Math.floor(damage / 2)

  // The spread every hit gets, so identical attacks are not identical.
  damage = Math.floor((damage * randInt(battle.rng, 217, 255)) / 255)

  return { damage: multiplier === 0 ? 0 : Math.max(1, damage), multiplier }
}

function landsHit(battle, attackerSide, move) {
  if (move.accuracy === null) return true

  const attacker = battle[attackerSide]
  const defender = battle[other(attackerSide)]
  const modifier =
    stageMultiplier(attacker.stages.accuracy) / stageMultiplier(defender.stages.evasion)

  return battle.rng() * 100 < move.accuracy * modifier
}

function applyStatChanges(battle, attackerSide, move, events) {
  for (const change of move.statChanges) {
    // A negative change targets the opponent; a positive one the user.
    const side = change.change < 0 ? other(attackerSide) : attackerSide
    const actor = battle[side]
    const current = actor.stages[change.stat] ?? 0
    const next = Math.max(-6, Math.min(6, current + change.change))
    const who = label(battle, side)
    const statName = STAT_LABELS[change.stat] ?? change.stat

    if (next === current) {
      say(events, `${who}'s ${statName} won't go ${change.change < 0 ? 'lower' : 'higher'}!`)
      continue
    }

    actor.stages[change.stat] = next
    events.push({ type: 'stat', side, stat: change.stat, delta: change.change })
    const magnitude = Math.abs(change.change) > 1 ? 'sharply ' : ''
    say(
      events,
      `${who}'s ${statName} ${change.change < 0 ? `${magnitude}fell` : `rose${magnitude ? ' sharply' : ''}`}!`,
    )
  }
}

function applyAilment(battle, attackerSide, move, events) {
  if (!move.ailment) return
  if (!(move.ailment in STATUS_LABELS)) return

  const defender = battle[other(attackerSide)]
  if (defender.mon.status) return

  // Status moves apply reliably; a damaging move only on its listed chance.
  const rate = move.damageClass === 'status' ? move.ailmentChance || 100 : move.ailmentChance || 0
  if (rate <= 0 || !chance(battle.rng, rate / 100)) return

  const defenderTypes = species(defender.mon.species).types
  const immune = AILMENT_IMMUNE_TYPES[move.ailment] ?? []
  if (immune.some((type) => defenderTypes.includes(type))) return

  defender.mon.status = move.ailment
  defender.mon.statusTurns = move.ailment === 'sleep' ? randInt(battle.rng, 1, 3) : 0
  events.push({ type: 'status', side: other(attackerSide), status: move.ailment })
  say(events, `${label(battle, other(attackerSide))} ${STATUS_LABELS[move.ailment]}!`)
}

/**
 * Whether a move cannot touch the defender at all, saying so if it cannot.
 *
 * Only for the damage paths that skip {@link computeDamage} — the normal path
 * learns the same thing from the multiplier it already computed.
 */
function doesNotAffect(move, defenderTypes, events) {
  if (effectiveness(move.type, defenderTypes) !== 0) return false
  say(events, "It doesn't affect the foe...")
  return true
}

/** Runs one Pokemon's move. */
function useMove(battle, attackerSide, moveIndex, events) {
  const attacker = battle[attackerSide]
  const defenderSide = other(attackerSide)

  if (blockedByStatus(battle, attackerSide, events)) return

  const slot = moveSlotOf(attacker, moveIndex)
  let move
  if (slot) {
    move = { ...moveData(slot.move), key: slot.move }
    slot.pp--
  } else if (!hasUsableMove(attacker)) {
    // Out of options entirely.
    move = { ...STRUGGLE.data, key: STRUGGLE.move }
  } else {
    say(events, 'No PP left for that move!')
    return
  }

  say(events, `${label(battle, attackerSide)} used ${move.name}!`)

  if (UNSUPPORTED_MOVES.has(move.key)) {
    say(events, 'But it failed!')
    return
  }

  if (!landsHit(battle, attackerSide, move)) {
    say(events, `${label(battle, attackerSide)}'s attack missed!`)
    return
  }

  if (move.damageClass === 'status') {
    applyStatChanges(battle, attackerSide, move, events)
    applyAilment(battle, attackerSide, move, events)
    if (move.healing) {
      const healed = Math.min(
        Math.floor((attacker.mon.stats.hp * move.healing) / 100),
        attacker.mon.stats.hp - attacker.mon.hp,
      )
      if (healed > 0) {
        attacker.mon.hp += healed
        events.push({ type: 'heal', side: attackerSide, amount: healed, hpAfter: attacker.mon.hp })
        say(events, `${label(battle, attackerSide)} regained health!`)
      }
    }
    return
  }

  const defenderTypes = species(battle[defenderSide].mon.species).types

  if (OHKO_MOVES.has(move.key)) {
    if (doesNotAffect(move, defenderTypes, events)) return
    applyDamage(battle, defenderSide, battle[defenderSide].mon.hp, events)
    say(events, "It's a one-hit KO!")
    return
  }

  if (FIXED_DAMAGE[move.key]) {
    if (doesNotAffect(move, defenderTypes, events)) return
    const amount = FIXED_DAMAGE[move.key]({
      attackerLevel: levelOf(attacker.mon),
      defender: battle[defenderSide].mon,
      rng: battle.rng,
    })
    applyDamage(battle, defenderSide, amount, events)
    return
  }

  const critChance = move.critRate > 0 ? HIGH_CRIT_CHANCE : CRIT_CHANCE
  const isCrit = chance(battle.rng, critChance)
  const { damage, multiplier } = computeDamage(battle, attackerSide, move, isCrit)

  if (multiplier === 0) {
    say(events, "It doesn't affect the foe...")
    return
  }

  // Multi-hit moves roll their hit count, then repeat the same damage.
  const hits = move.maxHits ? randInt(battle.rng, move.minHits ?? move.maxHits, move.maxHits) : 1
  let total = 0
  for (let hit = 0; hit < hits; hit++) {
    if (isFainted(battle[defenderSide].mon)) break
    total += applyDamage(battle, defenderSide, damage, events)
  }

  if (isCrit) say(events, 'A critical hit!')
  const note = effectivenessMessage(multiplier)
  if (note) say(events, note)
  if (hits > 1) say(events, `Hit ${hits} times!`)

  if (move.drain && total > 0) {
    const drained = Math.max(1, Math.floor((total * move.drain) / 100))
    if (drained > 0) {
      attacker.mon.hp = Math.min(attacker.mon.stats.hp, attacker.mon.hp + drained)
      events.push({ type: 'heal', side: attackerSide, amount: drained, hpAfter: attacker.mon.hp })
      say(events, `${label(battle, attackerSide)} had its energy drained!`)
    }
  }

  // Struggle costs the user a quarter of the damage it dealt.
  if (move.key === STRUGGLE.move && total > 0) {
    applyDamage(battle, attackerSide, Math.max(1, Math.floor(total / 4)), events)
    say(events, `${label(battle, attackerSide)} is hit by recoil!`)
  }

  if (!isFainted(battle[defenderSide].mon)) {
    applyAilment(battle, attackerSide, move, events)
    applyStatChanges(battle, attackerSide, move, events)
  }
}

/** Burn and poison bite at the end of the turn. */
function endOfTurnDamage(battle, side, events) {
  const mon = battle[side].mon
  if (isFainted(mon)) return

  const fraction = mon.status === 'poison' ? 8 : mon.status === 'burn' ? 16 : 0
  if (fraction === 0) return

  const amount = Math.max(1, Math.floor(mon.stats.hp / fraction))
  applyDamage(battle, side, amount, events)
  say(events, `${label(battle, side)} is hurt by its ${mon.status}!`)
}

function checkFaint(battle, events) {
  for (const side of ['player', 'foe']) {
    if (!isFainted(battle[side].mon)) continue

    events.push({ type: 'faint', side })
    say(events, `${label(battle, side)} fainted!`)

    if (side === 'foe') {
      const foe = battle.foe.mon
      battle.rewards = {
        exp: expFromDefeating(foe.species, levelOf(foe)),
        money: moneyFromDefeating(levelOf(foe), battle.rng),
      }
      finish(battle, 'win', events)
    } else {
      finish(battle, 'loss', events)
    }
    return true
  }
  return false
}

function finish(battle, outcome, events) {
  battle.over = true
  battle.outcome = outcome
  events.push({ type: 'end', outcome })
}

/**
 * Advances the battle by one player action.
 *
 * @param {object} battle
 * @param {{type: 'move', index: number} | {type: 'ball', key: string} | {type: 'run'}} action
 * @returns {object[]} events for the interface to play out
 */
export function submitAction(battle, action) {
  const events = []
  if (battle.over) return events

  rehydrate(battle)
  battle.turn++

  if (action.type === 'ball') {
    const ball = BALLS[action.key]
    say(events, `You threw a ${ball.name}!`)

    const result = attemptCatch(battle.foe.mon, action.key, battle.rng)
    events.push({ type: 'catch', shakes: result.shakes, caught: result.caught })

    if (result.caught) {
      say(events, `Gotcha! ${displayName(battle.foe.mon)} was caught!`)
      finish(battle, 'caught', events)
      return events
    }

    const complaint =
      result.shakes === 0
        ? 'Oh no! The Pokemon broke free!'
        : result.shakes < 3
          ? 'Aargh! Almost had it!'
          : 'Shoot! It was so close too!'
    say(events, complaint)
  } else if (action.type === 'run') {
    battle.runAttempts++
    // Faster Pokemon always get away; otherwise the odds improve with each try.
    const playerSpeed = effectiveSpeed(battle.player)
    const foeSpeed = effectiveSpeed(battle.foe)
    const odds =
      playerSpeed >= foeSpeed
        ? 1
        : Math.min(0.95, (playerSpeed / foeSpeed) * 0.5 + battle.runAttempts * 0.15)

    if (chance(battle.rng, odds)) {
      say(events, 'Got away safely!')
      finish(battle, 'fled', events)
      return events
    }
    say(events, "Couldn't get away!")
  } else if (action.type === 'move') {
    const playerFirst = decideOrder(battle, action.index)

    if (playerFirst) {
      useMove(battle, 'player', action.index, events)
      if (checkFaint(battle, events)) return events
      useMove(battle, 'foe', pickFoeMove(battle), events)
    } else {
      useMove(battle, 'foe', pickFoeMove(battle), events)
      if (checkFaint(battle, events)) return events
      useMove(battle, 'player', action.index, events)
    }

    if (checkFaint(battle, events)) return events
  }

  // The foe still gets its turn after a failed ball or a failed escape.
  if (action.type !== 'move') {
    useMove(battle, 'foe', pickFoeMove(battle), events)
    if (checkFaint(battle, events)) return events
  }

  for (const side of ['player', 'foe']) {
    endOfTurnDamage(battle, side, events)
  }
  checkFaint(battle, events)

  return events
}

/** Priority first, then speed, with a coin flip to break a tie. */
function decideOrder(battle, playerMoveIndex) {
  const playerSlot = moveSlotOf(battle.player, playerMoveIndex)
  const foeIndex = pickFoeMove(battle)
  const foeSlot = moveSlotOf(battle.foe, foeIndex)

  const playerPriority = playerSlot ? moveData(playerSlot.move).priority : 0
  const foePriority = foeSlot ? moveData(foeSlot.move).priority : 0
  if (playerPriority !== foePriority) return playerPriority > foePriority

  const playerSpeed = effectiveSpeed(battle.player)
  const foeSpeed = effectiveSpeed(battle.foe)
  if (playerSpeed !== foeSpeed) return playerSpeed > foeSpeed
  return chance(battle.rng, 0.5)
}

/**
 * The wild Pokemon's choice.
 *
 * Deliberately simple, and deliberately not random: it prefers whatever would hurt
 * most, so a type advantage feels like it matters, but it stays blind to status
 * moves and switching. A wild encounter should be beatable.
 */
export function pickFoeMove(battle) {
  // Memoise per turn so ordering and execution agree on the same choice.
  if (battle.foeChoiceTurn === battle.turn) return battle.foeChoice

  const foe = battle.foe.mon
  const playerTypes = species(battle.player.mon.species).types

  let bestIndex = 0
  let bestScore = -1

  foe.moves.forEach((slot, index) => {
    if (slot.pp <= 0) return
    const move = moveData(slot.move)
    const power = move.power ?? 40
    const score =
      move.damageClass === 'status'
        ? 15
        : (power * effectiveness(move.type, playerTypes) * (move.accuracy ?? 100)) / 100

    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })

  battle.foeChoiceTurn = battle.turn
  battle.foeChoice = bestIndex
  return bestIndex
}
