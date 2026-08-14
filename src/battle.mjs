import {
  BALLS,
  CATCH_COMPLAINTS,
  CRIT_CHANCE,
  EFFECTIVENESS_MESSAGES,
  HIGH_CRIT_CHANCE,
  OHKO_MOVES,
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
  UNSUPPORTED_MOVES,
} from './constants.mjs'
import { refreshAbilityEffects } from './abilities.mjs'
import { moveHasFlag, weatherIsSuppressed } from './abilityEffects.mjs'
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
import { registerEffect, runEffectPhase } from './effects.mjs'
import {
  displayName,
  hpFraction,
  isFainted,
  isImmuneToAilment,
  levelOf,
} from './pokemon.mjs'
import { chance, makeRng, randInt } from './rng.mjs'
import { sentOutLine, trainerLabel, trainerPrize } from './trainer.mjs'
import { fieldHandlers } from './terrain.mjs'
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
  battle.effects ??= []
  battle.effects = battle.effects.filter(
    (entry) => !['weather', 'terrain', 'field'].includes(entry.sourceType),
  )

  refreshAbilityEffects(battle)

  for (const handler of fieldHandlers(battle.field)) {
    if (weatherIsSuppressed(battle) && handler.sourceType === 'weather')
      continue
    registerEffect(battle.effects, handler)
  }

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

  const defenderSide = other(attackerSide)
  const attacker = battle[attackerSide]
  const defender = battle[defenderSide]
  const modifier =
    stageMultiplier(attacker.stages.accuracy) /
    stageMultiplier(defender.stages.evasion)
  const adjusted = runEffectPhase(battle, 'modifyAccuracy', {
    attacker: attackerSide,
    defender: defenderSide,
    move,
    value: move.accuracy * modifier,
    events,
  })

  if (adjusted.cancelled) return false

  return battle.rng() * 100 < adjusted.value
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
    const adjusted = runEffectPhase(battle, 'afterHit', {
      kind: 'stat-change',
      attacker: attackerSide,
      defender: other(attackerSide),
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

    runEffectPhase(battle, 'afterHit', {
      kind: 'stat-change-applied',
      attacker: attackerSide,
      defender: other(attackerSide),
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

  const attempted = runEffectPhase(battle, 'tryStatus', {
    attacker: attackerSide,
    defender: defenderSide,
    targetSide: defenderSide,
    move,
    status: move.ailment,
    value: move.ailment,
    events,
  })
  if (attempted.cancelled) return

  const corrosion =
    battle[attackerSide]?.mon?.ability === 'corrosion' &&
    ['poison', 'badly-poisoned'].includes(move.ailment)
  if (!corrosion && isImmuneToAilment(defender.mon, move.ailment)) return

  defender.mon.status = move.ailment
  defender.mon.statusTurns =
    move.ailment === 'sleep'
      ? randInt(battle.rng, SLEEP_TURNS.min, SLEEP_TURNS.max)
      : 0
  defender.volatile.statusTurn = battle.turn

  events.push({ type: 'status', side: defenderSide, status: move.ailment })
  say(events, `${label(battle, defenderSide)} ${STATUS_LABELS[move.ailment]}!`)

  runEffectPhase(battle, 'afterHit', {
    kind: 'status-applied',
    attacker: attackerSide,
    defender: defenderSide,
    targetSide: defenderSide,
    causeSide: attackerSide,
    status: move.ailment,
    move,
    events,
  })
}

const applyAilment = (battle, attackerSide, move, events) => {
  if (!move.ailment) return

  const defenderSide = other(attackerSide)

  if (isVolatileAilment(move.ailment)) {
    if (!rollsAilment(battle, move)) return

    const attempted = runEffectPhase(battle, 'tryStatus', {
      attacker: attackerSide,
      defender: defenderSide,
      targetSide: defenderSide,
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

const rollHitCount = (battle, move) => {
  if (!move.maxHits) return 1

  return randInt(battle.rng, move.minHits ?? move.maxHits, move.maxHits)
}

const applyRecoil = (battle, attackerSide, amount, move, events) => {
  const blocked = runEffectPhase(battle, 'afterDamage', {
    kind: 'recoil',
    attacker: attackerSide,
    defender: other(attackerSide),
    attackerSide,
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

  if (drain < 0) return applyRecoil(battle, attackerSide, amount, move, events)

  const defenderSide = other(attackerSide)
  const reversed = runEffectPhase(battle, 'afterDamage', {
    kind: 'drain',
    attacker: attackerSide,
    defender: defenderSide,
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

const useMove = (battle, attackerSide, moveIndex, events) => {
  const attacker = battle[attackerSide]
  const defenderSide = other(attackerSide)

  if (blockedByStatus(battle, attackerSide, events)) return
  if (blockedByVolatile(battle, attackerSide, events)) return

  const slot = moveSlotOf(attacker, moveIndex)
  const disabled = slot != null && isMoveDisabled(attacker, moveIndex)

  let move

  if (slot && !disabled) {
    move = { ...moveData(slot.move), key: slot.move }
  } else if (!hasUsableMove(attacker)) {
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

  const before = runEffectPhase(battle, 'beforeAction', {
    attacker: attackerSide,
    defender: defenderSide,
    side: attackerSide,
    move,
    moveIndex,
    slot,
    action: { type: 'move', index: moveIndex },
    events,
  })
  if (before.cancelled) return

  const priority = runEffectPhase(battle, 'modifyPriority', {
    attacker: attackerSide,
    defender: defenderSide,
    move,
    value: move.priority ?? 0,
    events,
  })
  if (priority.cancelled) {
    say(events, TURN_MESSAGES.failed)
    return
  }

  if (slot) slot.pp--

  const changedType = runEffectPhase(battle, 'modifyMoveType', {
    attacker: attackerSide,
    defender: defenderSide,
    move,
    value: move.type,
    events,
  })
  if (typeof changedType.value === 'string')
    move = { ...move, type: changedType.value }

  if (move.power != null) {
    const changedPower = runEffectPhase(battle, 'modifyPower', {
      attacker: attackerSide,
      defender: defenderSide,
      move,
      value: move.power,
      events,
    })
    if (Number.isFinite(changedPower.value))
      move = { ...move, power: changedPower.value }
  }

  say(events, `${label(battle, attackerSide)} used ${move.name}!`)

  if (UNSUPPORTED_MOVES.has(move.key)) {
    say(events, TURN_MESSAGES.failed)
    return
  }

  if (!landsHit(battle, attackerSide, move, events)) {
    say(events, `${label(battle, attackerSide)}'s attack missed!`)
    return
  }

  const defenderTypes =
    battle[defenderSide].mon.battleTypes ??
    species(battle[defenderSide].mon.species).types
  const typeMultiplier = effectiveness(move.type, defenderTypes)
  const immunity = runEffectPhase(battle, 'checkImmunity', {
    attacker: attackerSide,
    defender: defenderSide,
    move,
    effectiveness: typeMultiplier,
    events,
  })
  if (immunity.cancelled) {
    say(events, EFFECTIVENESS_MESSAGES.immune)
    return
  }

  if (move.damageClass === 'status') {
    applyStatChanges(battle, attackerSide, move, events)
    applyAilment(battle, attackerSide, move, events)

    if (move.healing) {
      const healed = applyHeal(
        battle,
        attackerSide,
        Math.floor((attacker.mon.stats.hp * move.healing) / 100),
        events,
      )

      if (healed > 0)
        say(events, `${label(battle, attackerSide)} regained health!`)
    }

    return
  }

  if (OHKO_MOVES.has(move.key)) {
    if (doesNotAffect(move, defenderTypes, events)) return

    const protectedHit = runEffectPhase(battle, 'modifyDamage', {
      attacker: attackerSide,
      defender: defenderSide,
      move,
      value: battle[defenderSide].mon.hp,
      effectiveness: typeMultiplier,
      ohko: true,
      events,
    })
    if (protectedHit.cancelled || protectedHit.value <= 0) return

    applyDamage(battle, defenderSide, protectedHit.value, events)
    say(events, TURN_MESSAGES.oneHitKo)
    battle.lastHit = {
      attackerSide,
      defenderSide,
      move,
      contact: false,
      lastDamage: protectedHit.value,
    }
    return
  }

  if (FIXED_DAMAGE[move.key]) {
    if (doesNotAffect(move, defenderTypes, events)) return

    const amount = FIXED_DAMAGE[move.key]({
      attackerLevel: levelOf(attacker.mon),
      defender: battle[defenderSide].mon,
      rng: battle.rng,
    })

    const hpBefore = battle[defenderSide].mon.hp
    const dealt = applyDamage(battle, defenderSide, amount, events)
    runEffectPhase(battle, 'afterDamage', {
      attacker: attackerSide,
      defender: defenderSide,
      move,
      damage: dealt,
      hpBefore,
      contact: moveHasFlag(move, 'contact'),
      events,
    })
    battle.lastHit = {
      attackerSide,
      defenderSide,
      move,
      contact: moveHasFlag(move, 'contact'),
      lastDamage: dealt,
      hpBefore,
    }
    return
  }

  const critStage = runEffectPhase(battle, 'beforeAction', {
    kind: 'critical-stage',
    attacker: attackerSide,
    defender: defenderSide,
    move,
    value: move.critRate ?? 0,
    events,
  }).value
  const critChance = critStage > 0 ? HIGH_CRIT_CHANCE : CRIT_CHANCE
  const isCrit = chance(battle.rng, critChance)
  const raw = computeDamage(battle, attackerSide, move, isCrit)

  if (raw.multiplier === 0) {
    say(events, EFFECTIVENESS_MESSAGES.immune)
    return
  }

  const attackerTypes =
    attacker.mon.battleTypes ?? species(attacker.mon.species).types
  let hits = rollHitCount(battle, move)
  const hitOverride = runEffectPhase(battle, 'beforeAction', {
    kind: 'hit-count',
    attacker: attackerSide,
    defender: defenderSide,
    move,
    value: hits,
    events,
  })
  if (Number.isFinite(hitOverride.value)) hits = hitOverride.value

  const contact = moveHasFlag(move, 'contact')
  let total = 0
  let landedHits = 0

  for (let hit = 0; hit < hits; hit++) {
    if (isFainted(battle[defenderSide].mon) || isFainted(attacker.mon)) break

    const hitDamage = runEffectPhase(battle, 'modifyDamage', {
      attacker: attackerSide,
      defender: defenderSide,
      move,
      value: raw.damage,
      critical: isCrit,
      effectiveness: raw.multiplier,
      stab: attackerTypes.includes(move.type),
      contact,
      hitIndex: hit,
      events,
    })
    if (hitDamage.cancelled || hitDamage.value <= 0) break

    const hpBefore = battle[defenderSide].mon.hp
    const dealt = applyDamage(
      battle,
      defenderSide,
      Math.max(1, Math.floor(hitDamage.value)),
      events,
    )
    total += dealt
    landedHits++

    const reaction = runEffectPhase(battle, 'afterDamage', {
      attacker: attackerSide,
      defender: defenderSide,
      attackerSide,
      defenderSide,
      move,
      damage: dealt,
      hpBefore,
      contact,
      hitIndex: hit,
      critical: isCrit,
      effectiveness: raw.multiplier,
      events,
    })
    if (reaction.replacement) battle.pendingReplacement = reaction.replacement

    battle.lastHit = {
      attackerSide,
      defenderSide,
      move,
      contact,
      lastDamage: dealt,
      hpBefore,
      critical: isCrit,
    }
  }

  if (isCrit) say(events, TURN_MESSAGES.criticalHit)

  const note = effectivenessMessage(raw.multiplier)

  if (note) say(events, note)
  if (landedHits > 1) say(events, `Hit ${landedHits} times!`)

  if (move.drain && total > 0)
    applyDrain(battle, attackerSide, move.drain, total, move, events)

  if (move.key === STRUGGLE.move && total > 0)
    applyRecoil(
      battle,
      attackerSide,
      Math.max(1, Math.floor(total / STRUGGLE_RECOIL_FRACTION)),
      move,
      events,
    )

  if (!isFainted(battle[defenderSide].mon)) {
    const secondary = runEffectPhase(battle, 'afterHit', {
      kind: 'secondary-effect',
      attacker: attackerSide,
      defender: defenderSide,
      targetSide: defenderSide,
      causeSide: attackerSide,
      move,
      events,
    })

    if (!secondary.cancelled) {
      applyAilment(battle, attackerSide, move, events)
      applyStatChanges(battle, attackerSide, move, events)

      const flinch = runEffectPhase(battle, 'tryStatus', {
        attacker: attackerSide,
        defender: defenderSide,
        targetSide: defenderSide,
        move,
        status: 'flinch',
        value: 'flinch',
        events,
      })
      if (!flinch.cancelled) applyFlinch(battle, defenderSide, move)
    }
  }
}

const endOfTurnDamage = (battle, side, events) => {
  const mon = battle[side].mon

  if (isFainted(mon)) return

  const fraction = POISON_FRACTIONS[mon.status]

  if (!fraction) return

  const adjusted = runEffectPhase(battle, 'modifyDamage', {
    defender: side,
    value: hpFraction(mon, fraction),
    indirect: true,
    cause: mon.status,
    events,
  })
  if (adjusted.cancelled || adjusted.value <= 0) return

  applyDamage(battle, side, Math.max(1, Math.floor(adjusted.value)), events)
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
  battle.abilityState ??= {}
  battle.abilityState.foe = {}
  refreshBattleEffects(battle)

  say(events, sentOutLine(battle.trainer, mon))
  events.push({ type: 'foe-out', mon, hpAfter: mon.hp })
  runSwitchInEffects(battle, 'foe', events)
}

const checkFaint = (battle, events) => {
  const fainted = []

  for (;;) {
    const nextFainted = ['foe', 'player'].filter(
      (side) => isFainted(battle[side].mon) && !fainted.includes(side),
    )
    if (!nextFainted.length) break

    for (const side of nextFainted) {
      fainted.push(side)
      events.push({ type: 'faint', side })
      say(events, `${label(battle, side)} fainted!`)

      const hit = battle.lastHit
      const causedBy = hit?.defenderSide === side ? hit.attackerSide : null
      runEffectPhase(battle, 'faint', {
        attacker: hit?.attackerSide ?? null,
        defender: hit?.defenderSide ?? null,
        attackerSide: hit?.attackerSide ?? null,
        faintedSide: side,
        causedBy,
        move: hit?.move ?? null,
        contact: hit?.contact ?? false,
        lastDamage: hit?.lastDamage ?? 0,
        hpBefore: hit?.hpBefore ?? 0,
        critical: hit?.critical ?? false,
        events,
      })
    }
  }

  if (!fainted.length) return false

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
  const abilityEscape = runEffectPhase(battle, 'beforeAction', {
    attacker: 'player',
    defender: 'foe',
    side: 'player',
    action: { type: 'run' },
    events,
  })

  if (abilityEscape.cancelled || isTrapped(battle.player)) {
    say(events, TURN_MESSAGES.cantEscape)
    return false
  }

  battle.runAttempts++

  if (abilityEscape.value !== 1 && !chance(battle.rng, runOdds(battle))) {
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
  if (battle.pendingEvents?.length) {
    events.push(...battle.pendingEvents)
    battle.pendingEvents = []
  }
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

  runEffectPhase(battle, 'endTurn', { events })

  for (const side of ['player', 'foe']) {
    endOfTurnDamage(battle, side, events)
    endOfTurnVolatile(battle, side, events)
  }

  checkFaint(battle, events)

  return events
}
