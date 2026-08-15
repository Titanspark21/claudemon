import {
  BALLS,
  CATCH_COMPLAINTS,
  CRIT_CHANCE,
  EFFECTIVENESS_MESSAGES,
  HIGH_CRIT_CHANCE,
  PARALYSIS_SKIP_CHANCE,
  POISON_FRACTIONS,
  RUN_ODDS,
  SLEEP_TURNS,
  SLEEP_WAKE_CHANCE,
  STAGE_LIMIT,
  STAT_LABELS,
  STATUS_LABELS,
  STRUGGLE,
  STRUGGLE_RECOIL_FRACTION,
  THAW_CHANCE,
  TRAINER_MESSAGES,
  TRAINER_REFUSALS,
  TURN_MESSAGES,
} from './constants.mjs'
import { refreshAbilityEffects } from './abilities.mjs'
import { moveHasFlag } from './abilityEffects.mjs'
import { move as moveData, species } from './data.mjs'
import { effectiveSpeed, moveSlotOf, stageMultiplier } from './battleActor.mjs'
import { createBattleField, normalizeBattleField } from './battleField.mjs'
import { applyDamage, applyHeal, label, other, say } from './battleEvents.mjs'
import { attemptCatch } from './capture.mjs'
import { computeDamage, FIXED_DAMAGE } from './damage.mjs'
import {
  expFromDefeating,
  expFromTrainerMon,
  moneyFromDefeating,
} from './exp.mjs'
import { decideOrder, pickFoeMove } from './foeAi.mjs'
import { runEffectPhase } from './effects.mjs'
import {
  applyMoveFieldEffect,
  moveExecutionFailure,
  rollMoveHits,
  runFieldEffectPhase,
  runMoveEffectPhase,
} from './moveEffects.mjs'
import {
  displayName,
  hpFraction,
  isFainted,
  isImmuneToAilment,
  levelOf,
} from './pokemon.mjs'
import { chance, makeRng, randInt } from './rng.mjs'
import { sentOutLine, trainerLabel, trainerPrize } from './trainer.mjs'
import { effectiveness, effectivenessMessage } from './typechart.mjs'
import {
  applyFlinch,
  applyVolatileAilment,
  blockedByVolatile,
  emptyVolatile,
  endOfTurnVolatile,
  isMoveDisabled,
  isTrapped,
  isVolatileAilment,
  statusLandedThisTurn,
} from './volatile.mjs'

export const emptyStages = () => {
  return {
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
  }
}

const refreshBattleEffects = (battle) => {
  refreshAbilityEffects(battle)
  return battle.effects
}

const runSwitchInEffects = (battle, side, events) => {
  runEffectPhase(battle, 'switchIn', { side, events })
  refreshBattleEffects(battle)
}

const initializeBattleEffects = (battle) => {
  const events = []

  refreshBattleEffects(battle)
  runEffectPhase(battle, 'battleStart', { events })
  runSwitchInEffects(battle, 'player', events)
  runSwitchInEffects(battle, 'foe', events)
  battle.pendingEvents = events

  return battle
}

export const createBattle = ({
  playerMon,
  wildMon,
  seed,
  participants = [],
  trainer = null,
}) => {
  const battle = {
    seed,
    rng: makeRng(seed),
    turn: 0,
    field: createBattleField(),
    effects: [],
    abilityState: {},
    pendingEvents: [],
    player: {
      mon: playerMon,
      stages: emptyStages(),
      volatile: emptyVolatile(),
    },
    foe: { mon: wildMon, stages: emptyStages(), volatile: emptyVolatile() },
    trainer,
    participants: [...new Set([...participants, playerMon])],
    over: false,
    outcome: null,
    rewards: { exp: 0, money: 0 },
    runAttempts: 0,
  }

  return initializeBattleEffects(battle)
}

export const switchIn = (battle, mon) => {
  const events = []
  const previous = battle.player?.mon

  if (previous && previous !== mon && !isFainted(previous))
    runEffectPhase(battle, 'switchOut', { side: 'player', events })

  battle.player.mon = mon
  battle.player.stages = emptyStages()
  battle.player.volatile = emptyVolatile()
  battle.abilityState ??= {}
  battle.abilityState.player = {}

  if (!battle.participants.includes(mon)) battle.participants.push(mon)

  refreshBattleEffects(battle)
  runSwitchInEffects(battle, 'player', events)
  battle.pendingEvents ??= []
  battle.pendingEvents.push(...events)

  return battle
}

export const sendOutAfterFaint = (battle, mon) => {
  battle.seed = (battle.seed + battle.turn + 1) >>> 0
  battle.rng = makeRng(battle.seed)
  battle.runAttempts = 0
  battle.over = false
  battle.outcome = null

  return switchIn(battle, mon)
}

export const rehydrate = (battle) => {
  if (!battle.rng) battle.rng = makeRng(battle.seed)

  battle.field = normalizeBattleField(battle.field)
  battle.effects ??= []
  battle.abilityState ??= {}
  battle.pendingEvents ??= []
  refreshBattleEffects(battle)

  return battle
}

const hasUsableMove = (actor) => {
  return actor.mon.moves.some(
    (slot, index) => slot.pp > 0 && !isMoveDisabled(actor, index),
  )
}

const blockedBySleep = (battle, side, events) => {
  const mon = battle[side].mon
  const who = label(battle, side)

  if (statusLandedThisTurn(battle[side], battle.turn)) {
    say(events, `${who} ${TURN_MESSAGES.fastAsleep}`)

    return true
  }

  if (mon.statusTurns <= 0 || chance(battle.rng, SLEEP_WAKE_CHANCE)) {
    mon.status = null
    mon.statusTurns = 0

    say(events, `${who} ${TURN_MESSAGES.wokeUp}`)

    return false
  }

  mon.statusTurns--

  say(events, `${who} ${TURN_MESSAGES.fastAsleep}`)

  return true
}

const blockedByFreeze = (battle, side, events) => {
  const mon = battle[side].mon
  const who = label(battle, side)

  if (
    !statusLandedThisTurn(battle[side], battle.turn) &&
    chance(battle.rng, THAW_CHANCE)
  ) {
    mon.status = null

    say(events, `${who} ${TURN_MESSAGES.thawedOut}`)

    return false
  }

  say(events, `${who} ${TURN_MESSAGES.frozenSolid}`)

  return true
}

const blockedByStatus = (battle, side, events) => {
  const mon = battle[side].mon

  if (mon.status === 'sleep') return blockedBySleep(battle, side, events)
  if (mon.status === 'freeze') return blockedByFreeze(battle, side, events)

  if (mon.status === 'paralysis' && chance(battle.rng, PARALYSIS_SKIP_CHANCE)) {
    say(events, `${label(battle, side)} ${TURN_MESSAGES.fullyParalysed}`)

    return true
  }

  return false
}

const landsHit = (battle, attackerSide, move, events) => {
  if (move.accuracy === null) return true

  const attacker = battle[attackerSide]
  const defender = battle[other(attackerSide)]
  const modifier =
    stageMultiplier(attacker.stages.accuracy) /
    stageMultiplier(defender.stages.evasion)
  const accuracy = runMoveEffectPhase(battle, 'modifyAccuracy', {
    attacker,
    defender,
    move,
    value: move.accuracy * modifier,
    events,
  })

  if (accuracy.cancelled) return false

  return battle.rng() * 100 < accuracy.value
}

const describeStatDelta = (delta) => {
  const sharply = Math.abs(delta) > 1

  if (delta < 0) return sharply ? 'sharply fell' : 'fell'

  return sharply ? 'rose sharply' : 'rose'
}

const applyStatChanges = (battle, attackerSide, move, events) => {
  for (const change of move.statChanges) {
    const side = change.change < 0 ? other(attackerSide) : attackerSide
    const actor = battle[side]
    const defenderSide = other(attackerSide)
    const adjusted = runMoveEffectPhase(battle, 'afterHit', {
      kind: 'stat-change',
      attacker: battle[attackerSide],
      defender: battle[defenderSide],
      targetSide: side,
      causeSide: attackerSide,
      stat: change.stat,
      move,
      value: change.change,
      events,
    })

    if (adjusted.cancelled) continue

    const delta = adjusted.value
    const current = actor.stages[change.stat]
    const next = Math.max(-STAGE_LIMIT, Math.min(STAGE_LIMIT, current + delta))
    const applied = next - current
    const who = label(battle, side)
    const statName = STAT_LABELS[change.stat] ?? change.stat

    if (next === current) {
      say(
        events,
        `${who}'s ${statName} won't go ${delta < 0 ? 'lower' : 'higher'}!`,
      )
      continue
    }

    actor.stages[change.stat] = next
    events.push({ type: 'stat', side, stat: change.stat, delta: applied })
    say(events, `${who}'s ${statName} ${describeStatDelta(applied)}!`)

    runMoveEffectPhase(battle, 'afterHit', {
      kind: 'stat-change-applied',
      attacker: battle[attackerSide],
      defender: battle[defenderSide],
      targetSide: side,
      causeSide: attackerSide,
      stat: change.stat,
      delta: applied,
      move,
      events,
    })
  }
}

const getAilmentRate = (move) => {
  if (move.damageClass === 'status') return move.ailmentChance || 100

  return move.ailmentChance || 0
}

const rollsAilment = (battle, move) => {
  const rate = getAilmentRate(move)

  if (rate <= 0) return false

  return chance(battle.rng, rate / 100)
}

const applyStatusAilment = (
  battle,
  attackerSide,
  defenderSide,
  move,
  events,
) => {
  const defender = battle[defenderSide]

  if (defender.mon.status) return
  if (!rollsAilment(battle, move)) return

  const status = runMoveEffectPhase(battle, 'tryStatus', {
    attacker: battle[attackerSide],
    defender,
    targetSide: defenderSide,
    causeSide: attackerSide,
    move,
    status: move.ailment,
    value: move.ailment,
    events,
  })

  if (status.cancelled) return

  const corrosion =
    battle[attackerSide]?.mon?.ability === 'corrosion' &&
    ['poison', 'badly-poisoned'].includes(status.value)
  if (!corrosion && isImmuneToAilment(defender.mon, status.value)) return

  defender.mon.status = status.value
  defender.mon.statusTurns =
    status.value === 'sleep'
      ? randInt(battle.rng, SLEEP_TURNS.min, SLEEP_TURNS.max)
      : 0
  defender.volatile.statusTurn = battle.turn

  events.push({ type: 'status', side: defenderSide, status: status.value })
  say(events, `${label(battle, defenderSide)} ${STATUS_LABELS[status.value]}!`)

  runMoveEffectPhase(battle, 'afterHit', {
    kind: 'status-applied',
    attacker: battle[attackerSide],
    defender,
    targetSide: defenderSide,
    causeSide: attackerSide,
    status: status.value,
    move,
    events,
  })
}

const applyAilment = (battle, attackerSide, move, events) => {
  if (!move.ailment) return

  const defenderSide = other(attackerSide)

  if (isVolatileAilment(move.ailment)) {
    if (!rollsAilment(battle, move)) return

    const attempted = runMoveEffectPhase(battle, 'tryStatus', {
      attacker: battle[attackerSide],
      defender: battle[defenderSide],
      targetSide: defenderSide,
      causeSide: attackerSide,
      move,
      status: move.ailment,
      value: move.ailment,
      events,
    })
    if (attempted.cancelled) return

    applyVolatileAilment(battle, defenderSide, move, events)
    return
  }

  if (!(move.ailment in STATUS_LABELS)) return

  applyStatusAilment(battle, attackerSide, defenderSide, move, events)
}

const doesNotAffect = (move, defenderTypes, events) => {
  if (effectiveness(move.type, defenderTypes) !== 0) return false

  say(events, EFFECTIVENESS_MESSAGES.immune)

  return true
}

const rollHitCount = (battle, move) => rollMoveHits(battle.rng, move)

const applyRecoil = (battle, attackerSide, amount, move, events) => {
  const defenderSide = other(attackerSide)
  const blocked = runMoveEffectPhase(battle, 'afterDamage', {
    kind: 'recoil',
    attacker: battle[attackerSide],
    defender: battle[defenderSide],
    attackerSide,
    defenderSide,
    move,
    value: amount,
    events,
  })
  if (blocked.cancelled) return 0

  const dealt = applyDamage(battle, attackerSide, amount, events)
  if (dealt)
    say(events, `${label(battle, attackerSide)} ${TURN_MESSAGES.recoil}`)
  return dealt
}

const applyDrain = (battle, attackerSide, drain, total, move, events) => {
  const amount = Math.max(1, Math.floor((total * Math.abs(drain)) / 100))

  if (drain < 0)
    return applyRecoil(battle, attackerSide, amount, move, events)

  const defenderSide = other(attackerSide)
  const reversed = runMoveEffectPhase(battle, 'afterDamage', {
    kind: 'drain',
    attacker: battle[attackerSide],
    defender: battle[defenderSide],
    attackerSide,
    defenderSide,
    move,
    value: amount,
    events,
  })
  if (reversed.cancelled) return 0

  const healed = applyHeal(battle, attackerSide, amount, events)
  if (healed)
    say(events, `${label(battle, defenderSide)} ${TURN_MESSAGES.energyDrained}`)
  return healed
}

const fixedDamageAmount = (battle, attackerSide, move) => {
  if (Number.isFinite(move.fixedDamage)) return move.fixedDamage
  if (move.fixedDamage === 'level') return levelOf(battle[attackerSide].mon)

  const resolve = FIXED_DAMAGE[move.key]

  if (!resolve) return null

  return resolve({
    attackerLevel: levelOf(battle[attackerSide].mon),
    defender: battle[other(attackerSide)].mon,
    rng: battle.rng,
  })
}

const useMove = (battle, attackerSide, moveIndex, events) => {
  const attacker = battle[attackerSide]
  const defenderSide = other(attackerSide)
  const defender = battle[defenderSide]

  if (blockedByStatus(battle, attackerSide, events)) return
  if (blockedByVolatile(battle, attackerSide, events)) return

  const slot = moveSlotOf(attacker, moveIndex)
  const disabled = slot != null && isMoveDisabled(attacker, moveIndex)

  let move

  if (slot && !disabled) {
    move = { ...moveData(slot.move), key: slot.move }
  } else if (moveIndex === null || !hasUsableMove(attacker)) {
    move = { ...STRUGGLE.data, key: STRUGGLE.move }
  } else if (disabled) {
    const who = label(battle, attackerSide)

    say(
      events,
      `${who}'s ${moveData(slot.move).name} ${TURN_MESSAGES.disabled}`,
    )
    return
  } else {
    say(events, TURN_MESSAGES.noPp)
    return
  }

  const before = runMoveEffectPhase(battle, 'beforeAction', {
    attacker,
    defender,
    side: attackerSide,
    move,
    moveIndex,
    slot,
    action: { type: 'move', index: moveIndex },
    events,
  })
  if (before.cancelled) return

  const priority = runMoveEffectPhase(battle, 'modifyPriority', {
    attacker,
    defender,
    move,
    value: move.priority ?? 0,
    events,
  })
  if (priority.cancelled) {
    say(events, TURN_MESSAGES.failed)
    return
  }

  if (slot) slot.pp--

  say(events, `${label(battle, attackerSide)} used ${move.name}!`)

  const failure = moveExecutionFailure(battle, attackerSide, move)

  if (failure) {
    say(events, TURN_MESSAGES.failed)
    say(events, failure)
    return
  }

  if (!landsHit(battle, attackerSide, move, events)) {
    say(events, `${label(battle, attackerSide)}'s attack missed!`)
    return
  }

  const fieldEvents = applyMoveFieldEffect(battle, attackerSide, move)

  if (fieldEvents.length > 0) {
    events.push(...fieldEvents)
    return
  }

  const moveType = runMoveEffectPhase(battle, 'modifyMoveType', {
    attacker,
    defender,
    move,
    value: move.type,
    events,
  })
  const typedMove = { ...move, type: moveType.value }
  const defenderTypes =
    defender.mon.battleTypes ?? species(defender.mon.species).types
  const typeMultiplier = effectiveness(typedMove.type, defenderTypes)
  const immunity = runMoveEffectPhase(battle, 'checkImmunity', {
    attacker,
    defender,
    move: typedMove,
    effectiveness: typeMultiplier,
    events,
  })

  if (immunity.cancelled) {
    say(events, EFFECTIVENESS_MESSAGES.immune)
    return
  }

  if (typedMove.damageClass === 'status') {
    applyStatChanges(battle, attackerSide, typedMove, events)
    applyAilment(battle, attackerSide, typedMove, events)

    if (typedMove.healing) {
      const healed = applyHeal(
        battle,
        attackerSide,
        Math.floor((attacker.mon.stats.hp * typedMove.healing) / 100),
        events,
      )

      if (healed > 0)
        say(events, `${label(battle, attackerSide)} regained health!`)
    }

    return
  }

  if (typedMove.ohko) {
    if (doesNotAffect(typedMove, defenderTypes, events)) return

    const protectedHit = runMoveEffectPhase(battle, 'modifyDamage', {
      attacker,
      defender,
      move: typedMove,
      value: defender.mon.hp,
      effectiveness: typeMultiplier,
      ohko: true,
      events,
    })
    if (protectedHit.cancelled || protectedHit.value <= 0) return

    const hpBefore = defender.mon.hp
    const dealt = applyDamage(battle, defenderSide, protectedHit.value, events)
    say(events, TURN_MESSAGES.oneHitKo)
    battle.lastHit = {
      attackerSide,
      defenderSide,
      move: typedMove,
      contact: false,
      lastDamage: dealt,
      hpBefore,
    }
    return
  }

  const fixedDamage = fixedDamageAmount(battle, attackerSide, typedMove)

  if (fixedDamage !== null) {
    if (doesNotAffect(typedMove, defenderTypes, events)) return

    const hpBefore = defender.mon.hp
    const dealt = applyDamage(battle, defenderSide, fixedDamage, events)
    const contact = moveHasFlag(typedMove, 'contact')
    runMoveEffectPhase(battle, 'afterDamage', {
      attacker,
      defender,
      attackerSide,
      defenderSide,
      move: typedMove,
      damage: dealt,
      hpBefore,
      contact,
      events,
    })
    battle.lastHit = {
      attackerSide,
      defenderSide,
      move: typedMove,
      contact,
      lastDamage: dealt,
      hpBefore,
    }
    return
  }

  const movePower = runMoveEffectPhase(battle, 'modifyPower', {
    attacker,
    defender,
    move: typedMove,
    value: typedMove.power,
    events,
  })
  const resolvedMove = { ...typedMove, power: movePower.value }

  const critStage = runMoveEffectPhase(battle, 'beforeAction', {
    kind: 'critical-stage',
    attacker,
    defender,
    move: resolvedMove,
    value: resolvedMove.critRate ?? 0,
    events,
  }).value
  const critChance = critStage > 0 ? HIGH_CRIT_CHANCE : CRIT_CHANCE
  const isCrit = chance(battle.rng, critChance)
  const computed = computeDamage(battle, attackerSide, resolvedMove, isCrit)
  const multiplier = computed.multiplier

  if (multiplier === 0) {
    say(events, EFFECTIVENESS_MESSAGES.immune)
    return
  }

  const attackerTypes =
    attacker.mon.battleTypes ?? species(attacker.mon.species).types
  let hits = rollHitCount(battle, resolvedMove)
  const hitOverride = runMoveEffectPhase(battle, 'beforeAction', {
    kind: 'hit-count',
    attacker,
    defender,
    move: resolvedMove,
    value: hits,
    events,
  })
  if (Number.isFinite(hitOverride.value)) hits = hitOverride.value

  const contact = moveHasFlag(resolvedMove, 'contact')
  let total = 0
  let landedHits = 0

  for (let hit = 0; hit < hits; hit++) {
    if (isFainted(defender.mon) || isFainted(attacker.mon)) break

    const hitDamage = runMoveEffectPhase(battle, 'modifyDamage', {
      attacker,
      defender,
      move: resolvedMove,
      value: computed.damage,
      critical: isCrit,
      effectiveness: multiplier,
      stab: attackerTypes.includes(resolvedMove.type),
      contact,
      hitIndex: hit,
      burnApplied:
        attacker.mon.status === 'burn' &&
        resolvedMove.damageClass === 'physical',
      events,
    })
    if (hitDamage.cancelled || hitDamage.value <= 0) break

    const hpBefore = defender.mon.hp
    const dealt = applyDamage(
      battle,
      defenderSide,
      Math.max(1, Math.floor(hitDamage.value)),
      events,
    )
    total += dealt
    landedHits++

    const reaction = runMoveEffectPhase(battle, 'afterDamage', {
      attacker,
      defender,
      attackerSide,
      defenderSide,
      move: resolvedMove,
      damage: dealt,
      hpBefore,
      contact,
      hitIndex: hit,
      critical: isCrit,
      effectiveness: multiplier,
      events,
    })
    if (reaction.replacement) battle.pendingReplacement = reaction.replacement

    battle.lastHit = {
      attackerSide,
      defenderSide,
      move: resolvedMove,
      contact,
      lastDamage: dealt,
      hpBefore,
      critical: isCrit,
    }
  }

  if (isCrit) say(events, TURN_MESSAGES.criticalHit)

  const note = effectivenessMessage(multiplier)

  if (note) say(events, note)
  if (landedHits > 1) say(events, `Hit ${landedHits} times!`)

  if (resolvedMove.drain && total > 0)
    applyDrain(
      battle,
      attackerSide,
      resolvedMove.drain,
      total,
      resolvedMove,
      events,
    )

  if (resolvedMove.key === STRUGGLE.move && total > 0)
    applyRecoil(
      battle,
      attackerSide,
      Math.max(1, Math.floor(total / STRUGGLE_RECOIL_FRACTION)),
      resolvedMove,
      events,
    )

  if (!isFainted(defender.mon)) {
    const secondary = runMoveEffectPhase(battle, 'afterHit', {
      kind: 'secondary-effect',
      attacker,
      defender,
      targetSide: defenderSide,
      causeSide: attackerSide,
      move: resolvedMove,
      events,
    })

    if (!secondary.cancelled) {
      applyAilment(battle, attackerSide, resolvedMove, events)
      applyStatChanges(battle, attackerSide, resolvedMove, events)

      const flinch = runMoveEffectPhase(battle, 'tryStatus', {
        attacker,
        defender,
        targetSide: defenderSide,
        causeSide: attackerSide,
        move: resolvedMove,
        status: 'flinch',
        value: 'flinch',
        events,
      })
      if (!flinch.cancelled) applyFlinch(battle, defenderSide, resolvedMove)
    }
  }
}

const endOfTurnDamage = (battle, side, events) => {
  const mon = battle[side].mon

  if (isFainted(mon)) return

  const fraction = POISON_FRACTIONS[mon.status]

  if (!fraction) return

  applyDamage(battle, side, hpFraction(mon, fraction), events)
  say(events, `${label(battle, side)} is hurt by its ${mon.status}!`)
}

const finish = (battle, outcome, events) => {
  battle.over = true
  battle.outcome = outcome

  events.push({ type: 'end', outcome })
}

const collectFoeExp = (battle) => {
  const foe = battle.foe.mon

  battle.rewards.exp += battle.trainer
    ? expFromTrainerMon(foe.species, levelOf(foe))
    : expFromDefeating(foe.species, levelOf(foe))
}

const awardVictory = (battle, events) => {
  if (battle.trainer) {
    battle.rewards.money += trainerPrize(battle.trainer)

    say(events, `${trainerLabel(battle.trainer)} ${TRAINER_MESSAGES.defeated}`)

    return
  }

  battle.rewards.money += moneyFromDefeating(
    levelOf(battle.foe.mon),
    battle.rng,
  )
}

const nextFoe = (battle) => {
  if (!battle.trainer) return null

  return battle.trainer.team.find((mon) => !isFainted(mon)) ?? null
}

const sendNextFoe = (battle, mon, events) => {
  battle.foe = { mon, stages: emptyStages(), volatile: emptyVolatile() }

  say(events, sentOutLine(battle.trainer, mon))
  events.push({ type: 'foe-out', mon, hpAfter: mon.hp })
}

const checkFaint = (battle, events) => {
  const fainted = ['foe', 'player'].filter((side) =>
    isFainted(battle[side].mon),
  )

  if (!fainted.length) return false

  for (const side of fainted) {
    events.push({ type: 'faint', side })
    say(events, `${label(battle, side)} fainted!`)
  }

  if (!fainted.includes('foe')) {
    finish(battle, 'loss', events)

    return true
  }

  collectFoeExp(battle)

  const next = nextFoe(battle)

  if (!next) {
    awardVictory(battle, events)
    finish(battle, 'win', events)

    return true
  }

  sendNextFoe(battle, next, events)

  if (fainted.includes('player')) finish(battle, 'loss', events)

  return true
}

const runOdds = (battle) => {
  const playerSpeed = effectiveSpeed(battle.player)
  const foeSpeed = effectiveSpeed(battle.foe)

  if (playerSpeed >= foeSpeed) return 1

  return Math.min(
    RUN_ODDS.max,
    (playerSpeed / foeSpeed) * RUN_ODDS.speedFactor +
      battle.runAttempts * RUN_ODDS.perAttempt,
  )
}

const attemptRun = (battle, events) => {
  if (isTrapped(battle.player)) {
    say(events, TURN_MESSAGES.cantEscape)

    return false
  }

  battle.runAttempts++

  if (!chance(battle.rng, runOdds(battle))) {
    say(events, TURN_MESSAGES.stuck)

    return false
  }

  say(events, TURN_MESSAGES.gotAway)
  finish(battle, 'fled', events)

  return true
}

const trainerRefusal = (battle, action) => {
  if (!battle.trainer) return null

  return TRAINER_REFUSALS[action.type] ?? null
}

export const submitAction = (battle, action) => {
  const events = []

  if (battle.over) return events

  const refused = trainerRefusal(battle, action)

  if (refused) {
    say(events, refused)

    return events
  }

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

    say(events, CATCH_COMPLAINTS[result.shakes])
  } else if (action.type === 'run') {
    if (attemptRun(battle, events)) return events
  } else if (action.type === 'move') {
    const foeMoveIndex = pickFoeMove(battle)

    if (decideOrder(battle, action.index, foeMoveIndex)) {
      useMove(battle, 'player', action.index, events)

      if (checkFaint(battle, events)) return events

      useMove(battle, 'foe', foeMoveIndex, events)
    } else {
      useMove(battle, 'foe', foeMoveIndex, events)

      if (checkFaint(battle, events)) return events

      useMove(battle, 'player', action.index, events)
    }

    if (checkFaint(battle, events)) return events
  }

  if (action.type !== 'move') {
    useMove(battle, 'foe', pickFoeMove(battle), events)

    if (checkFaint(battle, events)) return events
  }

  for (const side of ['player', 'foe']) {
    endOfTurnDamage(battle, side, events)
    endOfTurnVolatile(battle, side, events)
  }

  runFieldEffectPhase(battle, 'endTurn', events)
  checkFaint(battle, events)

  return events
}
