import { effectiveSpeed } from './battleActor.mjs'
import { applyDamage, applyHeal, label, other, say } from './battleEvents.mjs'
import { item, species } from './data.mjs'
import { consumeHeldItem } from './heldItems.mjs'
import { isFainted, isImmuneToAilment } from './pokemon.mjs'
import { chance } from './rng.mjs'
import { battleSideOf, effectiveness, isGrounded } from './typechart.mjs'

const clampStage = (value) => Math.max(-6, Math.min(6, value))

const moveMakesContact = (move) => {
  if (move?.contact === false) return false
  if (move?.contact === true) return true
  if (move?.flags instanceof Set) return move.flags.has('contact')
  if (Array.isArray(move?.flags)) return move.flags.includes('contact')

  return Boolean(move?.flags?.contact)
}

const stage = (battle, side, stat, amount) => {
  const actor = battle[side]
  const before = actor.stages[stat] ?? 0
  const after = clampStage(before + amount)

  actor.stages[stat] = after
  return after !== before
}

const sourceSide = (state) => state.source?.side ?? null
const sourceMon = (state) => state.battle?.[sourceSide(state)]?.mon ?? null
const activeItem = (state, key) => sourceMon(state)?.heldItem === key

const sourceIs = (state, actor, key) => {
  if (!activeItem(state, key)) return false
  return battleSideOf(state.battle, actor) === sourceSide(state)
}

const announce = (state, key, text = null) => {
  const side = sourceSide(state)
  const name = item(key).name

  state.events.push({ type: 'item', action: 'activated', side, key })
  say(state.events, text ?? `${label(state.battle, side)}'s ${name} activated!`)
}

const consume = (state, key, cause) => {
  if (!activeItem(state, key)) return false
  announce(state, key)
  return consumeHeldItem(state.battle, sourceSide(state), cause, state.events)
}

const descriptor = (key, phase, handler, priority = 0) => ({
  sourceType: 'item',
  key,
  phase,
  priority,
  handler,
})

const healHolder = (state, key, amount, cause) => {
  const side = sourceSide(state)
  const mon = state.battle[side].mon

  if (!activeItem(state, key) || isFainted(mon) || mon.hp >= mon.stats.hp)
    return 0

  const healed = applyHeal(state.battle, side, amount, state.events)

  if (healed > 0) announce(state, key)
  if (healed > 0 && item(key).consumed)
    consumeHeldItem(state.battle, side, cause, state.events)

  return healed
}

const moveTypeItem = (key, moveKey, typeKey) =>
  descriptor(key, 'modifyMoveType', (state) => {
    if (!sourceIs(state, state.attacker, key)) return state.value
    if (state.move?.key !== moveKey) return state.value

    return item(key)[typeKey] ?? state.value
  })

const typePower = (key, multiplier = 1.2) =>
  descriptor(key, 'modifyPower', (state) => {
    const record = item(key)

    if (!sourceIs(state, state.attacker, key)) return state.value
    if (!record.boostType || state.move?.type !== record.boostType)
      return state.value

    return Math.floor(state.value * multiplier)
  })

const choiceHandlers = (key) => {
  const record = item(key)

  if (record.choiceStat === 'speed') {
    return [
      descriptor(key, 'modifySpeed', (state) => {
        if (!sourceIs(state, state.attacker, key)) return state.value
        return Math.floor(state.value * 1.5)
      }),
    ]
  }

  return [
    descriptor(key, 'modifyPower', (state) => {
      if (!sourceIs(state, state.attacker, key)) return state.value
      if (
        record.choiceStat === 'attack' &&
        state.move?.damageClass !== 'physical'
      )
        return state.value
      if (
        record.choiceStat === 'spAttack' &&
        state.move?.damageClass !== 'special'
      )
        return state.value

      return Math.floor(state.value * 1.5)
    }),
  ]
}

const leftovers = (key) =>
  descriptor(key, 'endTurn', (state) => {
    const mon = sourceMon(state)

    if (!activeItem(state, key) || isFainted(mon)) return

    healHolder(
      state,
      key,
      Math.max(1, Math.floor(mon.stats.hp / 16)),
      'leftovers',
    )
  })

const blackSludge = (key) =>
  descriptor(key, 'endTurn', (state) => {
    const side = sourceSide(state)
    const mon = sourceMon(state)

    if (!activeItem(state, key) || isFainted(mon)) return

    if (species(mon.species).types.includes('poison')) {
      healHolder(
        state,
        key,
        Math.max(1, Math.floor(mon.stats.hp / 16)),
        'black-sludge',
      )
      return
    }

    announce(state, key)
    applyDamage(
      state.battle,
      side,
      Math.max(1, Math.floor(mon.stats.hp / 8)),
      state.events,
    )
  })

const stickyBarb = (key) =>
  descriptor(key, 'endTurn', (state) => {
    const side = sourceSide(state)
    const mon = sourceMon(state)

    if (!activeItem(state, key) || isFainted(mon)) return

    announce(state, key)
    applyDamage(
      state.battle,
      side,
      Math.max(1, Math.floor(mon.stats.hp / 8)),
      state.events,
    )
  })

const lifeOrb = (key) => [
  descriptor(key, 'modifyPower', (state) => {
    if (!sourceIs(state, state.attacker, key)) return state.value
    if (state.move?.damageClass === 'status') return state.value

    return Math.floor(state.value * 1.3)
  }),
  descriptor(key, 'afterHit', (state) => {
    if (!sourceIs(state, state.attacker, key)) return
    if (
      !state.value ||
      state.value <= 0 ||
      state.move?.damageClass === 'status'
    )
      return

    const side = sourceSide(state)
    const mon = sourceMon(state)

    if (isFainted(mon)) return

    announce(state, key)
    applyDamage(
      state.battle,
      side,
      Math.max(1, Math.floor(mon.stats.hp / 10)),
      state.events,
    )
  }),
]

const airBalloon = (key) => [
  descriptor(
    key,
    'checkImmunity',
    (state) => {
      if (!sourceIs(state, state.defender, key)) return
      if (state.move?.type !== 'ground') return

      announce(
        state,
        key,
        `${label(state.battle, sourceSide(state))} floats above the Ground with its Air Balloon!`,
      )
      return { cancelled: true }
    },
    100,
  ),
  descriptor(key, 'afterDamage', (state) => {
    if (!sourceIs(state, state.defender, key) || !state.value) return

    consume(state, key, 'air-balloon')
  }),
]

const focusSash = (key) =>
  descriptor(
    key,
    'modifyDamage',
    (state) => {
      if (!sourceIs(state, state.defender, key)) return state.value

      const mon = sourceMon(state)

      if (mon.hp !== mon.stats.hp || state.value < mon.hp) return state.value

      consume(state, key, 'focus-sash')
      return Math.max(0, mon.hp - 1)
    },
    100,
  )

const focusBand = (key) =>
  descriptor(
    key,
    'modifyDamage',
    (state) => {
      if (!sourceIs(state, state.defender, key)) return state.value

      const mon = sourceMon(state)

      if (mon.hp <= 1 || state.value < mon.hp || !chance(state.battle.rng, 0.1))
        return state.value

      announce(state, key)
      return mon.hp - 1
    },
    90,
  )

const rockyHelmet = (key) =>
  descriptor(key, 'afterHit', (state) => {
    if (!sourceIs(state, state.defender, key)) return
    if (!state.value || state.value <= 0) return
    if (!moveMakesContact(state.move)) return

    const attackerSide = battleSideOf(state.battle, state.attacker)

    if (!attackerSide) return
    if (state.battle[attackerSide].mon.heldItem === 'protective-pads') return

    const mon = state.battle[attackerSide].mon

    if (isFainted(mon)) return

    announce(state, key)
    applyDamage(
      state.battle,
      attackerSide,
      Math.max(1, Math.floor(mon.stats.hp / 6)),
      state.events,
    )
  })

const shellBell = (key) =>
  descriptor(key, 'afterHit', (state) => {
    if (!sourceIs(state, state.attacker, key)) return
    if (!state.value || state.value <= 0) return

    healHolder(
      state,
      key,
      Math.max(1, Math.floor(state.value / 8)),
      'shell-bell',
    )
  })

const expertBelt = (key) =>
  descriptor(key, 'modifyPower', (state) => {
    if (!sourceIs(state, state.attacker, key)) return state.value

    const defenderSide = battleSideOf(state.battle, state.defender)

    if (!defenderSide) return state.value
    const mult = effectiveness(
      state.move.type,
      species(state.battle[defenderSide].mon.species).types,
    )

    return mult > 1 ? Math.floor(state.value * 1.2) : state.value
  })

const classBooster = (key, damageClass, multiplier) =>
  descriptor(key, 'modifyPower', (state) => {
    if (!sourceIs(state, state.attacker, key)) return state.value
    if (state.move?.damageClass !== damageClass) return state.value

    return Math.floor(state.value * multiplier)
  })

const defensiveMultiplier = (key, predicate, multiplier = 1.5) =>
  descriptor(key, 'modifyDamage', (state) => {
    if (!sourceIs(state, state.defender, key)) return state.value
    if (!predicate(state)) return state.value

    return Math.max(1, Math.floor(state.value / multiplier))
  })

const eviolite = (key) =>
  defensiveMultiplier(
    key,
    (state) => species(sourceMon(state).species).evolutions.length > 0,
  )

const assaultVest = (key) => [
  defensiveMultiplier(key, (state) => state.move?.damageClass === 'special'),
  descriptor(
    key,
    'beforeAction',
    (state) => {
      if (!sourceIs(state, state.attacker, key)) return
      if (state.move?.damageClass !== 'status') return

      announce(
        state,
        key,
        `${label(state.battle, sourceSide(state))} cannot use a status move while holding Assault Vest!`,
      )
      return { cancelled: true }
    },
    100,
  ),
]

const accuracyItem = (key, role, multiplier) =>
  descriptor(key, 'modifyAccuracy', (state) => {
    if (!sourceIs(state, state[role], key)) return state.value
    return state.value == null ? state.value : state.value * multiplier
  })

const zoomLens = (key) =>
  descriptor(key, 'modifyAccuracy', (state) => {
    if (!sourceIs(state, state.attacker, key)) return state.value
    if (!state.defender) return state.value
    if (effectiveSpeed(state.attacker) >= effectiveSpeed(state.defender))
      return state.value

    return state.value == null ? state.value : state.value * 1.2
  })

const quickClaw = (key) =>
  descriptor(
    key,
    'modifyPriority',
    (state) => {
      if (!sourceIs(state, state.attacker, key)) return state.value
      if (!chance(state.battle.rng, 0.2)) return state.value

      announce(state, key)
      return state.value + 0.1
    },
    50,
  )

const laggingItem = (key) =>
  descriptor(
    key,
    'modifyPriority',
    (state) => {
      if (!sourceIs(state, state.attacker, key)) return state.value
      return state.value - 0.1
    },
    -50,
  )

const ironBall = (key) =>
  descriptor(key, 'modifySpeed', (state) => {
    if (!sourceIs(state, state.attacker, key)) return state.value
    return Math.max(1, Math.floor(state.value / 2))
  })

const quickPowder = (key) =>
  descriptor(key, 'modifySpeed', (state) => {
    if (!sourceIs(state, state.attacker, key)) return state.value
    if (sourceMon(state).species !== 132) return state.value
    return state.value * 2
  })

const specialSpeciesPower = (key) =>
  descriptor(key, 'modifyPower', (state) => {
    if (!sourceIs(state, state.attacker, key)) return state.value

    const speciesId = sourceMon(state).species
    const move = state.move

    if (key === 'light-ball' && speciesId === 25)
      return Math.floor(state.value * 2)
    if (
      key === 'thick-club' &&
      [104, 105].includes(speciesId) &&
      move?.damageClass === 'physical'
    )
      return Math.floor(state.value * 2)
    if (
      key === 'deep-sea-tooth' &&
      speciesId === 366 &&
      move?.damageClass === 'special'
    )
      return Math.floor(state.value * 2)
    if (
      key === 'soul-dew' &&
      [380, 381].includes(speciesId) &&
      ['psychic', 'dragon'].includes(move?.type)
    )
      return Math.floor(state.value * 1.2)
    if (
      key === 'adamant-orb' &&
      speciesId === 483 &&
      ['steel', 'dragon'].includes(move?.type)
    )
      return Math.floor(state.value * 1.2)
    if (
      key === 'lustrous-orb' &&
      speciesId === 484 &&
      ['water', 'dragon'].includes(move?.type)
    )
      return Math.floor(state.value * 1.2)
    if (
      key === 'griseous-orb' &&
      speciesId === 487 &&
      ['ghost', 'dragon'].includes(move?.type)
    )
      return Math.floor(state.value * 1.2)

    return state.value
  })

const specialSpeciesDefense = (key) =>
  defensiveMultiplier(
    key,
    (state) => {
      const id = sourceMon(state).species

      if (key === 'deep-sea-scale')
        return id === 366 && state.move?.damageClass === 'special'

      return (
        key === 'metal-powder' &&
        id === 132 &&
        state.move?.damageClass === 'physical'
      )
    },
    2,
  )

const statusOrb = (key, status) =>
  descriptor(key, 'endTurn', (state) => {
    const side = sourceSide(state)
    const mon = sourceMon(state)

    if (!activeItem(state, key) || isFainted(mon) || mon.status) return
    if (isImmuneToAilment(mon, status)) return

    announce(state, key)
    mon.status = status
    mon.statusTurns = 0
    state.events.push({ type: 'status', side, status })
  })

const whiteHerb = (key) => {
  const use = (state) => {
    const side = sourceSide(state)

    if (!activeItem(state, key)) return

    const actor = state.battle[side]
    const negative = Object.entries(actor.stages).filter(
      ([, value]) => value < 0,
    )

    if (!negative.length) return

    for (const [stat] of negative) actor.stages[stat] = 0
    consume(state, key, 'white-herb')
  }

  return [
    descriptor(key, 'switchIn', use, 20),
    descriptor(key, 'endTurn', use, 20),
  ]
}

const mentalHerb = (key) => {
  const activate = (state) => {
    if (!activeItem(state, key)) return

    const volatile = state.battle[sourceSide(state)].volatile
    const blocked =
      volatile?.disable != null ||
      volatile?.tauntTurns > 0 ||
      volatile?.encoreTurns > 0 ||
      volatile?.torment === true ||
      volatile?.attract === true

    if (!blocked) return

    volatile.disable = null
    volatile.tauntTurns = 0
    volatile.encoreTurns = 0
    volatile.torment = false
    volatile.attract = false
    consume(state, key, 'mental-herb')
  }

  return [
    descriptor(key, 'beforeAction', activate, 200),
    descriptor(key, 'afterDamage', activate, 200),
    descriptor(key, 'endTurn', activate, 200),
  ]
}

const terrainSeed = (key) => {
  const activate = (state) => {
    const side = sourceSide(state)
    const seed = item(key).terrainSeed

    if (!activeItem(state, key) || !seed) return
    if (state.battle.field?.terrain?.key !== seed.terrain) return
    if (!isGrounded(state.battle, side)) return

    if (stage(state.battle, side, seed.stat, 1))
      consume(state, key, 'terrain-seed')
  }

  return [
    descriptor(key, 'battleStart', activate, 30),
    descriptor(key, 'switchIn', activate, 30),
  ]
}

const berryThreshold = (key, mon) => {
  if (key === 'oran-berry' || key === 'sitrus-berry')
    return mon.hp * 2 <= mon.stats.hp
  if (
    [
      'figy-berry',
      'wiki-berry',
      'mago-berry',
      'aguav-berry',
      'iapapa-berry',
    ].includes(key)
  )
    return mon.hp * 4 <= mon.stats.hp
  if (
    [
      'liechi-berry',
      'ganlon-berry',
      'salac-berry',
      'petaya-berry',
      'apicot-berry',
      'starf-berry',
      'lansat-berry',
      'micle-berry',
    ].includes(key)
  )
    return mon.hp * 4 <= mon.stats.hp

  return false
}

const berryRecovery = (key, state) => {
  const mon = sourceMon(state)

  if (!berryThreshold(key, mon)) return false

  if (key === 'oran-berry') return healHolder(state, key, 10, 'berry') > 0
  if (key === 'sitrus-berry')
    return (
      healHolder(
        state,
        key,
        Math.max(1, Math.floor(mon.stats.hp / 4)),
        'berry',
      ) > 0
    )
  if (
    [
      'figy-berry',
      'wiki-berry',
      'mago-berry',
      'aguav-berry',
      'iapapa-berry',
    ].includes(key)
  )
    return (
      healHolder(
        state,
        key,
        Math.max(1, Math.floor(mon.stats.hp / 2)),
        'berry',
      ) > 0
    )

  return false
}

const cureBerry = (key, state) => {
  const record = item(key)
  const side = sourceSide(state)
  const mon = sourceMon(state)

  if (!record.cureStatus) return false

  const confusion = state.battle[side].volatile?.confusion > 0
  const matches =
    record.cureStatus === 'all'
      ? Boolean(mon.status || confusion)
      : record.cureStatus === 'confusion'
        ? confusion
        : mon.status === record.cureStatus

  if (!matches) return false

  if (record.cureStatus === 'all' || record.cureStatus !== 'confusion') {
    if (record.cureStatus === 'all' || mon.status === record.cureStatus) {
      mon.status = null
      mon.statusTurns = 0
    }
  }
  if (record.cureStatus === 'all' || record.cureStatus === 'confusion') {
    if (state.battle[side].volatile) {
      state.battle[side].volatile.confusion = 0
      state.battle[side].volatile.confusionTurn = null
    }
  }

  consume(state, key, 'status-berry')
  return true
}

const statBerry = (key, state) => {
  const record = item(key)
  const mon = sourceMon(state)

  if (!record.boostStat || !berryThreshold(key, mon)) return false
  if (!stage(state.battle, sourceSide(state), record.boostStat, 1)) return false

  consume(state, key, 'stat-berry')
  return true
}

const leppaBerry = (key, state) => {
  if (key !== 'leppa-berry') return false

  const slot = sourceMon(state).moves.find((candidate) => candidate.pp <= 0)

  if (!slot) return false

  slot.pp = Math.min(slot.maxPp, slot.pp + 10)
  consume(state, key, 'leppa-berry')
  return true
}

const berryHandlers = (key) => {
  const handlers = []
  const record = item(key)
  const resistType =
    record.resistType ?? (key === 'chilan-berry' ? 'normal' : null)

  if (resistType) {
    handlers.push(
      descriptor(
        key,
        'modifyDamage',
        (state) => {
          if (!sourceIs(state, state.defender, key)) return state.value
          if (state.move?.type !== resistType) return state.value

          const defenderSide = sourceSide(state)
          const mult = effectiveness(
            state.move.type,
            species(state.battle[defenderSide].mon.species).types,
          )

          if (key !== 'chilan-berry' && mult <= 1) return state.value

          consume(state, key, 'resist-berry')
          return Math.max(1, Math.floor(state.value / 2))
        },
        80,
      ),
    )
  }

  handlers.push(
    descriptor(key, 'afterDamage', (state) => {
      if (!activeItem(state, key) || isFainted(sourceMon(state))) return
      if (berryRecovery(key, state)) return
      if (cureBerry(key, state)) return
      if (statBerry(key, state)) return
      leppaBerry(key, state)
    }),
    descriptor(key, 'endTurn', (state) => {
      if (!activeItem(state, key) || isFainted(sourceMon(state))) return
      if (berryRecovery(key, state)) return
      if (cureBerry(key, state)) return
      if (statBerry(key, state)) return
      leppaBerry(key, state)
    }),
  )

  if (key === 'kee-berry' || key === 'maranga-berry') {
    handlers.push(
      descriptor(
        key,
        'afterDamage',
        (state) => {
          if (!sourceIs(state, state.defender, key) || !state.value) return
          const expected = key === 'kee-berry' ? 'physical' : 'special'
          const statKey = key === 'kee-berry' ? 'defense' : 'spDefense'

          if (state.move?.damageClass !== expected) return
          if (stage(state.battle, sourceSide(state), statKey, 1))
            consume(state, key, 'defense-berry')
        },
        30,
      ),
    )
  }

  if (key === 'jaboca-berry' || key === 'rowap-berry') {
    handlers.push(
      descriptor(
        key,
        'afterDamage',
        (state) => {
          if (!sourceIs(state, state.defender, key) || !state.value) return
          const expected = key === 'jaboca-berry' ? 'physical' : 'special'
          if (state.move?.damageClass !== expected) return

          const attackerSide = battleSideOf(state.battle, state.attacker)
          if (!attackerSide) return
          const attacker = state.battle[attackerSide].mon

          consume(state, key, 'retaliation-berry')
          applyDamage(
            state.battle,
            attackerSide,
            Math.max(1, Math.floor(attacker.stats.hp / 8)),
            state.events,
          )
        },
        20,
      ),
    )
  }

  return handlers
}

const berryJuice = (key) =>
  descriptor(key, 'afterDamage', (state) => {
    const mon = sourceMon(state)

    if (!activeItem(state, key) || mon.hp * 2 > mon.stats.hp) return
    healHolder(state, key, 20, 'berry-juice')
  })

const weaknessPolicy = (key) =>
  descriptor(key, 'afterDamage', (state) => {
    if (!sourceIs(state, state.defender, key) || !state.value) return
    if (isFainted(sourceMon(state))) return

    const side = sourceSide(state)
    const mult = effectiveness(
      state.move.type,
      species(sourceMon(state).species).types,
    )

    if (mult <= 1) return

    const attackChanged = stage(state.battle, side, 'attack', 2)
    const specialChanged = stage(state.battle, side, 'spAttack', 2)

    if (attackChanged || specialChanged) consume(state, key, 'weakness-policy')
  })

const reactiveBooster = (key, type, statKey) =>
  descriptor(key, 'afterDamage', (state) => {
    if (!sourceIs(state, state.defender, key) || !state.value) return
    if (isFainted(sourceMon(state))) return
    if (state.move?.type !== type) return

    if (stage(state.battle, sourceSide(state), statKey, 1))
      consume(state, key, 'reactive-booster')
  })

const normalGem = (key) =>
  descriptor(
    key,
    'modifyPower',
    (state) => {
      if (!sourceIs(state, state.attacker, key)) return state.value
      if (state.move?.type !== 'normal' || state.move?.damageClass === 'status')
        return state.value

      consume(state, key, 'normal-gem')
      return Math.floor(state.value * 1.3)
    },
    40,
  )

const flinchItem = (key) =>
  descriptor(key, 'afterHit', (state) => {
    if (!sourceIs(state, state.attacker, key) || !state.value) return
    if (state.move?.damageClass === 'status') return
    if (!chance(state.battle.rng, 0.1)) return

    const defenderSide = other(sourceSide(state))
    const defender = state.battle[defenderSide]

    if (isFainted(defender.mon)) return
    defender.volatile.flinched = true
    announce(state, key)
  })

const HANDLER_BUILDERS = {
  'item:leftovers': (key) => [leftovers(key)],
  'item:blacksludge': (key) => [blackSludge(key)],
  'item:stickybarb': (key) => [stickyBarb(key)],
  'item:choice': choiceHandlers,
  'item:lifeorb': lifeOrb,
  'item:airballoon': airBalloon,
  'item:focussash': (key) => [focusSash(key)],
  'item:focusband': (key) => [focusBand(key)],
  'item:rockyhelmet': (key) => [rockyHelmet(key)],
  'item:shellbell': (key) => [shellBell(key)],
  'item:expertbelt': (key) => [expertBelt(key)],
  'item:muscleband': (key) => [classBooster(key, 'physical', 1.1)],
  'item:wiseglasses': (key) => [classBooster(key, 'special', 1.1)],
  'item:eviolite': (key) => [eviolite(key)],
  'item:assaultvest': assaultVest,
  'item:brightpowder': (key) => [accuracyItem(key, 'defender', 0.9)],
  'item:laxincense': (key) => [accuracyItem(key, 'defender', 0.9)],
  'item:widelens': (key) => [accuracyItem(key, 'attacker', 1.1)],
  'item:zoomlens': (key) => [zoomLens(key)],
  'item:quickclaw': (key) => [quickClaw(key)],
  'item:laggingtail': (key) => [laggingItem(key)],
  'item:fullincense': (key) => [laggingItem(key)],
  'item:ironball': (key) => [ironBall(key)],
  'item:quickpowder': (key) => [quickPowder(key)],
  'item:flameorb': (key) => [statusOrb(key, 'burn')],
  'item:toxicorb': (key) => [statusOrb(key, 'poison')],
  'item:whiteherb': whiteHerb,
  'item:mentalherb': mentalHerb,
  'item:electricseed': terrainSeed,
  'item:grassyseed': terrainSeed,
  'item:mistyseed': terrainSeed,
  'item:psychicseed': terrainSeed,
  'item:berry': berryHandlers,
  'item:berryjuice': (key) => [berryJuice(key)],
  'item:weaknesspolicy': (key) => [weaknessPolicy(key)],
  'item:absorbbulb': (key) => [reactiveBooster(key, 'water', 'spAttack')],
  'item:cellbattery': (key) => [reactiveBooster(key, 'electric', 'attack')],
  'item:luminousmoss': (key) => [reactiveBooster(key, 'water', 'spDefense')],
  'item:snowball': (key) => [reactiveBooster(key, 'ice', 'attack')],
  'item:normalgem': (key) => [normalGem(key)],
  'item:kingsrock': (key) => [flinchItem(key)],
  'item:razorfang': (key) => [flinchItem(key)],
  'item:lightball': (key) => [specialSpeciesPower(key)],
  'item:thickclub': (key) => [specialSpeciesPower(key)],
  'item:deepseatooth': (key) => [specialSpeciesPower(key)],
  'item:deepseascale': (key) => [specialSpeciesDefense(key)],
  'item:metalpowder': (key) => [specialSpeciesDefense(key)],
  'item:souldew': (key) => [specialSpeciesPower(key)],
  'item:adamantorb': (key) => [specialSpeciesPower(key)],
  'item:lustrousorb': (key) => [specialSpeciesPower(key)],
  'item:griseousorb': (key) => [specialSpeciesPower(key)],
  'item:memory': (key) => [moveTypeItem(key, 'multi-attack', 'memoryType')],
}

const TYPE_BOOSTER_HANDLERS = new Set([
  'item:blackbelt',
  'item:blackglasses',
  'item:charcoal',
  'item:dragonfang',
  'item:hardstone',
  'item:magnet',
  'item:metalcoat',
  'item:miracleseed',
  'item:mysticwater',
  'item:nevermeltice',
  'item:oddincense',
  'item:poisonbarb',
  'item:rockincense',
  'item:roseincense',
  'item:seaincense',
  'item:sharpbeak',
  'item:silkscarf',
  'item:silverpowder',
  'item:softsand',
  'item:spelltag',
  'item:twistedspoon',
  'item:type-plate',
  'item:waveincense',
])

const DURATION_ONLY_HANDLERS = new Set([
  'item:damprock',
  'item:heatrock',
  'item:smoothrock',
  'item:icyrock',
  'item:terrainextender',
])

export const itemHandlers = (itemKey) => {
  const record = item(itemKey)

  if (!record.held || record.status !== 'supported') return []
  if (record.handler === 'item:type-plate') {
    return [typePower(itemKey), moveTypeItem(itemKey, 'judgment', 'plateType')]
  }
  if (TYPE_BOOSTER_HANDLERS.has(record.handler)) return [typePower(itemKey)]
  if (DURATION_ONLY_HANDLERS.has(record.handler)) return []

  return HANDLER_BUILDERS[record.handler]?.(itemKey) ?? []
}

export const itemHandlersForSide = (itemKey, side) => {
  return itemHandlers(itemKey).map((effect) => ({ ...effect, side }))
}

export const heldFieldDuration = (battle, side, kind, key, turns = 5) => {
  const held = battle?.[side]?.mon?.heldItem

  if (!held) return turns
  const record = item(held)

  if (kind === 'weather' && record.weatherRock === key)
    return Math.max(turns, 8)
  if (kind === 'terrain' && record.handler === 'item:terrainextender')
    return Math.max(turns, 8)

  return turns
}

const DIRECT_ITEM_HANDLERS = new Set([
  'item:bigroot',
  'item:bindingband',
  'item:gripclaw',
  'item:luckypunch',
  'item:mega-stone',
  'item:primal-orb',
  'item:protectivepads',
  'item:razorclaw',
  'item:safetygoggles',
  'item:scopelens',
  'item:shedshell',
  'item:stick',
])

export const heldCriticalStage = (mon) => {
  if (['scope-lens', 'razor-claw'].includes(mon?.heldItem)) return 1
  if (mon?.heldItem === 'lucky-punch' && mon.species === 113) return 2
  if (mon?.heldItem === 'stick' && mon.species === 83) return 2

  return 0
}

export const heldDrainMultiplier = (mon) =>
  mon?.heldItem === 'big-root' ? 1.3 : 1

export const supportedHeldItemHandlers = () => {
  return new Set([
    ...Object.keys(HANDLER_BUILDERS),
    ...TYPE_BOOSTER_HANDLERS,
    ...DURATION_ONLY_HANDLERS,
    ...DIRECT_ITEM_HANDLERS,
  ])
}
