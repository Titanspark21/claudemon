import { describe, expect, test } from 'vitest'

import { createBattle } from './battle.mjs'
import { runBattleEffectPhase } from './battleEffects.mjs'
import { items, move as moveData } from './data.mjs'
import {
  heldCriticalStage,
  heldDrainMultiplier,
  heldFieldDuration,
  itemHandlers,
  itemHandlersForSide,
  supportedHeldItemHandlers,
} from './itemEffects.mjs'
import { createPokemon } from './pokemon.mjs'
import { makeRng } from './rng.mjs'
import { startTerrain } from './terrain.mjs'
import { startWeather } from './weather.mjs'

const makeMon = (species = 25, seed = species) =>
  createPokemon(species, 35, makeRng(seed))

const battleWith = (
  playerItem,
  foeItem = null,
  playerSpecies = 25,
  foeSpecies = 1,
) => {
  const player = makeMon(playerSpecies, 10)
  const foe = makeMon(foeSpecies, 20)

  player.heldItem = playerItem
  foe.heldItem = foeItem

  return createBattle({ playerMon: player, wildMon: foe, seed: 30 })
}

const move = (overrides = {}) => ({
  key: 'tackle',
  name: 'Tackle',
  type: 'normal',
  damageClass: 'physical',
  priority: 0,
  ...overrides,
})

describe('held-item power families', () => {
  test.each([
    ['charcoal', 'fire'],
    ['mystic-water', 'water'],
    ['miracle-seed', 'grass'],
    ['magnet', 'electric'],
    ['flame-plate', 'fire'],
  ])('%s boosts its matching type by 20%%', (key, type) => {
    const battle = battleWith(key)
    const result = runBattleEffectPhase(battle, 'modifyPower', {
      attacker: battle.player,
      defender: battle.foe,
      move: move({ type, damageClass: 'special' }),
      value: 100,
    })

    expect(result.value).toBe(120)
  })

  test('Choice Band boosts physical power while Choice Scarf boosts speed', () => {
    const band = battleWith('choice-band')
    const scarf = battleWith('choice-scarf')

    expect(
      runBattleEffectPhase(band, 'modifyPower', {
        attacker: band.player,
        defender: band.foe,
        move: move(),
        value: 100,
      }).value,
    ).toBe(150)
    expect(
      runBattleEffectPhase(scarf, 'modifySpeed', {
        attacker: scarf.player,
        value: 100,
      }).value,
    ).toBe(150)
  })

  test('Life Orb boosts damage and then recoils after a damaging hit', () => {
    const battle = battleWith('life-orb')
    const before = battle.player.mon.hp
    const events = []

    expect(
      runBattleEffectPhase(battle, 'modifyPower', {
        attacker: battle.player,
        defender: battle.foe,
        move: move(),
        value: 100,
        events,
      }).value,
    ).toBe(130)

    runBattleEffectPhase(battle, 'afterHit', {
      attacker: battle.player,
      defender: battle.foe,
      move: move(),
      value: 25,
      events,
    })

    expect(battle.player.mon.hp).toBeLessThan(before)
    expect(battle.player.mon.heldItem).toBe('life-orb')
  })

  test('Expert Belt boosts a super-effective attack', () => {
    const battle = battleWith('expert-belt', null, 4, 1)

    expect(
      runBattleEffectPhase(battle, 'modifyPower', {
        attacker: battle.player,
        defender: battle.foe,
        move: move({ type: 'fire', damageClass: 'special' }),
        value: 100,
      }).value,
    ).toBe(120)
  })

  test('species-specific orbs apply their Generation VII power boost', () => {
    const battle = battleWith('adamant-orb', null, 483, 1)

    expect(
      runBattleEffectPhase(battle, 'modifyPower', {
        attacker: battle.player,
        defender: battle.foe,
        move: move({ type: 'dragon', damageClass: 'special' }),
        value: 100,
      }).value,
    ).toBe(120)
  })
})

describe('held-item defensive and reactive families', () => {
  test('Focus Sash prevents a full-HP KO and is consumed exactly once', () => {
    const battle = battleWith(null, 'focus-sash')
    const hp = battle.foe.mon.hp
    const events = []

    const first = runBattleEffectPhase(battle, 'modifyDamage', {
      attacker: battle.player,
      defender: battle.foe,
      move: move(),
      value: hp + 50,
      events,
    })

    expect(first.value).toBe(hp - 1)
    expect(battle.foe.mon.heldItem).toBeNull()
    expect(battle.consumedHeldItems).toHaveLength(1)

    const second = runBattleEffectPhase(battle, 'modifyDamage', {
      attacker: battle.player,
      defender: battle.foe,
      move: move(),
      value: hp + 50,
      events,
    })

    expect(second.value).toBe(hp + 50)
    expect(battle.consumedHeldItems).toHaveLength(1)
  })

  test('Eviolite reduces incoming damage for a Pokémon that can evolve', () => {
    const battle = battleWith(null, 'eviolite', 4, 25)

    expect(
      runBattleEffectPhase(battle, 'modifyDamage', {
        attacker: battle.player,
        defender: battle.foe,
        move: move(),
        value: 100,
      }).value,
    ).toBe(66)
  })

  test('Rocky Helmet punishes contact without being consumed', () => {
    const battle = battleWith(null, 'rocky-helmet')
    const before = battle.player.mon.hp

    runBattleEffectPhase(battle, 'afterHit', {
      attacker: battle.player,
      defender: battle.foe,
      move: move({ contact: true }),
      value: 20,
      events: [],
    })

    expect(battle.player.mon.hp).toBeLessThan(before)
    expect(battle.foe.mon.heldItem).toBe('rocky-helmet')
  })

  test('Weakness Policy boosts both offenses and is consumed', () => {
    const battle = battleWith(null, 'weakness-policy', 4, 1)

    runBattleEffectPhase(battle, 'afterDamage', {
      attacker: battle.player,
      defender: battle.foe,
      move: move({ type: 'fire', damageClass: 'special' }),
      value: 20,
      events: [],
    })

    expect(battle.foe.stages.attack).toBe(2)
    expect(battle.foe.stages.spAttack).toBe(2)
    expect(battle.foe.mon.heldItem).toBeNull()
  })
})

describe('held-item direct and type-changing families', () => {
  test('every holdable supported item is wired to a phase or direct subsystem handler', () => {
    const handlers = supportedHeldItemHandlers()
    const unwired = Object.values(items()).filter(
      (record) => record.held && !handlers.has(record.handler),
    )

    expect(unwired).toEqual([])
  })

  test('Air Balloon grants Ground immunity and pops after taking damage', () => {
    const battle = battleWith(null, 'air-balloon')
    const events = []

    const immunity = runBattleEffectPhase(battle, 'checkImmunity', {
      attacker: battle.player,
      defender: battle.foe,
      move: move({ type: 'ground' }),
      events,
    })

    expect(immunity.cancelled).toBe(true)
    expect(battle.foe.mon.heldItem).toBe('air-balloon')

    runBattleEffectPhase(battle, 'afterDamage', {
      attacker: battle.player,
      defender: battle.foe,
      move: move({ type: 'normal' }),
      value: 10,
      events,
    })

    expect(battle.foe.mon.heldItem).toBeNull()
  })

  test('plates and memories change their signature move type', () => {
    const plate = battleWith('flame-plate')
    const memory = battleWith('fighting-memory')

    expect(
      runBattleEffectPhase(plate, 'modifyMoveType', {
        attacker: plate.player,
        defender: plate.foe,
        move: move({ key: 'judgment' }),
        value: 'normal',
      }).value,
    ).toBe('fire')
    expect(
      runBattleEffectPhase(memory, 'modifyMoveType', {
        attacker: memory.player,
        defender: memory.foe,
        move: move({ key: 'multi-attack' }),
        value: 'normal',
      }).value,
    ).toBe('fighting')
  })

  test('crit and drain direct helpers cover their simple battle modifiers', () => {
    const holder = makeMon(113)

    holder.heldItem = 'lucky-punch'
    expect(heldCriticalStage(holder)).toBe(2)

    holder.heldItem = 'big-root'
    expect(heldDrainMultiplier(holder)).toBe(1.3)
  })

  test('Zoom Lens only boosts accuracy when the holder is slower', () => {
    const battle = battleWith('zoom-lens')

    battle.player.mon.stats.speed = 10
    battle.foe.mon.stats.speed = 100

    expect(
      runBattleEffectPhase(battle, 'modifyAccuracy', {
        attacker: battle.player,
        defender: battle.foe,
        move: move(),
        value: 80,
      }).value,
    ).toBe(96)

    battle.player.mon.stats.speed = 200
    expect(
      runBattleEffectPhase(battle, 'modifyAccuracy', {
        attacker: battle.player,
        defender: battle.foe,
        move: move(),
        value: 80,
      }).value,
    ).toBe(80)
  })

  test('covers direct helper fallbacks and field-duration branches', () => {
    const holder = makeMon(25)

    holder.heldItem = 'scope-lens'
    expect(heldCriticalStage(holder)).toBe(1)
    holder.heldItem = 'razor-claw'
    expect(heldCriticalStage(holder)).toBe(1)
    holder.heldItem = 'stick'
    expect(heldCriticalStage(holder)).toBe(0)
    holder.species = 83
    expect(heldCriticalStage(holder)).toBe(2)
    holder.heldItem = null
    expect(heldCriticalStage(holder)).toBe(0)
    expect(heldDrainMultiplier(holder)).toBe(1)

    expect(itemHandlers('poke-ball')).toEqual([])
    expect(itemHandlers('light-clay')).toEqual([])

    const battle = battleWith(null)
    expect(heldFieldDuration(battle, 'player', 'weather', 'rain', 5)).toBe(5)
    battle.player.mon.heldItem = 'terrain-extender'
    expect(heldFieldDuration(battle, 'player', 'terrain', 'grassy', 5)).toBe(8)
    expect(heldFieldDuration(battle, 'player', 'weather', 'rain', 5)).toBe(5)
  })

  test('covers defensive and reactive item guard branches', () => {
    const sash = battleWith(null, 'focus-sash')
    sash.foe.mon.hp -= 1
    expect(
      runBattleEffectPhase(sash, 'modifyDamage', {
        attacker: sash.player,
        defender: sash.foe,
        move: move(),
        value: sash.foe.mon.hp + 10,
        events: [],
      }).value,
    ).toBe(sash.foe.mon.hp + 10)

    const helmet = battleWith('protective-pads', 'rocky-helmet')
    const before = helmet.player.mon.hp
    runBattleEffectPhase(helmet, 'afterHit', {
      attacker: helmet.player,
      defender: helmet.foe,
      move: move({ contact: true }),
      value: 20,
      events: [],
    })
    expect(helmet.player.mon.hp).toBe(before)

    helmet.player.mon.heldItem = null
    runBattleEffectPhase(helmet, 'afterHit', {
      attacker: helmet.player,
      defender: helmet.foe,
      move: move({ contact: false }),
      value: 20,
      events: [],
    })
    expect(helmet.player.mon.hp).toBe(before)

    const occa = battleWith(null, 'occa-berry', 1, 25)
    const resisted = runBattleEffectPhase(occa, 'modifyDamage', {
      attacker: occa.player,
      defender: occa.foe,
      move: move({ type: 'fire' }),
      value: 100,
      events: [],
    })
    expect(resisted.value).toBe(100)
    expect(occa.foe.mon.heldItem).toBe('occa-berry')
  })

  test('covers status, terrain, flinch, and missing-context guard branches', () => {
    const orb = battleWith('flame-orb', null, 4, 1)
    runBattleEffectPhase(orb, 'endTurn', { events: [] })
    expect(orb.player.mon.status).toBeNull()
    expect(orb.player.mon.heldItem).toBe('flame-orb')

    const seed = battleWith('grassy-seed', null, 16, 1)
    seed.field.terrain = { key: 'grassy', source: 'player', turns: 5 }
    runBattleEffectPhase(seed, 'switchIn', {
      attacker: seed.player,
      events: [],
    })
    expect(seed.player.mon.heldItem).toBe('grassy-seed')

    const flinch = battleWith('king-s-rock')
    flinch.rng = () => 1
    runBattleEffectPhase(flinch, 'afterHit', {
      attacker: flinch.player,
      defender: flinch.foe,
      move: move({ damageClass: 'status' }),
      value: 20,
      events: [],
    })
    runBattleEffectPhase(flinch, 'afterHit', {
      attacker: flinch.player,
      defender: flinch.foe,
      move: move(),
      value: 20,
      events: [],
    })
    expect(flinch.foe.volatile.flinched).toBeFalsy()

    const zoom = battleWith('zoom-lens')
    const [zoomEffect] = itemHandlersForSide('zoom-lens', 'player')
    expect(
      zoomEffect.handler({
        battle: zoom,
        source: zoomEffect,
        attacker: zoom.player,
        defender: null,
        move: move(),
        value: 80,
        events: [],
      }),
    ).toBe(80)

    const belt = battleWith('expert-belt')
    const [beltEffect] = itemHandlersForSide('expert-belt', 'player')
    expect(
      beltEffect.handler({
        battle: belt,
        source: beltEffect,
        attacker: belt.player,
        defender: {},
        move: move({ type: 'fire' }),
        value: 100,
        events: [],
      }),
    ).toBe(100)
  })

  test('covers inactive, fainted, and failed-trigger edge guards', () => {
    const lifeOrb = battleWith('life-orb')
    lifeOrb.player.mon.hp = 0
    runBattleEffectPhase(lifeOrb, 'afterHit', {
      attacker: lifeOrb.player,
      defender: lifeOrb.foe,
      move: move(),
      value: 20,
      events: [],
    })

    const helmet = battleWith(null, 'rocky-helmet')
    runBattleEffectPhase(helmet, 'afterHit', {
      attacker: helmet.player,
      defender: helmet.foe,
      move: move({ contact: true }),
      value: -1,
      events: [],
    })
    helmet.player.mon.hp = 0
    runBattleEffectPhase(helmet, 'afterHit', {
      attacker: helmet.player,
      defender: helmet.foe,
      move: move({ contact: true }),
      value: 20,
      events: [],
    })

    const [helmetEffect] = itemHandlersForSide('rocky-helmet', 'player')
    const detachedHelmet = battleWith('rocky-helmet')
    expect(() =>
      helmetEffect.handler({
        battle: detachedHelmet,
        source: helmetEffect,
        attacker: {},
        defender: detachedHelmet.player,
        move: move({ contact: true }),
        value: 20,
        events: [],
      }),
    ).not.toThrow()

    for (const [key, phase] of [
      ['white-herb', 'switchIn'],
      ['mental-herb', 'beforeAction'],
      ['grassy-seed', 'switchIn'],
      ['zoom-lens', 'modifyAccuracy'],
    ]) {
      const battle = battleWith(null)
      const effect = itemHandlersForSide(key, 'player').find(
        (candidate) => candidate.phase === phase,
      )

      expect(() =>
        effect.handler({
          battle,
          source: effect,
          attacker: battle.player,
          defender: battle.foe,
          move: move(),
          value: 80,
          events: [],
        }),
      ).not.toThrow()
    }

    const liechi = battleWith('liechi-berry')
    liechi.player.mon.hp = Math.floor(liechi.player.mon.stats.hp / 4)
    liechi.player.stages.attack = 6
    runBattleEffectPhase(liechi, 'afterDamage', {
      attacker: liechi.foe,
      defender: liechi.player,
      move: move(),
      value: 20,
      events: [],
    })
    expect(liechi.player.mon.heldItem).toBe('liechi-berry')

    const kee = battleWith('kee-berry')
    const keeEffect = itemHandlersForSide('kee-berry', 'player').at(-1)
    kee.player.stages.defense = 6
    keeEffect.handler({
      battle: kee,
      source: keeEffect,
      attacker: kee.foe,
      defender: kee.player,
      move: move({ damageClass: 'special' }),
      value: 20,
      events: [],
    })
    keeEffect.handler({
      battle: kee,
      source: keeEffect,
      attacker: kee.foe,
      defender: kee.player,
      move: move({ damageClass: 'physical' }),
      value: 20,
      events: [],
    })
    expect(kee.player.mon.heldItem).toBe('kee-berry')

    const policy = battleWith('weakness-policy')
    policy.player.mon.hp = 0
    runBattleEffectPhase(policy, 'afterDamage', {
      attacker: policy.foe,
      defender: policy.player,
      move: move({ type: 'fire' }),
      value: 20,
      events: [],
    })

    const neutralPolicy = battleWith('weakness-policy', null, 1, 4)
    runBattleEffectPhase(neutralPolicy, 'afterDamage', {
      attacker: neutralPolicy.foe,
      defender: neutralPolicy.player,
      move: move({ type: 'normal' }),
      value: 20,
      events: [],
    })
    expect(neutralPolicy.player.mon.heldItem).toBe('weakness-policy')

    const cappedPolicy = battleWith('weakness-policy', null, 1, 4)
    cappedPolicy.player.stages.attack = 6
    cappedPolicy.player.stages.spAttack = 6
    runBattleEffectPhase(cappedPolicy, 'afterDamage', {
      attacker: cappedPolicy.foe,
      defender: cappedPolicy.player,
      move: move({ type: 'fire' }),
      value: 20,
      events: [],
    })
    expect(cappedPolicy.player.mon.heldItem).toBe('weakness-policy')

    const bulb = battleWith('absorb-bulb')
    runBattleEffectPhase(bulb, 'afterDamage', {
      attacker: bulb.foe,
      defender: bulb.player,
      move: move({ type: 'fire' }),
      value: 20,
      events: [],
    })
    bulb.player.stages.spAttack = 6
    runBattleEffectPhase(bulb, 'afterDamage', {
      attacker: bulb.foe,
      defender: bulb.player,
      move: move({ type: 'water' }),
      value: 20,
      events: [],
    })
    expect(bulb.player.mon.heldItem).toBe('absorb-bulb')
  })

  test('generated move records preserve contact metadata for contact items', () => {
    expect(moveData('tackle').flags).toContain('contact')
    expect(moveData('ember').flags).not.toContain('contact')
  })
})

describe('held-item handler catalogue', () => {
  const speciesFor = (record) => {
    const specific = {
      'light-ball': 25,
      'thick-club': 104,
      'deep-sea-tooth': 366,
      'deep-sea-scale': 366,
      'metal-powder': 132,
      'quick-powder': 132,
      'soul-dew': 380,
      'adamant-orb': 483,
      'lustrous-orb': 484,
      'griseous-orb': 487,
      'black-sludge': 1,
      eviolite: 1,
    }

    return specific[record.key] ?? 25
  }

  const weakSpeciesFor = (type) =>
    ({
      fire: 1,
      water: 4,
      electric: 7,
      grass: 7,
      ice: 1,
      fighting: 19,
      poison: 1,
      ground: 25,
      flying: 1,
      psychic: 66,
      bug: 1,
      rock: 4,
      ghost: 92,
      dragon: 147,
      dark: 63,
      steel: 39,
      fairy: 147,
    })[type] ?? 25

  const moveFor = (record, effect) => {
    const reactiveTypes = {
      'item:absorbbulb': 'water',
      'item:cellbattery': 'electric',
      'item:luminousmoss': 'water',
      'item:snowball': 'ice',
      'item:weaknesspolicy': 'fire',
    }
    const specialTypes = {
      'soul-dew': 'psychic',
      'adamant-orb': 'dragon',
      'lustrous-orb': 'water',
      'griseous-orb': 'ghost',
    }
    const type =
      record.resistType ??
      record.boostType ??
      reactiveTypes[record.handler] ??
      specialTypes[record.key] ??
      'normal'
    const special =
      record.choiceStat === 'spAttack' ||
      [
        'deep-sea-tooth',
        'soul-dew',
        'adamant-orb',
        'lustrous-orb',
        'griseous-orb',
      ].includes(record.key) ||
      record.key === 'maranga-berry' ||
      record.key === 'rowap-berry' ||
      effect.phase === 'beforeAction'

    return move({
      key:
        record.handler === 'item:type-plate'
          ? 'judgment'
          : record.handler === 'item:memory'
            ? 'multi-attack'
            : 'tackle',
      type,
      damageClass: special ? 'special' : 'physical',
      contact: true,
    })
  }

  test('constructs and exercises every phase handler backed by supported item data', () => {
    const records = Object.values(items()).filter(
      (record) => record.held && record.status === 'supported',
    )
    let executed = 0

    for (const record of records) {
      const effects = itemHandlersForSide(record.key, 'player')

      for (const effect of effects) {
        const playerSpecies =
          record.handler === 'item:berry' && record.resistType
            ? weakSpeciesFor(record.resistType)
            : record.handler === 'item:weaknesspolicy'
              ? 1
              : speciesFor(record)
        const battle = battleWith(record.key, null, playerSpecies, 1)
        const mon = battle.player.mon

        battle.rng = () => 0
        mon.hp = Math.max(1, Math.floor(mon.stats.hp / 4))
        mon.status = null
        mon.statusTurns = 0
        mon.moves[0].pp = 0
        battle.player.stages.attack = -1
        battle.player.stages.defense = 0
        battle.player.stages.spAttack = 0
        battle.player.stages.spDefense = 0
        battle.player.stages.speed = 0
        battle.player.volatile.confusion = 0
        battle.player.volatile.disable = null

        if (record.cureStatus === 'confusion') {
          battle.player.volatile.confusion = 2
        } else if (record.cureStatus === 'all') {
          mon.status = 'sleep'
          battle.player.volatile.confusion = 2
        } else if (record.cureStatus) {
          mon.status = record.cureStatus
        }

        if (record.handler === 'item:mentalherb') {
          battle.player.volatile.disable = {
            index: 0,
            turn: battle.turn,
            turns: 4,
          }
        }

        if (record.terrainSeed) {
          battle.field.terrain = {
            key: record.terrainSeed.terrain,
            source: 'player',
            turns: 5,
          }
        }

        if (record.key === 'focus-sash' || record.key === 'focus-band') {
          mon.hp = mon.stats.hp
        }

        if (
          ['leftovers', 'shell-bell', 'berry-juice'].includes(record.key) &&
          mon.hp >= mon.stats.hp
        ) {
          mon.hp = Math.max(1, mon.stats.hp - 20)
        }

        const holderIsDefender = [
          'modifyDamage',
          'checkImmunity',
          'afterDamage',
        ].includes(effect.phase)
        const attacker = holderIsDefender ? battle.foe : battle.player
        const defender = holderIsDefender ? battle.player : battle.foe
        const selectedMove = moveFor(record, effect)
        const state = {
          battle,
          source: effect,
          attacker,
          defender,
          move: selectedMove,
          value:
            effect.phase === 'modifyDamage'
              ? mon.stats.hp + 20
              : effect.phase === 'afterDamage' || effect.phase === 'afterHit'
                ? 40
                : 100,
          events: [],
        }

        expect(() => effect.handler(state)).not.toThrow()
        executed++
      }
    }

    expect(executed).toBeGreaterThan(150)
  })

  test('exercises inactive and mismatched guard paths across the handler catalogue', () => {
    const records = Object.values(items()).filter(
      (record) => record.held && record.status === 'supported',
    )
    let guarded = 0

    for (const record of records) {
      const effects = itemHandlersForSide(record.key, 'player')

      for (const effect of effects) {
        const wrongSideBattle = battleWith(record.key)
        const wrongSideState = {
          battle: wrongSideBattle,
          source: effect,
          attacker: wrongSideBattle.foe,
          defender: wrongSideBattle.foe,
          move: move({
            key: 'splash',
            type: 'normal',
            damageClass: 'status',
            contact: false,
          }),
          value: 0,
          events: [],
        }

        wrongSideBattle.player.mon.hp = 0
        wrongSideBattle.player.stages.attack = 0
        wrongSideBattle.player.volatile.disable = null
        expect(() => effect.handler(wrongSideState)).not.toThrow()

        const mismatchBattle = battleWith(record.key)
        const holderIsDefender = [
          'modifyDamage',
          'checkImmunity',
          'afterDamage',
        ].includes(effect.phase)
        const mismatchState = {
          battle: mismatchBattle,
          source: effect,
          attacker: holderIsDefender
            ? mismatchBattle.foe
            : mismatchBattle.player,
          defender: holderIsDefender
            ? mismatchBattle.player
            : mismatchBattle.foe,
          move: move({
            key: 'splash',
            type: 'normal',
            damageClass: 'status',
            contact: false,
          }),
          value: effect.phase === 'modifyAccuracy' ? null : 0,
          events: [],
        }

        mismatchBattle.rng = () => 1
        mismatchBattle.player.mon.hp = mismatchBattle.player.mon.stats.hp
        mismatchBattle.player.mon.status = 'burn'
        mismatchBattle.player.mon.moves[0].pp =
          mismatchBattle.player.mon.moves[0].maxPp
        mismatchBattle.player.stages.attack = 0
        mismatchBattle.player.stages.defense = 6
        mismatchBattle.player.stages.spAttack = 6
        mismatchBattle.player.stages.spDefense = 6
        mismatchBattle.player.stages.speed = 6
        mismatchBattle.player.volatile.confusion = 0
        mismatchBattle.player.volatile.disable = null
        mismatchBattle.field.terrain = {
          key: 'electric',
          source: 'foe',
          turns: 5,
        }

        expect(() => effect.handler(mismatchState)).not.toThrow()
        guarded += 2
      }
    }

    expect(guarded).toBeGreaterThan(300)
  })
})

describe('held-item recovery, status, and field families', () => {
  test('Leftovers heals 1/16 at end of turn without consumption', () => {
    const battle = battleWith('leftovers')
    battle.player.mon.hp -= 30
    const before = battle.player.mon.hp

    runBattleEffectPhase(battle, 'endTurn', { events: [] })

    expect(battle.player.mon.hp).toBeGreaterThan(before)
    expect(battle.player.mon.heldItem).toBe('leftovers')
  })

  test('Sitrus Berry heals at half HP and consumes itself', () => {
    const battle = battleWith(null, 'sitrus-berry')
    const mon = battle.foe.mon

    mon.hp = Math.floor(mon.stats.hp / 2)
    const before = mon.hp

    runBattleEffectPhase(battle, 'afterDamage', {
      attacker: battle.player,
      defender: battle.foe,
      move: move(),
      value: 10,
      events: [],
    })

    expect(mon.hp).toBeGreaterThan(before)
    expect(mon.heldItem).toBeNull()
  })

  test('Lum Berry immediately clears confusion and consumes itself', () => {
    const battle = battleWith(null, 'lum-berry')

    battle.foe.volatile.confusion = 3
    battle.foe.volatile.confusionTurn = battle.turn

    runBattleEffectPhase(battle, 'afterDamage', {
      attacker: battle.player,
      defender: battle.foe,
      move: move({ damageClass: 'status' }),
      value: 0,
      events: [],
    })

    expect(battle.foe.volatile.confusion).toBe(0)
    expect(battle.foe.volatile.confusionTurn).toBeNull()
    expect(battle.foe.mon.heldItem).toBeNull()
  })

  test('Mental Herb clears Disable and consumes itself immediately', () => {
    const battle = battleWith(null, 'mental-herb')

    battle.foe.volatile.disable = { index: 0, turn: battle.turn, turns: 4 }

    runBattleEffectPhase(battle, 'afterDamage', {
      attacker: battle.player,
      defender: battle.foe,
      move: move({ damageClass: 'status' }),
      value: 0,
      events: [],
    })

    expect(battle.foe.volatile.disable).toBeNull()
    expect(battle.foe.mon.heldItem).toBeNull()
  })

  test('Flame Orb inflicts burn at end of turn', () => {
    const battle = battleWith('flame-orb', null, 25, 1)

    runBattleEffectPhase(battle, 'endTurn', { events: [] })

    expect(battle.player.mon.status).toBe('burn')
    expect(battle.player.mon.heldItem).toBe('flame-orb')
  })

  test('White Herb resets negative stages once and is consumed', () => {
    const battle = battleWith('white-herb')

    battle.player.stages.attack = -2
    battle.player.stages.speed = 1

    runBattleEffectPhase(battle, 'endTurn', { events: [] })

    expect(battle.player.stages.attack).toBe(0)
    expect(battle.player.stages.speed).toBe(1)
    expect(battle.player.mon.heldItem).toBeNull()
  })

  test('terrain seed triggers when the holder is grounded on matching terrain', () => {
    const battle = battleWith('grassy-seed')

    startTerrain(battle, 'grassy', 'player')
    runBattleEffectPhase(battle, 'switchIn', {
      attacker: battle.player,
      events: [],
    })

    expect(battle.player.stages.defense).toBe(1)
    expect(battle.player.mon.heldItem).toBeNull()
  })

  test('weather rocks extend matching weather to eight turns', () => {
    const battle = battleWith('damp-rock')
    const [event] = startWeather(battle, 'rain', 'player', 5)

    expect(event.turns).toBe(8)
    expect(battle.field.weather.turns).toBe(8)
  })
})
