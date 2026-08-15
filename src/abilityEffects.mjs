import { applyDamage, applyHeal, other } from './battleEvents.mjs'
import { species } from './data.mjs'
import { chance, pick } from './rng.mjs'
import { startTerrain } from './terrain.mjs'
import { battleSideOf, effectiveness, isGrounded } from './typechart.mjs'
import { startWeather } from './weather.mjs'

const STAGE_LIMIT = 6
const LOW_HP_FRACTION = 1 / 3

const SOUND_MOVES = new Set([
  'boomburst',
  'bug-buzz',
  'chatter',
  'clangorous-soulblaze',
  'disarming-voice',
  'echoed-voice',
  'growl',
  'heal-bell',
  'hyper-voice',
  'noble-roar',
  'parting-shot',
  'perish-song',
  'relic-song',
  'roar',
  'round',
  'screech',
  'sing',
  'snarl',
  'snore',
  'sparkling-aria',
  'supersonic',
  'uproar',
])

const BULLET_MOVES = new Set([
  'acid-spray',
  'aura-sphere',
  'barrage',
  'bullet-seed',
  'egg-bomb',
  'electro-ball',
  'energy-ball',
  'focus-blast',
  'gyro-ball',
  'ice-ball',
  'magnet-bomb',
  'mist-ball',
  'mud-bomb',
  'octazooka',
  'rock-blast',
  'seed-bomb',
  'shadow-ball',
  'sludge-bomb',
  'weather-ball',
])

const PUNCH_MOVES = new Set([
  'bullet-punch',
  'comet-punch',
  'dizzy-punch',
  'drain-punch',
  'dynamic-punch',
  'fire-punch',
  'focus-punch',
  'hammer-arm',
  'ice-hammer',
  'ice-punch',
  'mach-punch',
  'mega-punch',
  'plasma-fists',
  'power-up-punch',
  'shadow-punch',
  'sky-uppercut',
  'thunder-punch',
])

const BITE_MOVES = new Set([
  'bite',
  'crunch',
  'fire-fang',
  'hyper-fang',
  'ice-fang',
  'poison-fang',
  'psychic-fangs',
  'thunder-fang',
])

const PULSE_MOVES = new Set([
  'aura-sphere',
  'dark-pulse',
  'dragon-pulse',
  'heal-pulse',
  'origin-pulse',
  'water-pulse',
])

const POWDER_MOVES = new Set([
  'cotton-spore',
  'poison-powder',
  'powder',
  'rage-powder',
  'sleep-powder',
  'spore',
  'stun-spore',
])

const RECOIL_MOVES = new Set([
  'brave-bird',
  'double-edge',
  'flare-blitz',
  'head-charge',
  'head-smash',
  'submission',
  'take-down',
  'wild-charge',
  'wood-hammer',
])

const HEALING_MOVES = new Set([
  'floral-healing',
  'heal-order',
  'heal-pulse',
  'healing-wish',
  'lunar-dance',
  'milk-drink',
  'moonlight',
  'morning-sun',
  'recover',
  'rest',
  'roost',
  'shore-up',
  'slack-off',
  'soft-boiled',
  'strength-sap',
  'synthesis',
  'wish',
])

const CONTACT_FALLBACK = new Set([
  'bite',
  'body-slam',
  'brick-break',
  'crunch',
  'double-edge',
  'drain-punch',
  'fire-fang',
  'fire-punch',
  'flare-blitz',
  'headbutt',
  'ice-fang',
  'ice-punch',
  'iron-head',
  'knock-off',
  'leaf-blade',
  'liquidation',
  'nuzzle',
  'play-rough',
  'poison-jab',
  'psychic-fangs',
  'scratch',
  'shadow-claw',
  'tackle',
  'thunder-fang',
  'thunder-punch',
  'wild-charge',
  'x-scissor',
  'zen-headbutt',
])

const WEATHER_ABILITIES = {
  drizzle: 'rain',
  drought: 'sun',
  sandstream: 'sandstorm',
  snowwarning: 'hail',
}

const TERRAIN_ABILITIES = {
  electricsurge: 'electric',
  grassysurge: 'grassy',
  mistysurge: 'misty',
  psychicsurge: 'psychic',
}

const STATUS_IMMUNITIES = {
  immunity: new Set(['poison', 'badly-poisoned']),
  insomnia: new Set(['sleep']),
  vitalspirit: new Set(['sleep']),
  sweetveil: new Set(['sleep']),
  limber: new Set(['paralysis']),
  magmaarmor: new Set(['freeze']),
  waterveil: new Set(['burn']),
  waterbubble: new Set(['burn']),
  comatose: new Set([
    'burn',
    'freeze',
    'paralysis',
    'poison',
    'badly-poisoned',
    'sleep',
  ]),
  innerfocus: new Set(['flinch']),
  owntempo: new Set(['confusion']),
  oblivious: new Set(['infatuation', 'taunt']),
}

const TYPE_CONVERTERS = {
  aerilate: { from: 'normal', to: 'flying', multiplier: 1.2 },
  galvanize: { from: 'normal', to: 'electric', multiplier: 1.2 },
  pixilate: { from: 'normal', to: 'fairy', multiplier: 1.2 },
  refrigerate: { from: 'normal', to: 'ice', multiplier: 1.2 },
  normalize: { from: null, to: 'normal', multiplier: 1.2 },
}

const WEATHER_SPEED = {
  chlorophyll: 'sun',
  swiftswim: 'rain',
  sandrush: 'sandstorm',
  slushrush: 'hail',
}

const THRESHOLD_BOOSTS = {
  blaze: 'fire',
  overgrow: 'grass',
  swarm: 'bug',
  torrent: 'water',
}

const SUPER_EFFECTIVE_REDUCERS = new Set(['filter', 'solidrock', 'prismarmor'])
const FULL_HP_REDUCERS = new Set(['multiscale', 'shadowshield'])
const WEATHER_SUPPRESSORS = new Set(['airlock', 'cloudnine'])
const CRIT_IMMUNITIES = new Set(['battlearmor', 'shellarmor'])
const STAT_DROP_BLOCKERS = new Set(['clearbody', 'fullmetalbody', 'whitesmoke'])
const MOLD_BREAKERS = new Set(['moldbreaker', 'teravolt', 'turboblaze'])

const flagLookup = (move, flag) => {
  const flags = move?.flags
  if (!flags) return false
  if (flags instanceof Set) return flags.has(flag)
  if (Array.isArray(flags)) return flags.includes(flag)
  return Boolean(flags[flag])
}

export const moveHasFlag = (move, flag) => {
  if (flagLookup(move, flag)) return true

  const key = move?.key ?? move?.id
  if (!key) return false

  if (flag === 'sound') return SOUND_MOVES.has(key)
  if (flag === 'bullet') return BULLET_MOVES.has(key)
  if (flag === 'punch') return PUNCH_MOVES.has(key)
  if (flag === 'bite') return BITE_MOVES.has(key)
  if (flag === 'pulse') return PULSE_MOVES.has(key)
  if (flag === 'powder') return POWDER_MOVES.has(key)
  if (flag === 'recoil') return RECOIL_MOVES.has(key) || Number(move?.drain) < 0
  if (flag === 'heal')
    return HEALING_MOVES.has(key) || Number(move?.healing) > 0
  if (flag === 'contact') return CONTACT_FALLBACK.has(key)

  return false
}

export const emitAbilityReveal = (events, side, ability, cause) => {
  if (!Array.isArray(events)) return
  if (
    events.some(
      (event) =>
        event.type === 'ability' &&
        event.side === side &&
        event.ability === ability &&
        event.cause === cause,
    )
  )
    return

  events.push({ type: 'ability', side, ability, cause })
}

const effect = (phase, family, handler, priority = 0) => ({
  phase,
  priority,
  family,
  handler,
})

const sourceSide = (state) => state.source?.side ?? null
const sourceAbility = (state) => state.source?.key ?? null
const sourceActor = (state) => state.battle?.[sourceSide(state)] ?? null
const sourceMon = (state) => sourceActor(state)?.mon ?? null

const sideOf = (state, actor) => battleSideOf(state.battle, actor)
const attackerSide = (state) => sideOf(state, state.attacker)
const defenderSide = (state) => sideOf(state, state.defender)

const ownAttack = (state) => attackerSide(state) === sourceSide(state)
const ownDefense = (state) => defenderSide(state) === sourceSide(state)

const maxHp = (mon) => mon?.stats?.hp ?? 1
const hpRatio = (mon) => (mon ? mon.hp / maxHp(mon) : 0)
const weather = (state) =>
  WEATHER_SUPPRESSORS.has(state.battle?.player?.mon?.ability) ||
  WEATHER_SUPPRESSORS.has(state.battle?.foe?.mon?.ability)
    ? null
    : (state.field?.weather?.key ?? null)
const terrain = (state) => state.field?.terrain?.key ?? null

const typesOf = (mon) => mon?.battleTypes ?? species(mon.species).types

const setBattleTypes = (mon, types) => {
  mon.battleTypes = [...new Set(types)]
}

const activeAbility = (battle, ability) => {
  return ['player', 'foe'].some((side) => {
    const actor = battle?.[side]
    return actor?.mon?.hp > 0 && actor.mon.ability === ability
  })
}

const abilityState = (battle, side) => {
  battle.abilityState ??= {}
  battle.abilityState[side] ??= {}
  return battle.abilityState[side]
}

const random = (battle) => battle.rng

const applyStage = (state, side, stat, delta, cause = sourceAbility(state)) => {
  const actor = state.battle?.[side]
  if (!actor || !actor.stages || !Number.isFinite(delta)) return 0

  const before = actor.stages[stat] ?? 0
  const after = Math.max(-STAGE_LIMIT, Math.min(STAGE_LIMIT, before + delta))
  const applied = after - before

  if (!applied) return 0

  actor.stages[stat] = after
  state.events.push({ type: 'stat', side, stat, delta: applied, cause })
  return applied
}

const cureStatus = (state, side, cause = sourceAbility(state)) => {
  const mon = state.battle?.[side]?.mon
  if (!mon?.status) return false

  const status = mon.status
  mon.status = null
  mon.statusTurns = 0
  state.events.push({ type: 'status-cure', side, status, cause })
  return true
}

const inflictStatus = (state, side, status, cause) => {
  const mon = state.battle?.[side]?.mon
  if (!mon || mon.status) return false

  const immunity = STATUS_IMMUNITIES[mon.ability]
  if (immunity?.has(status)) return false
  if (mon.ability === 'leafguard' && weather(state) === 'sun') return false

  mon.status = status
  mon.statusTurns = 0
  state.events.push({ type: 'status', side, status, cause })
  return true
}

const healFraction = (
  state,
  side,
  denominator,
  cause = sourceAbility(state),
) => {
  const mon = state.battle?.[side]?.mon
  if (!mon) return 0
  const amount = Math.max(1, Math.floor(maxHp(mon) / denominator))
  const healed = applyHeal(state.battle, side, amount, state.events)
  if (healed) emitAbilityReveal(state.events, side, sourceAbility(state), cause)
  return healed
}

const damageFraction = (
  state,
  side,
  denominator,
  cause = sourceAbility(state),
) => {
  const mon = state.battle?.[side]?.mon
  if (!mon || mon.hp <= 0) return 0
  const amount = Math.max(1, Math.floor(maxHp(mon) / denominator))
  const dealt = applyDamage(state.battle, side, amount, state.events)
  if (dealt) emitAbilityReveal(state.events, side, sourceAbility(state), cause)
  return dealt
}

const switchField = (kind, key) =>
  effect(
    'switchIn',
    `switch-in-${kind}`,
    (state) => {
      if (state.side && state.side !== sourceSide(state)) return
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        sourceAbility(state),
        'switch-in',
      )
      const events =
        kind === 'weather'
          ? startWeather(state.battle, key, sourceAbility(state))
          : startTerrain(state.battle, key, sourceAbility(state))
      state.events.push(...events)
    },
    100,
  )

const revealOnSwitch = (family) =>
  effect('switchIn', family, (state) => {
    if (state.side && state.side !== sourceSide(state)) return
    emitAbilityReveal(
      state.events,
      sourceSide(state),
      sourceAbility(state),
      'switch-in',
    )
  })

const statusImmunity = (statuses) => [
  effect(
    'tryStatus',
    'status-immunity',
    (state) => {
      if (!ownDefense(state) && state.targetSide !== sourceSide(state)) return
      const status = state.value ?? state.status
      if (!statuses.has(status)) return
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        sourceAbility(state),
        'status-immunity',
      )
      return { value: status, cancelled: true }
    },
    100,
  ),
]

const leafGuardEffects = [
  effect(
    'tryStatus',
    'status-immunity-weather',
    (state) => {
      if (!ownDefense(state) && state.targetSide !== sourceSide(state)) return
      if (weather(state) !== 'sun') return
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        sourceAbility(state),
        'sun',
      )
      return { cancelled: true }
    },
    100,
  ),
]

const moveTypeConverter = ({ from, to, multiplier }) => [
  effect(
    'modifyMoveType',
    'move-type-override',
    (state) => {
      if (!ownAttack(state)) return
      const current = state.value ?? state.move?.type
      if (from && current !== from) return current
      return to
    },
    50,
  ),
  effect(
    'modifyPower',
    'move-type-power',
    (state) => {
      if (!ownAttack(state)) return
      if (from && state.move?.type !== from) return
      if (!from && !state.move) return
      return Math.floor((state.value ?? 0) * multiplier)
    },
    40,
  ),
]

const liquidVoiceEffects = [
  effect(
    'modifyMoveType',
    'move-type-override',
    (state) => {
      if (!ownAttack(state) || !moveHasFlag(state.move, 'sound')) return
      return 'water'
    },
    50,
  ),
]

const thresholdBoost = (type) => [
  effect('modifyPower', 'low-hp-type-boost', (state) => {
    if (!ownAttack(state) || state.move?.type !== type) return
    if (hpRatio(sourceMon(state)) > LOW_HP_FRACTION) return
    return Math.floor((state.value ?? 0) * 1.5)
  }),
]

const weatherSpeed = (wanted) => [
  effect('modifySpeed', 'weather-speed', (state) => {
    if (state.side && state.side !== sourceSide(state)) return
    if (weather(state) !== wanted) return
    return Math.floor((state.value ?? sourceMon(state)?.stats?.speed ?? 0) * 2)
  }),
]

const damageReducer = (predicate, multiplier, family) => [
  effect(
    'modifyDamage',
    family,
    (state) => {
      if (!ownDefense(state) || !predicate(state)) return
      return Math.max(1, Math.floor((state.value ?? 0) * multiplier))
    },
    20,
  ),
]

const contactReaction = (family, react) => [
  effect('afterDamage', family, (state) => {
    if (!ownDefense(state)) return
    if ((state.damage ?? state.value ?? 0) <= 0) return
    if (!(state.contact ?? moveHasFlag(state.move, 'contact'))) return
    react(state)
  }),
]

const statusContact = (status) =>
  contactReaction('contact-status', (state) => {
    if (!chance(random(state.battle), 0.3)) return
    const target = attackerSide(state)
    if (!target) return
    if (inflictStatus(state, target, status, sourceAbility(state)))
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        sourceAbility(state),
        'contact',
      )
  })

const directContactDamage = (denominator) =>
  contactReaction('contact-damage', (state) => {
    const target = attackerSide(state)
    if (!target) return
    emitAbilityReveal(
      state.events,
      sourceSide(state),
      sourceAbility(state),
      'contact',
    )
    const mon = state.battle[target].mon
    applyDamage(
      state.battle,
      target,
      Math.max(1, Math.floor(maxHp(mon) / denominator)),
      state.events,
    )
  })

const contactStage = (stat, delta) =>
  contactReaction('contact-stage', (state) => {
    const target = attackerSide(state)
    if (!target) return
    emitAbilityReveal(
      state.events,
      sourceSide(state),
      sourceAbility(state),
      'contact',
    )
    applyStage(state, target, stat, delta)
  })

const endTurnHeal = (denominator, predicate) => [
  effect('endTurn', 'end-turn-recovery', (state) => {
    const side = sourceSide(state)
    if (!predicate(state) || sourceMon(state)?.hp <= 0) return
    healFraction(state, side, denominator, 'end-turn')
  }),
]

const endTurnDamage = (denominator, predicate) => [
  effect('endTurn', 'end-turn-damage', (state) => {
    const side = sourceSide(state)
    if (!predicate(state) || sourceMon(state)?.hp <= 0) return
    damageFraction(state, side, denominator, 'end-turn')
  }),
]

const abilityMap = new Map()
const define = (keys, handlers) => {
  for (const key of keys) abilityMap.set(key, handlers)
}

for (const [key, weatherKey] of Object.entries(WEATHER_ABILITIES))
  define([key], [switchField('weather', weatherKey)])
for (const [key, terrainKey] of Object.entries(TERRAIN_ABILITIES))
  define([key], [switchField('terrain', terrainKey)])
for (const [key, statuses] of Object.entries(STATUS_IMMUNITIES))
  define([key], statusImmunity(statuses))
for (const [key, config] of Object.entries(TYPE_CONVERTERS))
  define([key], moveTypeConverter(config))
for (const [key, wanted] of Object.entries(WEATHER_SPEED))
  define([key], weatherSpeed(wanted))
for (const [key, type] of Object.entries(THRESHOLD_BOOSTS))
  define([key], thresholdBoost(type))

define(['leafguard'], leafGuardEffects)
define(['liquidvoice'], liquidVoiceEffects)

define(['intimidate'], [
  effect(
    'switchIn',
    'switch-in-stat',
    (state) => {
      const foe = other(sourceSide(state))
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        'intimidate',
        'switch-in',
      )
      applyStage(state, foe, 'attack', -1, 'intimidate')
    },
    50,
  ),
])

define(['download'], [
  effect(
    'switchIn',
    'switch-in-stat',
    (state) => {
      const foe = state.battle[other(sourceSide(state))]?.mon
      if (!foe) return
      const stat =
        (foe.stats?.defense ?? 0) < (foe.stats?.spDefense ?? 0)
          ? 'attack'
          : 'spAttack'
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        'download',
        'switch-in',
      )
      applyStage(state, sourceSide(state), stat, 1, 'download')
    },
    50,
  ),
])

define(['forewarn', 'frisk', 'anticipation'], [
  revealOnSwitch('switch-in-information'),
])

define(['trace'], [
  effect(
    'switchIn',
    'ability-copy',
    (state) => {
      const side = sourceSide(state)
      const copied = state.battle[other(side)]?.mon?.ability
      if (!copied || copied === 'trace') return
      emitAbilityReveal(state.events, side, 'trace', 'switch-in')
      state.battle[side].mon.ability = copied
      abilityState(state.battle, side).copiedFrom = other(side)
      state.events.push({ type: 'ability-copy', side, ability: copied })
      return { replacement: { side, ability: copied } }
    },
    80,
  ),
])

define(['technician'], [
  effect('modifyPower', 'power-threshold', (state) => {
    if (!ownAttack(state)) return
    const base = state.move?.power ?? state.value ?? 0
    if (base > 60) return
    return Math.floor((state.value ?? 0) * 1.5)
  }),
])

define(['ironfist'], [
  effect('modifyPower', 'move-flag-power', (state) => {
    if (ownAttack(state) && moveHasFlag(state.move, 'punch'))
      return Math.floor((state.value ?? 0) * 1.2)
  }),
])

define(['strongjaw'], [
  effect('modifyPower', 'move-flag-power', (state) => {
    if (ownAttack(state) && moveHasFlag(state.move, 'bite'))
      return Math.floor((state.value ?? 0) * 1.5)
  }),
])

define(['megalauncher'], [
  effect('modifyPower', 'move-flag-power', (state) => {
    if (ownAttack(state) && moveHasFlag(state.move, 'pulse'))
      return Math.floor((state.value ?? 0) * 1.5)
  }),
])

define(['toughclaws'], [
  effect('modifyPower', 'move-flag-power', (state) => {
    if (
      ownAttack(state) &&
      (state.contact ?? moveHasFlag(state.move, 'contact'))
    )
      return Math.floor((state.value ?? 0) * 1.3)
  }),
])

define(['reckless'], [
  effect('modifyPower', 'move-flag-power', (state) => {
    if (ownAttack(state) && moveHasFlag(state.move, 'recoil'))
      return Math.floor((state.value ?? 0) * 1.2)
  }),
])

define(['sheerforce'], [
  effect('modifyPower', 'secondary-power', (state) => {
    if (!ownAttack(state)) return
    const secondary =
      (state.move?.ailmentChance ?? 0) > 0 ||
      (state.move?.statChance ?? 0) > 0 ||
      (state.move?.flinchChance ?? 0) > 0
    if (!secondary) return
    abilityState(state.battle, sourceSide(state)).suppressSecondary = true
    return Math.floor((state.value ?? 0) * 1.3)
  }),
])

define(['steelworker'], [
  effect('modifyPower', 'typed-power', (state) => {
    if (ownAttack(state) && state.move?.type === 'steel')
      return Math.floor((state.value ?? 0) * 1.5)
  }),
])

define(['flareboost'], [
  effect('modifyPower', 'status-power', (state) => {
    if (
      ownAttack(state) &&
      sourceMon(state)?.status === 'burn' &&
      state.move?.damageClass === 'special'
    )
      return Math.floor((state.value ?? 0) * 1.5)
  }),
])

define(['toxicboost'], [
  effect('modifyPower', 'status-power', (state) => {
    if (
      ownAttack(state) &&
      ['poison', 'badly-poisoned'].includes(sourceMon(state)?.status) &&
      state.move?.damageClass === 'physical'
    )
      return Math.floor((state.value ?? 0) * 1.5)
  }),
])

define(['guts'], [
  effect('modifyPower', 'status-power', (state) => {
    if (
      ownAttack(state) &&
      sourceMon(state)?.status &&
      state.move?.damageClass === 'physical'
    )
      return Math.floor((state.value ?? 0) * 1.5)
  }),
  effect(
    'modifyDamage',
    'burn-override',
    (state) => {
      if (
        ownAttack(state) &&
        sourceMon(state)?.status === 'burn' &&
        state.move?.damageClass === 'physical' &&
        state.burnApplied
      )
        return Math.floor((state.value ?? 0) * 2)
    },
    100,
  ),
])

define(['hugepower', 'purepower'], [
  effect('modifyPower', 'attack-stat-proxy', (state) => {
    if (ownAttack(state) && state.move?.damageClass === 'physical')
      return Math.floor((state.value ?? 0) * 2)
  }),
])

define(['defeatist'], [
  effect('modifyPower', 'hp-penalty', (state) => {
    if (ownAttack(state) && hpRatio(sourceMon(state)) <= 0.5)
      return Math.max(1, Math.floor((state.value ?? 0) / 2))
  }),
])

define(['waterbubble'], [
  ...statusImmunity(new Set(['burn'])),
  effect('modifyPower', 'typed-power', (state) => {
    if (ownAttack(state) && state.move?.type === 'water')
      return (state.value ?? 0) * 2
  }),
  ...damageReducer(
    (state) => state.move?.type === 'fire',
    0.5,
    'typed-resistance',
  ),
])

define(['darkaura'], [
  effect('modifyPower', 'global-aura', (state) => {
    if (state.move?.type === 'dark')
      return Math.floor(((state.value ?? 0) * 4) / 3)
  }),
])

define(['fairyaura'], [
  effect('modifyPower', 'global-aura', (state) => {
    if (state.move?.type === 'fairy')
      return Math.floor(((state.value ?? 0) * 4) / 3)
  }),
])

define(['aurabreak'], [
  effect(
    'modifyPower',
    'global-aura-break',
    (state) => {
      const aura =
        state.move?.type === 'dark'
          ? 'darkaura'
          : state.move?.type === 'fairy'
            ? 'fairyaura'
            : null
      if (!aura || !activeAbility(state.battle, aura)) return
      return Math.floor(((state.value ?? 0) * 9) / 16)
    },
    -10,
  ),
])

define(['adaptability'], [
  effect('modifyDamage', 'stab-modifier', (state) => {
    if (ownAttack(state) && state.stab)
      return Math.floor(((state.value ?? 0) * 4) / 3)
  }),
])

define(['neuroforce'], [
  effect('modifyDamage', 'effectiveness-power', (state) => {
    if (ownAttack(state) && (state.effectiveness ?? 1) > 1)
      return Math.floor((state.value ?? 0) * 1.25)
  }),
])

define(['tintedlens'], [
  effect('modifyDamage', 'effectiveness-power', (state) => {
    const mult = state.effectiveness ?? 1
    if (ownAttack(state) && mult > 0 && mult < 1) return (state.value ?? 0) * 2
  }),
])

for (const key of SUPER_EFFECTIVE_REDUCERS)
  define([key], damageReducer(
    (state) => (state.effectiveness ?? 1) > 1,
    0.75,
    'super-effective-reduction',
  ))
for (const key of FULL_HP_REDUCERS)
  define([key], damageReducer(
    (state) => sourceMon(state)?.hp === maxHp(sourceMon(state)),
    0.5,
    'full-hp-reduction',
  ))

define(['fluffy'], [
  effect('modifyDamage', 'contact-fire-damage', (state) => {
    if (!ownDefense(state)) return
    let value = state.value ?? 0
    if (state.contact ?? moveHasFlag(state.move, 'contact'))
      value = Math.floor(value / 2)
    if (state.move?.type === 'fire') value *= 2
    return Math.max(1, value)
  }),
])

define(['thickfat'], damageReducer(
  (state) => ['fire', 'ice'].includes(state.move?.type),
  0.5,
  'typed-resistance',
))
define(['heatproof'], [
  ...damageReducer(
    (state) => state.move?.type === 'fire',
    0.5,
    'typed-resistance',
  ),
  effect('modifyDamage', 'burn-damage-reduction', (state) => {
    if (ownDefense(state) && state.indirect && state.cause === 'burn')
      return Math.max(1, Math.floor((state.value ?? 0) / 2))
  }),
])
define(['furcoat'], damageReducer(
  (state) => state.move?.damageClass === 'physical',
  0.5,
  'defense-proxy',
))
define(['marvelscale'], damageReducer(
  (state) =>
    Boolean(sourceMon(state)?.status) && state.move?.damageClass === 'physical',
  2 / 3,
  'defense-proxy',
))
define(['grasspelt'], damageReducer(
  (state) =>
    terrain(state) === 'grassy' && state.move?.damageClass === 'physical',
  2 / 3,
  'defense-proxy',
))

define(['magicguard'], [
  effect(
    'modifyDamage',
    'indirect-immunity',
    (state) => {
      if (ownDefense(state) && state.indirect) return 0
    },
    100,
  ),
])

define(['sturdy'], [
  effect(
    'modifyDamage',
    'survive-hit',
    (state) => {
      if (!ownDefense(state)) return
      const mon = sourceMon(state)
      if (!mon || mon.hp !== maxHp(mon)) return
      if (state.ohko) return { value: 0, cancelled: true }
      return Math.min(state.value ?? 0, Math.max(0, mon.hp - 1))
    },
    100,
  ),
])

for (const key of CRIT_IMMUNITIES)
  define([key], [
    effect(
      'modifyDamage',
      'critical-immunity',
      (state) => {
        if (ownDefense(state) && state.critical)
          return Math.max(1, Math.floor((state.value ?? 0) / 1.5))
      },
      50,
    ),
  ])

define(['sniper'], [
  effect('modifyDamage', 'critical-boost', (state) => {
    if (ownAttack(state) && state.critical)
      return Math.floor((state.value ?? 0) * 1.5)
  }),
])

define(['merciless'], [
  effect('modifyDamage', 'forced-critical', (state) => {
    if (!ownAttack(state)) return
    const foe = state.battle[defenderSide(state)]?.mon
    if (!['poison', 'badly-poisoned'].includes(foe?.status) || state.critical)
      return
    return Math.floor((state.value ?? 0) * 1.5)
  }),
])

define(['levitate'], [
  effect(
    'checkImmunity',
    'type-immunity',
    (state) => {
      if (
        ownDefense(state) &&
        state.move?.type === 'ground' &&
        isGrounded(state.battle, sourceSide(state)) === false
      )
        return { cancelled: true }
    },
    100,
  ),
])

define(['soundproof'], [
  effect(
    'checkImmunity',
    'move-flag-immunity',
    (state) => {
      if (ownDefense(state) && moveHasFlag(state.move, 'sound'))
        return { cancelled: true }
    },
    100,
  ),
])

define(['bulletproof'], [
  effect(
    'checkImmunity',
    'move-flag-immunity',
    (state) => {
      if (ownDefense(state) && moveHasFlag(state.move, 'bullet'))
        return { cancelled: true }
    },
    100,
  ),
])

define(['overcoat'], [
  effect(
    'checkImmunity',
    'move-flag-immunity',
    (state) => {
      if (ownDefense(state) && moveHasFlag(state.move, 'powder'))
        return { cancelled: true }
    },
    100,
  ),
  effect(
    'modifyDamage',
    'weather-immunity',
    (state) => {
      if (
        ownDefense(state) &&
        state.indirect &&
        ['sandstorm', 'hail'].includes(state.cause)
      )
        return 0
    },
    100,
  ),
])

define(['wonderguard'], [
  effect(
    'checkImmunity',
    'effectiveness-immunity',
    (state) => {
      if (!ownDefense(state) || state.move?.damageClass === 'status') return
      const defender = sourceMon(state)
      const mult =
        state.effectiveness ??
        effectiveness(state.move?.type, typesOf(defender))
      if (mult <= 1) return { cancelled: true }
    },
    100,
  ),
])

const absorbingImmunity = (type, react) => [
  effect(
    'checkImmunity',
    'absorbing-immunity',
    (state) => {
      if (!ownDefense(state) || state.move?.type !== type) return
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        sourceAbility(state),
        'immunity',
      )
      react(state)
      return { cancelled: true }
    },
    110,
  ),
]

define(['voltabsorb'], absorbingImmunity('electric', (state) =>
  healFraction(state, sourceSide(state), 4, 'absorb'),
))
define(['waterabsorb'], absorbingImmunity('water', (state) =>
  healFraction(state, sourceSide(state), 4, 'absorb'),
))
define(['lightningrod'], absorbingImmunity('electric', (state) =>
  applyStage(state, sourceSide(state), 'spAttack', 1),
))
define(['stormdrain'], absorbingImmunity('water', (state) =>
  applyStage(state, sourceSide(state), 'spAttack', 1),
))
define(['motordrive'], absorbingImmunity('electric', (state) =>
  applyStage(state, sourceSide(state), 'speed', 1),
))
define(['sapsipper'], absorbingImmunity('grass', (state) =>
  applyStage(state, sourceSide(state), 'attack', 1),
))
define(['flashfire'], [
  ...absorbingImmunity('fire', (state) => {
    abilityState(state.battle, sourceSide(state)).flashFire = true
  }),
  effect('modifyPower', 'activated-power', (state) => {
    if (
      ownAttack(state) &&
      state.move?.type === 'fire' &&
      abilityState(state.battle, sourceSide(state)).flashFire
    )
      return Math.floor((state.value ?? 0) * 1.5)
  }),
])

define(['compoundeyes'], [
  effect('modifyAccuracy', 'accuracy-boost', (state) => {
    if (ownAttack(state) && state.value != null)
      return Math.min(100, state.value * 1.3)
  }),
])

define(['victorystar'], [
  effect('modifyAccuracy', 'accuracy-boost', (state) => {
    if (ownAttack(state) && state.value != null)
      return Math.min(100, state.value * 1.1)
  }),
])

define(['hustle'], [
  effect('modifyPower', 'attack-stat-proxy', (state) => {
    if (ownAttack(state) && state.move?.damageClass === 'physical')
      return Math.floor((state.value ?? 0) * 1.5)
  }),
  effect('modifyAccuracy', 'accuracy-penalty', (state) => {
    if (
      ownAttack(state) &&
      state.move?.damageClass === 'physical' &&
      state.value != null
    )
      return state.value * 0.8
  }),
])

define(['noguard'], [
  effect(
    'modifyAccuracy',
    'always-hit',
    (state) => {
      if (ownAttack(state) || ownDefense(state)) return 100
    },
    100,
  ),
])

define(['sandveil'], [
  effect('modifyAccuracy', 'weather-evasion', (state) => {
    if (
      ownDefense(state) &&
      weather(state) === 'sandstorm' &&
      state.value != null
    )
      return state.value / 1.25
  }),
])

define(['snowcloak'], [
  effect('modifyAccuracy', 'weather-evasion', (state) => {
    if (ownDefense(state) && weather(state) === 'hail' && state.value != null)
      return state.value / 1.25
  }),
])

define(['tangledfeet'], [
  effect('modifyAccuracy', 'volatile-evasion', (state) => {
    if (
      ownDefense(state) &&
      (sourceActor(state)?.volatile?.confusion ?? 0) > 0 &&
      state.value != null
    )
      return state.value / 2
  }),
])

define(['wonderskin'], [
  effect('modifyAccuracy', 'status-accuracy-cap', (state) => {
    if (
      ownDefense(state) &&
      state.move?.damageClass === 'status' &&
      state.value != null
    )
      return Math.min(50, state.value)
  }),
])

define(['quickfeet'], [
  effect('modifySpeed', 'status-speed', (state) => {
    if (state.side && state.side !== sourceSide(state)) return
    if (!sourceMon(state)?.status) return
    let value = state.value ?? sourceMon(state)?.stats?.speed ?? 0
    if (sourceMon(state).status === 'paralysis' && state.paralysisApplied)
      value *= 2
    return Math.floor(value * 1.5)
  }),
])

define(['surgesurfer'], [
  effect('modifySpeed', 'terrain-speed', (state) => {
    if (
      (!state.side || state.side === sourceSide(state)) &&
      terrain(state) === 'electric'
    )
      return Math.floor(
        (state.value ?? sourceMon(state)?.stats?.speed ?? 0) * 2,
      )
  }),
])

define(['unburden'], [
  effect('consumeItem', 'item-loss-speed', (state) => {
    if (
      state.itemOwnerSide !== sourceSide(state) &&
      state.side !== sourceSide(state)
    )
      return
    if (state.consumed || state.lost)
      abilityState(state.battle, sourceSide(state)).unburden = true
  }),
  effect('modifySpeed', 'item-loss-speed', (state) => {
    if (
      (!state.side || state.side === sourceSide(state)) &&
      abilityState(state.battle, sourceSide(state)).unburden
    )
      return Math.floor(
        (state.value ?? sourceMon(state)?.stats?.speed ?? 0) * 2,
      )
  }),
  effect('switchOut', 'item-loss-reset', (state) => {
    abilityState(state.battle, sourceSide(state)).unburden = false
  }),
])

define(['slowstart'], [
  effect('switchIn', 'timed-penalty', (state) => {
    abilityState(state.battle, sourceSide(state)).slowStartTurns = 5
    emitAbilityReveal(state.events, sourceSide(state), 'slowstart', 'switch-in')
  }),
  effect('modifyPower', 'timed-penalty', (state) => {
    if (
      ownAttack(state) &&
      state.move?.damageClass === 'physical' &&
      abilityState(state.battle, sourceSide(state)).slowStartTurns > 0
    )
      return Math.max(1, Math.floor((state.value ?? 0) / 2))
  }),
  effect('modifySpeed', 'timed-penalty', (state) => {
    if (
      (!state.side || state.side === sourceSide(state)) &&
      abilityState(state.battle, sourceSide(state)).slowStartTurns > 0
    )
      return Math.floor(
        (state.value ?? sourceMon(state)?.stats?.speed ?? 0) / 2,
      )
  }),
  effect('endTurn', 'timed-penalty', (state) => {
    const store = abilityState(state.battle, sourceSide(state))
    if (store.slowStartTurns > 0) store.slowStartTurns--
  }),
])

define(['prankster'], [
  effect('modifyPriority', 'status-priority', (state) => {
    if (ownAttack(state) && state.move?.damageClass === 'status')
      return (state.value ?? 0) + 1
  }),
])

define(['galewings'], [
  effect('modifyPriority', 'typed-priority', (state) => {
    if (
      ownAttack(state) &&
      sourceMon(state)?.hp === maxHp(sourceMon(state)) &&
      state.move?.type === 'flying'
    )
      return (state.value ?? 0) + 1
  }),
])

define(['triage'], [
  effect('modifyPriority', 'healing-priority', (state) => {
    if (ownAttack(state) && moveHasFlag(state.move, 'heal'))
      return (state.value ?? 0) + 3
  }),
])

for (const key of ['dazzling', 'queenlymajesty'])
  define([key], [
    effect(
      'modifyPriority',
      'priority-block',
      (state) => {
        if (attackerSide(state) === sourceSide(state)) return
        if ((state.value ?? state.move?.priority ?? 0) > 0)
          return { cancelled: true }
      },
      100,
    ),
  ])

define(['roughskin', 'ironbarbs'], directContactDamage(8))
define(['gooey', 'tanglinghair'], contactStage('speed', -1))
define(['flamebody'], statusContact('burn'))
define(['static'], statusContact('paralysis'))
define(['poisonpoint'], statusContact('poison'))

define(['effectspore'], contactReaction('contact-random-status', (state) => {
  if (!chance(random(state.battle), 0.3)) return
  const target = attackerSide(state)
  if (!target) return
  const status = pick(random(state.battle), ['poison', 'paralysis', 'sleep'])
  if (inflictStatus(state, target, status, 'effectspore'))
    emitAbilityReveal(state.events, sourceSide(state), 'effectspore', 'contact')
}))

define(['mummy'], contactReaction('contact-ability-change', (state) => {
  const target = attackerSide(state)
  if (!target) return
  const mon = state.battle[target].mon
  if (!mon?.ability || mon.ability === 'mummy') return
  emitAbilityReveal(state.events, sourceSide(state), 'mummy', 'contact')
  const previous = mon.ability
  mon.ability = 'mummy'
  state.events.push({
    type: 'ability-change',
    side: target,
    from: previous,
    ability: 'mummy',
  })
}))

define(['colorchange'], [
  effect('afterDamage', 'type-change', (state) => {
    if (
      !ownDefense(state) ||
      (state.damage ?? state.value ?? 0) <= 0 ||
      !state.move?.type
    )
      return
    const mon = sourceMon(state)
    if (typesOf(mon).includes(state.move.type)) return
    emitAbilityReveal(state.events, sourceSide(state), 'colorchange', 'hit')
    setBattleTypes(mon, [state.move.type])
    state.events.push({
      type: 'type-change',
      side: sourceSide(state),
      types: [state.move.type],
    })
  }),
])

define(['protean'], [
  effect(
    'beforeAction',
    'type-change',
    (state) => {
      if (!ownAttack(state) || !state.move?.type) return
      const mon = sourceMon(state)
      if (typesOf(mon).length === 1 && typesOf(mon)[0] === state.move.type)
        return
      emitAbilityReveal(state.events, sourceSide(state), 'protean', 'move')
      setBattleTypes(mon, [state.move.type])
      state.events.push({
        type: 'type-change',
        side: sourceSide(state),
        types: [state.move.type],
      })
    },
    80,
  ),
])

define(['rattled'], [
  effect('afterDamage', 'typed-hit-stage', (state) => {
    if (
      ownDefense(state) &&
      ['bug', 'dark', 'ghost'].includes(state.move?.type) &&
      (state.damage ?? 0) > 0
    )
      applyStage(state, sourceSide(state), 'speed', 1)
  }),
])

define(['justified'], [
  effect('afterDamage', 'typed-hit-stage', (state) => {
    if (
      ownDefense(state) &&
      state.move?.type === 'dark' &&
      (state.damage ?? 0) > 0
    )
      applyStage(state, sourceSide(state), 'attack', 1)
  }),
])

define(['stamina'], [
  effect('afterDamage', 'hit-stage', (state) => {
    if (ownDefense(state) && (state.damage ?? 0) > 0)
      applyStage(state, sourceSide(state), 'defense', 1)
  }),
])

define(['watercompaction'], [
  effect('afterDamage', 'typed-hit-stage', (state) => {
    if (
      ownDefense(state) &&
      state.move?.type === 'water' &&
      (state.damage ?? 0) > 0
    )
      applyStage(state, sourceSide(state), 'defense', 2)
  }),
])

define(['weakarmor'], [
  effect('afterDamage', 'physical-hit-stage', (state) => {
    if (
      !ownDefense(state) ||
      state.move?.damageClass !== 'physical' ||
      (state.damage ?? 0) <= 0
    )
      return
    applyStage(state, sourceSide(state), 'defense', -1)
    applyStage(state, sourceSide(state), 'speed', 2)
  }),
])

define(['berserk'], [
  effect('afterDamage', 'hp-threshold-stage', (state) => {
    if (!ownDefense(state) || (state.damage ?? 0) <= 0) return
    const mon = sourceMon(state)
    const before = state.hpBefore ?? mon.hp + state.damage
    if (before > maxHp(mon) / 2 && mon.hp <= maxHp(mon) / 2)
      applyStage(state, sourceSide(state), 'spAttack', 1)
  }),
])

define(['speedboost'], [
  effect('endTurn', 'end-turn-stage', (state) => {
    if (sourceMon(state)?.hp > 0)
      applyStage(state, sourceSide(state), 'speed', 1)
  }),
])

define(['raindish'], endTurnHeal(16, (state) => weather(state) === 'rain'))
define(['icebody'], endTurnHeal(16, (state) => weather(state) === 'hail'))
define(['poisonheal'], [
  ...endTurnHeal(8, (state) =>
    ['poison', 'badly-poisoned'].includes(sourceMon(state)?.status),
  ),
  effect(
    'modifyDamage',
    'poison-damage-immunity',
    (state) => {
      if (
        ownDefense(state) &&
        state.indirect &&
        ['poison', 'badly-poisoned'].includes(state.cause)
      )
        return 0
    },
    100,
  ),
])
define(['dryskin'], [
  ...endTurnHeal(8, (state) => weather(state) === 'rain'),
  ...endTurnDamage(8, (state) => weather(state) === 'sun'),
  ...absorbingImmunity('water', (state) =>
    healFraction(state, sourceSide(state), 4, 'absorb'),
  ),
  effect('modifyDamage', 'fire-weakness', (state) => {
    if (ownDefense(state) && state.move?.type === 'fire')
      return Math.floor((state.value ?? 0) * 1.25)
  }),
])

define(['hydration'], [
  effect('endTurn', 'weather-status-cure', (state) => {
    if (weather(state) === 'rain' && sourceMon(state)?.status) {
      emitAbilityReveal(state.events, sourceSide(state), 'hydration', 'rain')
      cureStatus(state, sourceSide(state), 'hydration')
    }
  }),
])

define(['shedskin'], [
  effect('endTurn', 'random-status-cure', (state) => {
    if (sourceMon(state)?.status && chance(random(state.battle), 1 / 3)) {
      emitAbilityReveal(state.events, sourceSide(state), 'shedskin', 'end-turn')
      cureStatus(state, sourceSide(state), 'shedskin')
    }
  }),
])

define(['baddreams'], [
  effect('endTurn', 'foe-residual', (state) => {
    const foe = other(sourceSide(state))
    if (state.battle[foe]?.mon?.status === 'sleep') {
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        'baddreams',
        'end-turn',
      )
      const mon = state.battle[foe].mon
      applyDamage(
        state.battle,
        foe,
        Math.max(1, Math.floor(maxHp(mon) / 8)),
        state.events,
      )
    }
  }),
])

define(['moody'], [
  effect('endTurn', 'random-stage-pair', (state) => {
    const actor = sourceActor(state)
    if (!actor?.stages || sourceMon(state)?.hp <= 0) return
    const stats = [
      'attack',
      'defense',
      'spAttack',
      'spDefense',
      'speed',
      'accuracy',
      'evasion',
    ]
    const upChoices = stats.filter(
      (stat) => (actor.stages[stat] ?? 0) < STAGE_LIMIT,
    )
    if (!upChoices.length) return
    const up = pick(random(state.battle), upChoices)
    const downChoices = stats.filter(
      (stat) => stat !== up && (actor.stages[stat] ?? 0) > -STAGE_LIMIT,
    )
    emitAbilityReveal(state.events, sourceSide(state), 'moody', 'end-turn')
    applyStage(state, sourceSide(state), up, 2, 'moody')
    if (downChoices.length)
      applyStage(
        state,
        sourceSide(state),
        pick(random(state.battle), downChoices),
        -1,
        'moody',
      )
  }),
])

define(['regenerator'], [
  effect('switchOut', 'switch-out-recovery', (state) => {
    healFraction(state, sourceSide(state), 3, 'switch-out')
  }),
])

define(['naturalcure'], [
  effect('switchOut', 'switch-out-status-cure', (state) => {
    if (sourceMon(state)?.status) {
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        'naturalcure',
        'switch-out',
      )
      cureStatus(state, sourceSide(state), 'naturalcure')
    }
  }),
])

define(['moxie'], [
  effect('faint', 'ko-stage', (state) => {
    if (
      state.faintedSide === sourceSide(state) ||
      state.causedBy !== sourceSide(state)
    )
      return
    applyStage(state, sourceSide(state), 'attack', 1, 'moxie')
  }),
])

define(['beastboost'], [
  effect('faint', 'ko-highest-stat', (state) => {
    if (
      state.faintedSide === sourceSide(state) ||
      state.causedBy !== sourceSide(state)
    )
      return
    const mon = sourceMon(state)
    const stats = ['attack', 'defense', 'spAttack', 'spDefense', 'speed']
    const best = stats.reduce((a, b) => (mon.stats[b] > mon.stats[a] ? b : a))
    applyStage(state, sourceSide(state), best, 1, 'beastboost')
  }),
])

define(['soulheart'], [
  effect('faint', 'any-faint-stage', (state) => {
    if (
      state.faintedSide &&
      state.faintedSide !== sourceSide(state) &&
      sourceMon(state)?.hp > 0
    )
      applyStage(state, sourceSide(state), 'spAttack', 1, 'soulheart')
  }),
])

define(['aftermath'], [
  effect('faint', 'faint-contact-damage', (state) => {
    if (
      state.faintedSide !== sourceSide(state) ||
      !(state.contact ?? moveHasFlag(state.move, 'contact'))
    )
      return
    const attacker = state.attackerSide ?? attackerSide(state)
    if (!attacker || activeAbility(state.battle, 'damp')) return
    const mon = state.battle[attacker].mon
    emitAbilityReveal(state.events, sourceSide(state), 'aftermath', 'faint')
    applyDamage(
      state.battle,
      attacker,
      Math.max(1, Math.floor(maxHp(mon) / 4)),
      state.events,
    )
  }),
])

define(['innardsout'], [
  effect('faint', 'faint-retaliation', (state) => {
    if (state.faintedSide !== sourceSide(state)) return
    const attacker = state.attackerSide ?? attackerSide(state)
    if (!attacker) return
    emitAbilityReveal(state.events, sourceSide(state), 'innardsout', 'faint')
    applyDamage(
      state.battle,
      attacker,
      state.lastDamage ?? state.hpBefore ?? 0,
      state.events,
    )
  }),
])

define(['cheekpouch'], [
  effect('consumeItem', 'berry-recovery', (state) => {
    if (
      (state.itemOwnerSide ?? state.side) !== sourceSide(state) ||
      state.itemKind !== 'berry'
    )
      return
    abilityState(state.battle, sourceSide(state)).lastConsumedBerry =
      state.itemKey ?? null
    healFraction(state, sourceSide(state), 3, 'berry')
  }),
])

define(['harvest'], [
  effect('consumeItem', 'berry-memory', (state) => {
    if (
      (state.itemOwnerSide ?? state.side) === sourceSide(state) &&
      state.itemKind === 'berry'
    )
      abilityState(state.battle, sourceSide(state)).lastConsumedBerry =
        state.itemKey ?? null
  }),
  effect('endTurn', 'berry-restore', (state) => {
    const store = abilityState(state.battle, sourceSide(state))
    const mon = sourceMon(state)
    if (!store.lastConsumedBerry || mon?.heldItem) return
    if (weather(state) !== 'sun' && !chance(random(state.battle), 0.5)) return
    mon.heldItem = store.lastConsumedBerry
    emitAbilityReveal(state.events, sourceSide(state), 'harvest', 'end-turn')
    state.events.push({
      type: 'item-restore',
      side: sourceSide(state),
      item: mon.heldItem,
    })
    store.lastConsumedBerry = null
  }),
])

define(['klutz'], [
  effect(
    'consumeItem',
    'held-item-suppression',
    (state) => {
      if (
        (state.itemOwnerSide ?? state.side) === sourceSide(state) &&
        state.automatic
      )
        return { cancelled: true }
    },
    100,
  ),
])

define(['stickyhold'], [
  effect(
    'consumeItem',
    'held-item-protection',
    (state) => {
      if (
        (state.itemOwnerSide ?? state.side) === sourceSide(state) &&
        ['stolen', 'removed', 'swapped'].includes(state.reason)
      )
        return { cancelled: true }
    },
    100,
  ),
])

define(['unnerve'], [
  effect(
    'consumeItem',
    'opponent-berry-block',
    (state) => {
      if (
        (state.itemOwnerSide ?? state.side) === other(sourceSide(state)) &&
        state.itemKind === 'berry'
      )
        return { cancelled: true }
    },
    100,
  ),
])

define(['gluttony'], [
  effect('consumeItem', 'berry-threshold', (state) => {
    if (
      (state.itemOwnerSide ?? state.side) === sourceSide(state) &&
      state.itemKind === 'berry' &&
      typeof state.value === 'number'
    )
      return Math.max(state.value, 0.5)
  }),
])

define(['rockhead'], [
  effect(
    'afterDamage',
    'recoil-immunity',
    (state) => {
      if (
        (state.attackerSide ?? attackerSide(state)) === sourceSide(state) &&
        state.kind === 'recoil' &&
        state.move?.key !== 'struggle'
      )
        return { cancelled: true }
    },
    100,
  ),
])

define(['runaway'], [
  effect(
    'beforeAction',
    'escape-guarantee',
    (state) => {
      if (
        (state.side ?? attackerSide(state)) === sourceSide(state) &&
        state.action?.type === 'run'
      )
        return 1
    },
    100,
  ),
])

define(['truant'], [
  effect(
    'beforeAction',
    'alternate-turn-skip',
    (state) => {
      if (
        (state.side ?? attackerSide(state)) !== sourceSide(state) ||
        state.action?.type !== 'move'
      )
        return
      const store = abilityState(state.battle, sourceSide(state))
      const loafing = Boolean(store.truantNext)
      store.truantNext = !store.truantNext
      if (loafing) {
        emitAbilityReveal(
          state.events,
          sourceSide(state),
          'truant',
          'before-action',
        )
        return { cancelled: true }
      }
    },
    100,
  ),
])

define(['pressure'], [
  effect('beforeAction', 'extra-pp', (state) => {
    if (
      defenderSide(state) !== sourceSide(state) ||
      !state.slot ||
      attackerSide(state) === sourceSide(state)
    )
      return
    state.slot.pp = Math.max(0, state.slot.pp - 1)
    emitAbilityReveal(state.events, sourceSide(state), 'pressure', 'targeted')
  }),
])

define(['skilllink'], [
  effect('beforeAction', 'multi-hit-override', (state) => {
    if (
      ownAttack(state) &&
      state.move?.maxHits &&
      typeof state.value === 'number'
    )
      return state.move.maxHits
  }),
])

define(['serenegrace'], [
  effect('beforeAction', 'secondary-chance', (state) => {
    if (
      ownAttack(state) &&
      typeof state.value === 'number' &&
      state.kind === 'secondary-chance'
    )
      return Math.min(100, state.value * 2)
  }),
])

define(['stench'], [
  effect('beforeAction', 'flinch-chance', (state) => {
    if (
      ownAttack(state) &&
      state.kind === 'flinch-chance' &&
      (state.value ?? 0) === 0
    )
      return 10
  }),
])

define(['longreach'], [
  effect('beforeAction', 'contact-override', (state) => {
    if (ownAttack(state) && state.kind === 'contact') return 0
  }),
])

define(['contrary'], [
  effect(
    'afterHit',
    'stat-delta-override',
    (state) => {
      if (
        state.kind === 'stat-change' &&
        state.targetSide === sourceSide(state) &&
        typeof state.value === 'number'
      )
        return -state.value
    },
    100,
  ),
])

define(['simple'], [
  effect(
    'afterHit',
    'stat-delta-override',
    (state) => {
      if (
        state.kind === 'stat-change' &&
        state.targetSide === sourceSide(state) &&
        typeof state.value === 'number'
      )
        return state.value * 2
    },
    90,
  ),
])

for (const key of STAT_DROP_BLOCKERS)
  define([key], [
    effect(
      'afterHit',
      'stat-drop-immunity',
      (state) => {
        if (
          state.kind === 'stat-change' &&
          state.targetSide === sourceSide(state) &&
          state.causeSide &&
          state.causeSide !== sourceSide(state) &&
          (state.value ?? 0) < 0
        )
          return { cancelled: true }
      },
      100,
    ),
  ])

define(['hypercutter'], [
  effect(
    'afterHit',
    'stat-drop-immunity',
    (state) => {
      if (
        state.kind === 'stat-change' &&
        state.targetSide === sourceSide(state) &&
        state.stat === 'attack' &&
        state.causeSide !== sourceSide(state) &&
        (state.value ?? 0) < 0
      )
        return { cancelled: true }
    },
    100,
  ),
])

define(['bigpecks'], [
  effect(
    'afterHit',
    'stat-drop-immunity',
    (state) => {
      if (
        state.kind === 'stat-change' &&
        state.targetSide === sourceSide(state) &&
        state.stat === 'defense' &&
        state.causeSide !== sourceSide(state) &&
        (state.value ?? 0) < 0
      )
        return { cancelled: true }
    },
    100,
  ),
])

define(['keeneye'], [
  effect(
    'afterHit',
    'stat-drop-immunity',
    (state) => {
      if (
        state.kind === 'stat-change' &&
        state.targetSide === sourceSide(state) &&
        state.stat === 'accuracy' &&
        state.causeSide !== sourceSide(state) &&
        (state.value ?? 0) < 0
      )
        return { cancelled: true }
    },
    100,
  ),
])

define(['defiant'], [
  effect('afterHit', 'stat-drop-reaction', (state) => {
    if (
      state.kind === 'stat-change-applied' &&
      state.targetSide === sourceSide(state) &&
      state.causeSide !== sourceSide(state) &&
      (state.delta ?? 0) < 0
    )
      applyStage(state, sourceSide(state), 'attack', 2, 'defiant')
  }),
])

define(['competitive'], [
  effect('afterHit', 'stat-drop-reaction', (state) => {
    if (
      state.kind === 'stat-change-applied' &&
      state.targetSide === sourceSide(state) &&
      state.causeSide !== sourceSide(state) &&
      (state.delta ?? 0) < 0
    )
      applyStage(state, sourceSide(state), 'spAttack', 2, 'competitive')
  }),
])

define(['steadfast'], [
  effect('afterHit', 'flinch-reaction', (state) => {
    if (state.kind === 'flinch' && state.targetSide === sourceSide(state))
      applyStage(state, sourceSide(state), 'speed', 1, 'steadfast')
  }),
])

define(['synchronize'], [
  effect('afterHit', 'status-reflect', (state) => {
    if (
      state.kind !== 'status-applied' ||
      state.targetSide !== sourceSide(state)
    )
      return
    if (
      !['burn', 'paralysis', 'poison', 'badly-poisoned'].includes(state.status)
    )
      return
    if (state.causeSide && state.causeSide !== sourceSide(state))
      inflictStatus(state, state.causeSide, state.status, 'synchronize')
  }),
])

define(['emergencyexit', 'wimpout'], [
  effect('afterDamage', 'hp-threshold-switch', (state) => {
    if (!ownDefense(state) || (state.damage ?? 0) <= 0) return
    const mon = sourceMon(state)
    const before = state.hpBefore ?? mon.hp + state.damage
    if (before > maxHp(mon) / 2 && mon.hp <= maxHp(mon) / 2 && mon.hp > 0) {
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        sourceAbility(state),
        'threshold',
      )
      return {
        replacement: { kind: 'switch', side: sourceSide(state), forced: true },
      }
    }
  }),
])

define(['damp'], [
  effect(
    'beforeAction',
    'move-prevention',
    (state) => {
      if (
        ['explosion', 'mind-blown', 'self-destruct'].includes(state.move?.key)
      ) {
        emitAbilityReveal(
          state.events,
          sourceSide(state),
          'damp',
          'move-prevention',
        )
        return { cancelled: true }
      }
    },
    100,
  ),
])

define(['arenatrap'], [
  effect(
    'beforeAction',
    'switch-trap',
    (state) => {
      const target = state.side ?? attackerSide(state)
      if (
        state.action?.type === 'switch' &&
        target === other(sourceSide(state)) &&
        isGrounded(state.battle, target)
      )
        return { cancelled: true }
    },
    100,
  ),
])

define(['magnetpull'], [
  effect(
    'beforeAction',
    'switch-trap',
    (state) => {
      const target = state.side ?? attackerSide(state)
      if (
        state.action?.type !== 'switch' ||
        target !== other(sourceSide(state))
      )
        return
      if (typesOf(state.battle[target].mon).includes('steel'))
        return { cancelled: true }
    },
    100,
  ),
])

define(['shadowtag'], [
  effect(
    'beforeAction',
    'switch-trap',
    (state) => {
      const target = state.side ?? attackerSide(state)
      if (
        state.action?.type !== 'switch' ||
        target !== other(sourceSide(state))
      )
        return
      if (state.battle[target].mon.ability !== 'shadowtag')
        return { cancelled: true }
    },
    100,
  ),
])

define(['suctioncups'], [
  effect(
    'beforeAction',
    'forced-switch-immunity',
    (state) => {
      if (
        state.side === sourceSide(state) &&
        state.action?.type === 'forced-switch'
      )
        return { cancelled: true }
    },
    100,
  ),
])

for (const key of WEATHER_SUPPRESSORS)
  define([key], [
    effect(
      'battleStart',
      'weather-suppression',
      (state) => {
        abilityState(state.battle, sourceSide(state)).suppressWeather = true
      },
      100,
    ),
    effect('switchOut', 'weather-suppression', (state) => {
      abilityState(state.battle, sourceSide(state)).suppressWeather = false
    }),
  ])

define(['sandforce'], [
  effect('modifyPower', 'weather-power', (state) => {
    if (
      ownAttack(state) &&
      weather(state) === 'sandstorm' &&
      ['ground', 'rock', 'steel'].includes(state.move?.type)
    )
      return Math.floor((state.value ?? 0) * 1.3)
  }),
])

define(['solarpower'], [
  effect('modifyPower', 'weather-power', (state) => {
    if (
      ownAttack(state) &&
      weather(state) === 'sun' &&
      state.move?.damageClass === 'special'
    )
      return Math.floor((state.value ?? 0) * 1.5)
  }),
  ...endTurnDamage(8, (state) => weather(state) === 'sun'),
])

define(['analytic'], [
  effect('modifyPower', 'turn-order-power', (state) => {
    if (ownAttack(state) && state.movingLast)
      return Math.floor((state.value ?? 0) * 1.3)
  }),
])

define(['stakeout'], [
  effect('modifyPower', 'switch-target-power', (state) => {
    if (ownAttack(state) && state.targetSwitchedThisTurn)
      return (state.value ?? 0) * 2
  }),
])

define(['rivalry'], [
  effect('modifyPower', 'gender-power', (state) => {
    if (!ownAttack(state) || !state.attackerGender || !state.defenderGender)
      return
    return Math.floor(
      (state.value ?? 0) *
        (state.attackerGender === state.defenderGender ? 1.25 : 0.75),
    )
  }),
])

define(['stall'], [
  effect(
    'modifyPriority',
    'move-last',
    (state) => {
      if (ownAttack(state)) return (state.value ?? 0) - 0.1
    },
    -100,
  ),
])

define(['superluck'], [
  effect('beforeAction', 'critical-stage', (state) => {
    if (ownAttack(state) && state.kind === 'critical-stage')
      return (state.value ?? 0) + 1
  }),
])

define(['corrosion'], [
  effect(
    'tryStatus',
    'status-type-override',
    (state) => {
      if (
        ownAttack(state) &&
        ['poison', 'badly-poisoned'].includes(state.value ?? state.status)
      )
        abilityState(state.battle, sourceSide(state)).ignorePoisonTypeImmunity =
          true
    },
    150,
  ),
])

define(['scrappy'], [
  effect(
    'checkImmunity',
    'type-immunity-override',
    (state) => {
      if (ownAttack(state) && ['normal', 'fighting'].includes(state.move?.type))
        abilityState(state.battle, sourceSide(state)).scrappy = true
    },
    150,
  ),
])

for (const key of MOLD_BREAKERS)
  define([key], [
    effect(
      'beforeAction',
      'ability-suppression',
      (state) => {
        if (ownAttack(state))
          abilityState(state.battle, sourceSide(state)).breaksAbilities = true
      },
      200,
    ),
  ])

define(['unaware'], [
  effect(
    'modifyDamage',
    'stage-override-marker',
    (state) => {
      if (ownAttack(state) || ownDefense(state))
        abilityState(state.battle, sourceSide(state)).ignoreOpponentStages =
          true
    },
    200,
  ),
])

define(['infiltrator'], [
  effect(
    'beforeAction',
    'screen-override-marker',
    (state) => {
      if (ownAttack(state))
        abilityState(state.battle, sourceSide(state)).infiltrator = true
    },
    200,
  ),
])

define(['magicbounce'], [
  effect(
    'beforeAction',
    'status-reflection',
    (state) => {
      if (
        ownDefense(state) &&
        state.move?.damageClass === 'status' &&
        state.reflectable
      )
        return {
          replacement: {
            kind: 'reflect-move',
            attacker: sourceSide(state),
            defender: attackerSide(state),
            move: state.move,
          },
        }
    },
    150,
  ),
])

define(['parentalbond'], [
  effect('beforeAction', 'extra-hit', (state) => {
    if (
      ownAttack(state) &&
      state.move?.damageClass !== 'status' &&
      state.kind === 'hit-count'
    )
      return Math.max(2, state.value ?? 1)
  }),
  effect('modifyDamage', 'second-hit-damage', (state) => {
    if (ownAttack(state) && state.hitIndex === 1)
      return Math.max(1, Math.floor((state.value ?? 0) / 4))
  }),
])

define(['dancer'], [
  effect('afterHit', 'move-replay', (state) => {
    if (
      state.kind === 'dance-used' &&
      attackerSide(state) !== sourceSide(state)
    )
      return {
        replacement: {
          kind: 'repeat-move',
          side: sourceSide(state),
          move: state.move,
        },
      }
  }),
])

define(['magician'], [
  effect('afterDamage', 'item-steal', (state) => {
    if (!ownAttack(state) || (state.damage ?? 0) <= 0) return
    const mon = sourceMon(state)
    const foeSide = defenderSide(state)
    const foe = state.battle[foeSide]?.mon
    if (!mon || mon.heldItem || !foe?.heldItem || foe.ability === 'stickyhold')
      return
    mon.heldItem = foe.heldItem
    foe.heldItem = null
    state.events.push({
      type: 'item-steal',
      side: sourceSide(state),
      from: foeSide,
      item: mon.heldItem,
    })
  }),
])

define(['pickpocket'], contactReaction('item-steal', (state) => {
  const mon = sourceMon(state)
  const foeSide = attackerSide(state)
  const foe = state.battle[foeSide]?.mon
  if (!mon || mon.heldItem || !foe?.heldItem || foe.ability === 'stickyhold')
    return
  mon.heldItem = foe.heldItem
  foe.heldItem = null
  state.events.push({
    type: 'item-steal',
    side: sourceSide(state),
    from: foeSide,
    item: mon.heldItem,
  })
}))

define(['pickup'], [
  effect('endTurn', 'item-pickup', (state) => {
    const mon = sourceMon(state)
    const store = abilityState(state.battle, sourceSide(state))
    if (!mon?.heldItem && store.pickupItem) {
      mon.heldItem = store.pickupItem
      store.pickupItem = null
      state.events.push({
        type: 'item-pickup',
        side: sourceSide(state),
        item: mon.heldItem,
      })
    }
  }),
])

define(['angerpoint'], [
  effect('afterDamage', 'critical-hit-stage', (state) => {
    if (ownDefense(state) && state.critical && (state.damage ?? 0) > 0) {
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        'angerpoint',
        'critical-hit',
      )
      applyStage(state, sourceSide(state), 'attack', 12, 'angerpoint')
    }
  }),
])

define(['aromaveil'], [
  effect(
    'tryStatus',
    'volatile-status-immunity',
    (state) => {
      if (!ownDefense(state) && state.targetSide !== sourceSide(state)) return
      const blocked = new Set([
        'attract',
        'infatuation',
        'disable',
        'encore',
        'heal-block',
        'taunt',
        'torment',
      ])
      if (blocked.has(state.value ?? state.status)) {
        emitAbilityReveal(
          state.events,
          sourceSide(state),
          'aromaveil',
          'status-immunity',
        )
        return { cancelled: true }
      }
    },
    100,
  ),
])

define(['cursedbody'], [
  effect('afterDamage', 'hit-disable', (state) => {
    if (
      !ownDefense(state) ||
      (state.damage ?? 0) <= 0 ||
      !chance(random(state.battle), 0.3)
    )
      return
    const target = attackerSide(state)
    const actor = state.battle[target]
    if (!actor?.volatile || actor.volatile.disable) return
    const index = Number.isInteger(state.moveIndex)
      ? state.moveIndex
      : actor.mon.moves?.findIndex(
          (slot) => slot.move === (state.move?.key ?? state.move?.id),
        )
    if (!Number.isInteger(index) || index < 0) return
    actor.volatile.disable = { index, turn: state.battle.turn ?? 0, turns: 4 }
    emitAbilityReveal(state.events, sourceSide(state), 'cursedbody', 'hit')
    state.events.push({
      type: 'volatile',
      side: target,
      effect: 'disable',
      cause: 'cursedbody',
    })
  }),
])

define(['cutecharm'], contactReaction('contact-infatuation', (state) => {
  const target = attackerSide(state)
  const sourceGender = sourceMon(state)?.gender
  const targetGender = state.battle[target]?.mon?.gender
  if (
    !target ||
    !sourceGender ||
    !targetGender ||
    sourceGender === targetGender
  )
    return
  if (!chance(random(state.battle), 0.3)) return
  state.battle[target].volatile ??= {}
  state.battle[target].volatile.infatuatedWith = sourceSide(state)
  emitAbilityReveal(state.events, sourceSide(state), 'cutecharm', 'contact')
  state.events.push({
    type: 'volatile',
    side: target,
    effect: 'infatuation',
    cause: 'cutecharm',
  })
}))

define(['earlybird'], [
  effect('beforeAction', 'sleep-counter', (state) => {
    if (
      (state.side ?? attackerSide(state)) !== sourceSide(state) ||
      sourceMon(state)?.status !== 'sleep'
    )
      return
    if (
      state.kind === 'sleep-counter-decrement' &&
      typeof state.value === 'number'
    )
      return state.value * 2
  }),
])

define(['heavymetal'], [
  effect('beforeAction', 'weight-modifier', (state) => {
    if (
      (state.side ?? attackerSide(state)) === sourceSide(state) &&
      state.kind === 'weight' &&
      typeof state.value === 'number'
    )
      return state.value * 2
  }),
])

define(['lightmetal'], [
  effect('beforeAction', 'weight-modifier', (state) => {
    if (
      (state.side ?? attackerSide(state)) === sourceSide(state) &&
      state.kind === 'weight' &&
      typeof state.value === 'number'
    )
      return state.value / 2
  }),
])

define(['liquidooze'], [
  effect(
    'afterDamage',
    'drain-reversal',
    (state) => {
      if (
        !ownDefense(state) ||
        state.kind !== 'drain' ||
        (state.value ?? 0) <= 0
      )
        return
      const target = attackerSide(state)
      if (!target) return
      emitAbilityReveal(state.events, sourceSide(state), 'liquidooze', 'drain')
      applyDamage(state.battle, target, Math.floor(state.value), state.events)
      return { value: 0, cancelled: true }
    },
    100,
  ),
])

define(['poisontouch'], [
  effect('afterDamage', 'contact-status-offense', (state) => {
    if (!ownAttack(state) || (state.damage ?? 0) <= 0) return
    if (!(state.contact ?? moveHasFlag(state.move, 'contact'))) return
    if (!chance(random(state.battle), 0.3)) return
    const target = defenderSide(state)
    if (target && inflictStatus(state, target, 'poison', 'poisontouch'))
      emitAbilityReveal(
        state.events,
        sourceSide(state),
        'poisontouch',
        'contact',
      )
  }),
])

define(['shielddust'], [
  effect(
    'afterHit',
    'secondary-effect-immunity',
    (state) => {
      if (
        state.kind === 'secondary-effect' &&
        state.targetSide === sourceSide(state) &&
        state.causeSide !== sourceSide(state)
      ) {
        emitAbilityReveal(
          state.events,
          sourceSide(state),
          'shielddust',
          'secondary-effect',
        )
        return { cancelled: true }
      }
    },
    100,
  ),
])

export const handlersForAbility = (abilityKey) =>
  abilityMap.get(abilityKey) ?? []

export const explicitAbilityKeys = () => [...abilityMap.keys()].sort()

export const abilityEffectFamilies = (abilityKey) =>
  handlersForAbility(abilityKey).map((handler) => handler.family)

export const abilityBreaksMold = (abilityKey) => MOLD_BREAKERS.has(abilityKey)

export const weatherIsSuppressed = (battle) =>
  ['player', 'foe'].some(
    (side) =>
      WEATHER_SUPPRESSORS.has(battle?.[side]?.mon?.ability) &&
      battle[side].mon.hp > 0,
  )
