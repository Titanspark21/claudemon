import { describe, expect, test } from 'vitest'

import { refreshAbilityEffects, supportedAbilityKeys } from './abilities.mjs'
import {
  emitAbilityReveal,
  handlersForAbility,
  moveHasFlag,
} from './abilityEffects.mjs'
import {
  createBattle as createLiveBattle,
  submitAction,
  switchIn as liveSwitchIn,
} from './battle.mjs'
import { createBattleField } from './battleField.mjs'
import { runEffectPhase } from './effects.mjs'
import { createPokemon } from './pokemon.mjs'
import { makeRng } from './rng.mjs'

const stages = () => ({
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0,
  accuracy: 0,
  evasion: 0,
})

const actor = (species, ability, overrides = {}) => ({
  mon: {
    species,
    ability,
    hp: 100,
    stats: {
      hp: 100,
      attack: 90,
      defense: 80,
      spAttack: 100,
      spDefense: 90,
      speed: 100,
    },
    heldItem: null,
    status: null,
    ...overrides,
  },
  stages: stages(),
  volatile: {},
})

const battle = (playerAbility, foeAbility = 'keeneye', options = {}) => {
  const current = {
    player: actor(25, playerAbility, options.playerMon),
    foe: actor(16, foeAbility, options.foeMon),
    effects: [],
    field: createBattleField(),
    rng: options.rng ?? makeRng(1),
  }
  refreshAbilityEffects(current)
  return current
}

const move = (key, type, damageClass = 'special', extra = {}) => ({
  key,
  name: key,
  type,
  power: 80,
  priority: 0,
  damageClass,
  ...extra,
})

const phase = (current, name, context = {}) =>
  runEffectPhase(current, name, { events: [], ...context })

describe('switch-in archetypes', () => {
  test.each([
    ['drizzle', 'weather', 'rain'],
    ['drought', 'weather', 'sun'],
    ['sandstream', 'weather', 'sandstorm'],
    ['snowwarning', 'weather', 'hail'],
    ['electricsurge', 'terrain', 'electric'],
    ['grassysurge', 'terrain', 'grassy'],
    ['mistysurge', 'terrain', 'misty'],
    ['psychicsurge', 'terrain', 'psychic'],
  ])(
    'Should activate %s as a %s switch-in field effect',
    (ability, kind, expected) => {
      const current = battle(ability)
      const result = phase(current, 'switchIn', { side: 'player' })

      expect(current.field[kind]?.key).toBe(expected)
      expect(result.events).toContainEqual({
        type: 'ability',
        side: 'player',
        ability,
        cause: 'switch-in',
      })
    },
  )

  test('Should lower the opposing Attack with Intimidate', () => {
    const current = battle('intimidate')

    phase(current, 'switchIn', { side: 'player' })

    expect(current.foe.stages.attack).toBe(-1)
  })

  test('Should choose Download from the opposing weaker defensive stat', () => {
    const current = battle('download', 'keeneye', {
      foeMon: {
        stats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 120,
          speed: 80,
        },
      },
    })

    phase(current, 'switchIn', { side: 'player' })

    expect(current.player.stages.attack).toBe(1)
    expect(current.player.stages.spAttack).toBe(0)
  })
})

describe('immunity archetypes', () => {
  test.each([
    ['immunity', 'poison'],
    ['insomnia', 'sleep'],
    ['limber', 'paralysis'],
    ['magmaarmor', 'freeze'],
    ['waterveil', 'burn'],
    ['innerfocus', 'flinch'],
    ['owntempo', 'confusion'],
  ])('Should have %s cancel %s', (ability, status) => {
    const current = battle('static', ability)
    const result = phase(current, 'tryStatus', {
      attacker: 'player',
      defender: 'foe',
      value: status,
      status,
    })

    expect(result.cancelled).toBe(true)
  })

  test('Should have Leaf Guard block status only under sun', () => {
    const current = battle('static', 'leafguard')

    let result = phase(current, 'tryStatus', {
      attacker: 'player',
      defender: 'foe',
      value: 'poison',
      status: 'poison',
    })
    expect(result.cancelled).toBe(false)

    current.field.weather = { key: 'sun', turns: 5, source: 'test' }
    result = phase(current, 'tryStatus', {
      attacker: 'player',
      defender: 'foe',
      value: 'poison',
      status: 'poison',
    })
    expect(result.cancelled).toBe(true)
  })

  test.each([
    ['levitate', move('earthquake', 'ground', 'physical')],
    ['soundproof', move('hyper-voice', 'normal')],
    ['bulletproof', move('shadow-ball', 'ghost')],
  ])('Should cancel a move through %s', (ability, usedMove) => {
    const current = battle('static', ability)
    const result = phase(current, 'checkImmunity', {
      attacker: 'player',
      defender: 'foe',
      move: usedMove,
    })

    expect(result.cancelled).toBe(true)
  })

  test.each([
    ['voltabsorb', 'electric', 'hp'],
    ['waterabsorb', 'water', 'hp'],
    ['lightningrod', 'electric', 'spAttack'],
    ['stormdrain', 'water', 'spAttack'],
    ['motordrive', 'electric', 'speed'],
    ['sapsipper', 'grass', 'attack'],
  ])(
    'Should absorb %s through %s and apply its reaction',
    (ability, type, outcome) => {
      const current = battle('static', ability, { foeMon: { hp: 50 } })
      const before =
        outcome === 'hp' ? current.foe.mon.hp : current.foe.stages[outcome]
      const result = phase(current, 'checkImmunity', {
        attacker: 'player',
        defender: 'foe',
        move: move('fixture', type),
      })

      expect(result.cancelled).toBe(true)
      if (outcome === 'hp') expect(current.foe.mon.hp).toBeGreaterThan(before)
      else expect(current.foe.stages[outcome]).toBeGreaterThan(before)
    },
  )
})

describe('move-property and modifier archetypes', () => {
  test.each([
    ['aerilate', 'flying'],
    ['galvanize', 'electric'],
    ['pixilate', 'fairy'],
    ['refrigerate', 'ice'],
  ])(
    'Should have %s convert Normal moves to %s and boost them',
    (ability, type) => {
      const current = battle(ability)
      const usedMove = move('tackle', 'normal', 'physical', { power: 40 })

      expect(
        phase(current, 'modifyMoveType', {
          attacker: 'player',
          defender: 'foe',
          move: usedMove,
          value: 'normal',
        }).value,
      ).toBe(type)
      expect(
        phase(current, 'modifyPower', {
          attacker: 'player',
          defender: 'foe',
          move: usedMove,
          value: 40,
        }).value,
      ).toBe(48)
    },
  )

  test('Should have Liquid Voice convert sound moves without adding a power boost', () => {
    const current = battle('liquidvoice')
    const usedMove = move('hyper-voice', 'normal')

    expect(
      phase(current, 'modifyMoveType', {
        attacker: 'player',
        defender: 'foe',
        move: usedMove,
        value: 'normal',
      }).value,
    ).toBe('water')
  })

  test.each([
    ['technician', move('tackle', 'normal', 'physical', { power: 40 }), 40, 60],
    ['ironfist', move('fire-punch', 'fire', 'physical'), 80, 96],
    ['strongjaw', move('bite', 'dark', 'physical'), 80, 120],
    ['megalauncher', move('dark-pulse', 'dark'), 80, 120],
    [
      'reckless',
      move('wild-charge', 'electric', 'physical', { drain: -25 }),
      80,
      96,
    ],
    ['steelworker', move('iron-head', 'steel', 'physical'), 80, 120],
  ])(
    'Should apply the %s shared power modifier',
    (ability, usedMove, base, expected) => {
      const current = battle(ability)
      expect(
        phase(current, 'modifyPower', {
          attacker: 'player',
          defender: 'foe',
          move: usedMove,
          value: base,
        }).value,
      ).toBe(expected)
    },
  )

  test.each([
    ['blaze', 'fire'],
    ['overgrow', 'grass'],
    ['swarm', 'bug'],
    ['torrent', 'water'],
  ])('Should activate %s only at one-third HP or lower', (ability, type) => {
    const current = battle(ability, 'keeneye', { playerMon: { hp: 33 } })
    expect(
      phase(current, 'modifyPower', {
        attacker: 'player',
        defender: 'foe',
        move: move('fixture', type),
        value: 80,
      }).value,
    ).toBe(120)
  })

  test.each([
    ['chlorophyll', 'sun'],
    ['swiftswim', 'rain'],
    ['sandrush', 'sandstorm'],
    ['slushrush', 'hail'],
  ])('Should double Speed for %s in %s', (ability, weather) => {
    const current = battle(ability)
    current.field.weather = { key: weather, turns: 5, source: 'test' }

    expect(
      phase(current, 'modifySpeed', { side: 'player', value: 100 }).value,
    ).toBe(200)
  })

  test('Should double Surge Surfer Speed on Electric Terrain', () => {
    const current = battle('surgesurfer')
    current.field.terrain = { key: 'electric', turns: 5, source: 'test' }
    expect(
      phase(current, 'modifySpeed', { side: 'player', value: 100 }).value,
    ).toBe(200)
  })

  test.each([
    ['filter', { effectiveness: 2 }, 100, 75],
    ['solidrock', { effectiveness: 4 }, 100, 75],
    ['prismarmor', { effectiveness: 2 }, 100, 75],
    ['multiscale', {}, 100, 50],
    ['shadowshield', {}, 100, 50],
    ['thickfat', { move: move('flamethrower', 'fire') }, 100, 50],
  ])(
    'Should apply %s incoming damage reduction',
    (ability, extra, base, expected) => {
      const current = battle('static', ability)
      expect(
        phase(current, 'modifyDamage', {
          attacker: 'player',
          defender: 'foe',
          move: move('fixture', 'normal'),
          value: base,
          ...extra,
        }).value,
      ).toBe(expected)
    },
  )

  test('Should have Wonder Guard block neutral damage but not super-effective damage', () => {
    const current = battle('static', 'wonderguard')
    let result = phase(current, 'checkImmunity', {
      attacker: 'player',
      defender: 'foe',
      move: move('tackle', 'normal', 'physical'),
      effectiveness: 1,
    })
    expect(result.cancelled).toBe(true)

    result = phase(current, 'checkImmunity', {
      attacker: 'player',
      defender: 'foe',
      move: move('thunderbolt', 'electric'),
      effectiveness: 2,
    })
    expect(result.cancelled).toBe(false)
  })

  test('Should ignore Levitate when Mold Breaker is attacking', () => {
    const current = battle('moldbreaker', 'levitate')
    const result = phase(current, 'checkImmunity', {
      attacker: 'player',
      defender: 'foe',
      move: move('earthquake', 'ground', 'physical'),
    })
    expect(result.cancelled).toBe(false)
  })
})

describe('reaction and lifecycle archetypes', () => {
  test('Should damage contact attackers with Rough Skin', () => {
    const current = battle('static', 'roughskin')
    const result = phase(current, 'afterDamage', {
      attacker: 'player',
      defender: 'foe',
      move: move('tackle', 'normal', 'physical'),
      damage: 20,
      contact: true,
    })

    expect(current.player.mon.hp).toBe(88)
    expect(result.events).toContainEqual({
      type: 'damage',
      side: 'player',
      amount: 12,
      hpAfter: 88,
    })
  })

  test('Should inflict deterministic contact status from Static', () => {
    const current = battle('static', 'static', { rng: () => 0 })
    phase(current, 'afterDamage', {
      attacker: 'player',
      defender: 'foe',
      move: move('tackle', 'normal', 'physical'),
      damage: 20,
      contact: true,
    })
    expect(current.player.mon.status).toBe('paralysis')
  })

  test('Should lower contact attacker Speed with Gooey', () => {
    const current = battle('static', 'gooey')
    phase(current, 'afterDamage', {
      attacker: 'player',
      defender: 'foe',
      move: move('tackle', 'normal', 'physical'),
      damage: 20,
      contact: true,
    })
    expect(current.player.stages.speed).toBe(-1)
  })

  test('Should replace a contact attacker ability with Mummy', () => {
    const current = battle('static', 'mummy')
    phase(current, 'afterDamage', {
      attacker: 'player',
      defender: 'foe',
      move: move('tackle', 'normal', 'physical'),
      damage: 20,
      contact: true,
    })
    expect(current.player.mon.ability).toBe('mummy')
  })

  test('Should trigger Berserk exactly when crossing half HP', () => {
    const current = battle('static', 'berserk', { foeMon: { hp: 45 } })
    phase(current, 'afterDamage', {
      attacker: 'player',
      defender: 'foe',
      move: move('tackle', 'normal'),
      damage: 15,
      hpBefore: 60,
    })
    expect(current.foe.stages.spAttack).toBe(1)
  })

  test.each([
    ['stamina', 'defense', 1],
    ['watercompaction', 'defense', 2],
  ])('Should trigger %s after qualifying damage', (ability, stat, delta) => {
    const current = battle('static', ability)
    phase(current, 'afterDamage', {
      attacker: 'player',
      defender: 'foe',
      move: move('water-gun', 'water'),
      damage: 20,
    })
    expect(current.foe.stages[stat]).toBe(delta)
  })

  test('Should apply Weak Armor Defense and Speed changes after a physical hit', () => {
    const current = battle('static', 'weakarmor')
    phase(current, 'afterDamage', {
      attacker: 'player',
      defender: 'foe',
      move: move('tackle', 'normal', 'physical'),
      damage: 20,
    })
    expect(current.foe.stages.defense).toBe(-1)
    expect(current.foe.stages.speed).toBe(2)
  })

  test('Should heal Rain Dish and damage Solar Power at end turn', () => {
    const rain = battle('raindish', 'keeneye', { playerMon: { hp: 50 } })
    rain.field.weather = { key: 'rain', turns: 5, source: 'test' }
    phase(rain, 'endTurn')
    expect(rain.player.mon.hp).toBe(56)

    const sun = battle('solarpower', 'keeneye', { playerMon: { hp: 100 } })
    sun.field.weather = { key: 'sun', turns: 5, source: 'test' }
    phase(sun, 'endTurn')
    expect(sun.player.mon.hp).toBe(88)
  })

  test('Should cure status with Hydration in rain', () => {
    const current = battle('hydration', 'keeneye', {
      playerMon: { status: 'burn' },
    })
    current.field.weather = { key: 'rain', turns: 5, source: 'test' }
    phase(current, 'endTurn')
    expect(current.player.mon.status).toBeNull()
  })

  test('Should heal Regenerator and cure Natural Cure on switch-out', () => {
    const regen = battle('regenerator', 'keeneye', { playerMon: { hp: 40 } })
    phase(regen, 'switchOut', { side: 'player' })
    expect(regen.player.mon.hp).toBe(73)

    const cure = battle('naturalcure', 'keeneye', {
      playerMon: { status: 'poison' },
    })
    phase(cure, 'switchOut', { side: 'player' })
    expect(cure.player.mon.status).toBeNull()
  })

  test('Should raise Moxie after a user-caused foe faint', () => {
    const current = battle('moxie')
    phase(current, 'faint', {
      faintedSide: 'foe',
      causedBy: 'player',
      attacker: 'player',
    })
    expect(current.player.stages.attack).toBe(1)
  })

  test('Should raise the highest raw stat with Beast Boost', () => {
    const current = battle('beastboost')
    current.player.mon.stats.spAttack = 150
    phase(current, 'faint', {
      faintedSide: 'foe',
      causedBy: 'player',
      attacker: 'player',
    })
    expect(current.player.stages.spAttack).toBe(1)
  })

  test('Should let Soul-Heart react when another Pokemon faints', () => {
    const current = battle('soulheart')
    phase(current, 'faint', { faintedSide: 'foe', causedBy: 'foe' })
    expect(current.player.stages.spAttack).toBe(1)
  })

  test('Should heal Cheek Pouch after a Berry is consumed', () => {
    const current = battle('cheekpouch', 'keeneye', { playerMon: { hp: 40 } })
    phase(current, 'consumeItem', {
      side: 'player',
      itemOwnerSide: 'player',
      itemKind: 'berry',
      itemKey: 'oran-berry',
      consumed: true,
    })
    expect(current.player.mon.hp).toBe(73)
  })

  test('Should double Unburden Speed after item loss and reset it on switching', () => {
    const current = battle('unburden')
    phase(current, 'consumeItem', {
      side: 'player',
      itemOwnerSide: 'player',
      lost: true,
    })
    expect(
      phase(current, 'modifySpeed', { side: 'player', value: 100 }).value,
    ).toBe(200)

    phase(current, 'switchOut', { side: 'player' })
    expect(
      phase(current, 'modifySpeed', { side: 'player', value: 100 }).value,
    ).toBe(100)
  })
})

describe('one-off state and interaction fixtures', () => {
  test('Should have Protean change battle typing before the move', () => {
    const current = battle('protean')
    const result = phase(current, 'beforeAction', {
      attacker: 'player',
      defender: 'foe',
      move: move('water-gun', 'water'),
      action: { type: 'move' },
    })

    expect(current.player.mon.battleTypes).toEqual(['water'])
    expect(result.events).toContainEqual({
      type: 'type-change',
      side: 'player',
      types: ['water'],
    })
  })

  test('Should run Slow Start for five end turns', () => {
    const current = battle('slowstart')
    phase(current, 'switchIn', { side: 'player' })

    expect(
      phase(current, 'modifySpeed', { side: 'player', value: 100 }).value,
    ).toBe(50)
    for (let turn = 0; turn < 5; turn++) phase(current, 'endTurn')
    expect(
      phase(current, 'modifySpeed', { side: 'player', value: 100 }).value,
    ).toBe(100)
  })

  test('Should have Prankster, Gale Wings and Triage use distinct priority archetypes', () => {
    const prankster = battle('prankster')
    expect(
      phase(prankster, 'modifyPriority', {
        attacker: 'player',
        defender: 'foe',
        move: move('growl', 'normal', 'status'),
        value: 0,
      }).value,
    ).toBe(1)

    const gale = battle('galewings')
    expect(
      phase(gale, 'modifyPriority', {
        attacker: 'player',
        defender: 'foe',
        move: move('wing-attack', 'flying', 'physical'),
        value: 0,
      }).value,
    ).toBe(1)

    const triage = battle('triage')
    expect(
      phase(triage, 'modifyPriority', {
        attacker: 'player',
        defender: 'foe',
        move: move('recover', 'normal', 'status'),
        value: 0,
      }).value,
    ).toBe(3)
  })

  test('Should have Queenly Majesty cancel opposing priority', () => {
    const current = battle('static', 'queenlymajesty')
    const result = phase(current, 'modifyPriority', {
      attacker: 'player',
      defender: 'foe',
      move: move('quick-attack', 'normal', 'physical', { priority: 1 }),
      value: 1,
    })
    expect(result.cancelled).toBe(true)
  })

  test('Should make stat-delta handlers composable for Contrary, Simple and Clear Body', () => {
    const contrary = battle('contrary')
    expect(
      phase(contrary, 'afterHit', {
        kind: 'stat-change',
        targetSide: 'player',
        causeSide: 'foe',
        value: -1,
      }).value,
    ).toBe(1)

    const simple = battle('simple')
    expect(
      phase(simple, 'afterHit', {
        kind: 'stat-change',
        targetSide: 'player',
        causeSide: 'foe',
        value: 1,
      }).value,
    ).toBe(2)

    const clear = battle('clearbody')
    expect(
      phase(clear, 'afterHit', {
        kind: 'stat-change',
        targetSide: 'player',
        causeSide: 'foe',
        value: -1,
      }).cancelled,
    ).toBe(true)
  })

  test('Should switch the active handler set after Mega-style ability replacement', () => {
    const current = battle('blaze')
    current.player.mon.hp = 30
    const fire = move('ember', 'fire')
    const water = move('water-gun', 'water')

    expect(
      phase(current, 'modifyPower', {
        attacker: 'player',
        defender: 'foe',
        move: fire,
        value: 40,
      }).value,
    ).toBe(60)

    current.player.mon.ability = 'torrent'
    refreshAbilityEffects(current)

    expect(
      phase(current, 'modifyPower', {
        attacker: 'player',
        defender: 'foe',
        move: fire,
        value: 40,
      }).value,
    ).toBe(40)
    expect(
      phase(current, 'modifyPower', {
        attacker: 'player',
        defender: 'foe',
        move: water,
        value: 40,
      }).value,
    ).toBe(60)
  })

  test('Should keep deterministic random reactions under a seeded RNG', () => {
    const first = battle('static', 'effectspore', { rng: makeRng(7) })
    const second = battle('static', 'effectspore', { rng: makeRng(7) })

    const run = (current) =>
      phase(current, 'afterDamage', {
        attacker: 'player',
        defender: 'foe',
        move: move('tackle', 'normal', 'physical'),
        damage: 10,
        contact: true,
      }).events

    expect(run(first)).toEqual(run(second))
    expect(first.player.mon.status).toBe(second.player.mon.status)
  })
})

const liveMon = (id, ability, moveKey, seed = 1) => {
  const mon = createPokemon(id, 50, makeRng(seed))
  mon.ability = ability
  mon.moves = [{ move: moveKey, pp: 20, maxPp: 20 }]
  mon.status = null
  mon.statusTurns = 0
  return mon
}

const coverageMove = (type, damageClass = 'physical') => ({
  key: type === 'normal' ? 'tackle' : `${type}-fixture`,
  id: type === 'normal' ? 'tackle' : `${type}-fixture`,
  name: `${type} fixture`,
  type,
  power: 50,
  priority: 1,
  damageClass,
  accuracy: 90,
  minHits: 2,
  maxHits: 5,
  drain: -25,
  healing: 50,
  ailmentChance: 30,
  statChance: 30,
  flinchChance: 30,
  flags: {
    contact: true,
    sound: true,
    bullet: true,
    punch: true,
    bite: true,
    pulse: true,
    powder: true,
    recoil: true,
    heal: true,
  },
})

const handlerCoverageState = (
  ability,
  handler,
  {
    orientation = 'offense',
    type = 'normal',
    damageClass = 'physical',
    weather = 'sun',
    terrain = 'electric',
    status = 'burn',
    hp = 25,
    kind = 'stat-change',
    actionType = 'move',
    value = 80,
    itemOwnerSide = 'player',
    targetSide = 'player',
    causeSide = 'foe',
    stateSide = 'player',
    foeAbility = 'keeneye',
    foeStatus = 'poison',
    foeHeldItem = 'oran-berry',
    contact = true,
    critical = true,
    effectiveness = 2,
    indirect = true,
    damage = 20,
    hpBefore = 70,
    cause,
    stat = 'attack',
    delta = -1,
    itemKind = 'berry',
    consumed = true,
    lost = true,
    automatic = true,
    reason = 'removed',
    reflectable = true,
    hitIndex = 1,
    movingLast = true,
    targetSwitchedThisTurn = true,
    attackerGender = 'male',
    defenderGender = 'female',
    faintedSide = 'foe',
    causedBy = 'player',
    lastDamage = 25,
    moveKey,
    moveIndex = 0,
    slotPresent = true,
    paralysisApplied = true,
    ohko = true,
    preloadState = false,
    sparse = false,
  } = {},
) => {
  const current = {
    player: actor(25, ability, {
      hp,
      status,
      heldItem: null,
      gender: attackerGender,
      moves: [{ move: 'tackle', pp: 10, maxPp: 10 }],
    }),
    foe: actor(16, foeAbility, {
      hp: 45,
      status: foeStatus,
      heldItem: foeHeldItem,
      gender: defenderGender,
      moves: [{ move: 'tackle', pp: 10, maxPp: 10 }],
    }),
    effects: [],
    abilityState: preloadState
      ? {
          player: {
            flashFire: true,
            unburden: true,
            slowStartTurns: 5,
            lastConsumedBerry: 'oran-berry',
            pickupItem: 'oran-berry',
          },
        }
      : {},
    field: createBattleField(),
    rng: () => 0,
    turn: 2,
  }
  current.player.volatile.confusion = 2
  current.player.volatile.disable = null
  current.field.weather = weather
    ? { key: weather, turns: 5, source: 'coverage' }
    : null
  current.field.terrain = terrain
    ? { key: terrain, turns: 5, source: 'coverage' }
    : null

  const attacker = orientation === 'offense' ? 'player' : 'foe'
  const defender = orientation === 'offense' ? 'foe' : 'player'
  const usedMove = sparse ? null : coverageMove(type, damageClass)
  if (usedMove && moveKey) {
    usedMove.key = moveKey
    usedMove.id = moveKey
    usedMove.name = moveKey
  }

  return {
    battle: current,
    phase: handler.phase,
    source: { side: 'player', key: ability },
    events: [],
    field: current.field,
    attacker: sparse ? null : attacker,
    defender: sparse ? null : defender,
    attackerSide: attacker,
    defenderSide: defender,
    side: sparse ? null : stateSide,
    targetSide,
    causeSide,
    move: usedMove,
    moveIndex,
    slot: slotPresent ? current.player.mon.moves[0] : null,
    action: { type: actionType },
    value,
    status,
    damage,
    hpBefore,
    contact,
    critical,
    effectiveness,
    stab: true,
    burnApplied: true,
    indirect,
    cause: cause ?? status ?? 'burn',
    kind,
    stat,
    delta,
    hitIndex,
    movingLast,
    targetSwitchedThisTurn,
    attackerGender,
    defenderGender,
    faintedSide,
    causedBy,
    lastDamage,
    itemOwnerSide,
    itemKind,
    itemKey: 'oran-berry',
    consumed,
    lost,
    automatic,
    reason,
    reflectable,
    paralysisApplied,
    ohko,
  }
}

const handlerCoverageCases = [
  {
    orientation: 'offense',
    type: 'normal',
    damageClass: 'physical',
    weather: 'sun',
    terrain: 'electric',
    status: 'burn',
    hp: 25,
  },
  {
    orientation: 'defense',
    type: 'normal',
    damageClass: 'physical',
    weather: 'rain',
    terrain: 'grassy',
    status: 'poison',
    hp: 100,
  },
  {
    orientation: 'offense',
    type: 'fire',
    damageClass: 'special',
    weather: 'sun',
    terrain: 'misty',
    status: 'burn',
    hp: 100,
  },
  {
    orientation: 'defense',
    type: 'fire',
    damageClass: 'physical',
    weather: 'hail',
    terrain: 'psychic',
    status: null,
    hp: 25,
  },
  {
    orientation: 'offense',
    type: 'water',
    damageClass: 'special',
    weather: 'rain',
    terrain: 'electric',
    status: 'poison',
    hp: 50,
  },
  {
    orientation: 'defense',
    type: 'electric',
    damageClass: 'special',
    weather: 'sandstorm',
    terrain: 'grassy',
    status: 'paralysis',
    hp: 100,
  },
  {
    orientation: 'offense',
    type: 'grass',
    damageClass: 'physical',
    weather: 'sun',
    terrain: 'grassy',
    status: 'badly-poisoned',
    hp: 20,
  },
  {
    orientation: 'defense',
    type: 'dark',
    damageClass: 'physical',
    weather: 'rain',
    terrain: 'misty',
    status: 'sleep',
    hp: 49,
  },
  {
    orientation: 'offense',
    type: 'ghost',
    damageClass: 'special',
    weather: 'hail',
    terrain: 'psychic',
    status: null,
    hp: 100,
  },
  {
    orientation: 'defense',
    type: 'bug',
    damageClass: 'physical',
    weather: 'sandstorm',
    terrain: 'electric',
    status: 'freeze',
    hp: 40,
  },
  {
    orientation: 'offense',
    type: 'steel',
    damageClass: 'physical',
    weather: null,
    terrain: null,
    status: null,
    hp: 100,
  },
  {
    orientation: 'defense',
    type: 'flying',
    damageClass: 'physical',
    weather: 'sun',
    terrain: 'grassy',
    status: 'burn',
    hp: 1,
  },
  {
    orientation: 'offense',
    type: 'psychic',
    damageClass: 'special',
    weather: 'rain',
    terrain: 'psychic',
    status: 'poison',
    hp: 33,
  },
  {
    orientation: 'defense',
    type: 'dragon',
    damageClass: 'special',
    weather: 'hail',
    terrain: 'misty',
    status: null,
    hp: 100,
  },
  {
    orientation: 'offense',
    type: 'ground',
    damageClass: 'physical',
    weather: 'sandstorm',
    terrain: 'electric',
    status: 'paralysis',
    hp: 50,
  },
  {
    orientation: 'offense',
    type: 'normal',
    damageClass: 'status',
    weather: 'sun',
    terrain: 'grassy',
    status: null,
    hp: 100,
    value: 0,
  },
  {
    orientation: 'defense',
    type: 'normal',
    damageClass: 'status',
    weather: 'rain',
    terrain: 'psychic',
    status: 'sleep',
    hp: 80,
    value: -1,
  },
  { kind: 'stat-change', value: -1, targetSide: 'player', causeSide: 'foe' },
  { kind: 'stat-change', value: 1, targetSide: 'player', causeSide: 'player' },
  {
    kind: 'stat-change-applied',
    value: -1,
    targetSide: 'player',
    causeSide: 'foe',
  },
  { kind: 'flinch', targetSide: 'player', causeSide: 'foe' },
  {
    kind: 'status-applied',
    status: 'burn',
    targetSide: 'player',
    causeSide: 'foe',
  },
  { kind: 'secondary-effect', targetSide: 'player', causeSide: 'foe' },
  { kind: 'recoil', value: 20 },
  { kind: 'drain', value: 20, orientation: 'defense' },
  { kind: 'critical-stage', value: 0 },
  { kind: 'hit-count', value: 2 },
  { kind: 'secondary-chance', value: 20 },
  { kind: 'flinch-chance', value: 0 },
  { kind: 'contact', value: 1 },
  { kind: 'weight', value: 100 },
  { kind: 'sleep-counter-decrement', value: 1, status: 'sleep' },
  { kind: 'dance-used', orientation: 'defense' },
  { actionType: 'run', value: 0 },
  { actionType: 'switch', side: 'player', value: 0 },
  { actionType: 'forced-switch', side: 'player', value: 0 },
  { itemOwnerSide: 'foe', value: 0 },
  { itemOwnerSide: null, stateSide: 'player', value: 0 },
  { targetSide: 'foe', causeSide: 'player', value: -1 },
  { orientation: 'defense', type: 'water', foeStatus: null, value: null },
  { orientation: 'defense', type: 'fire', foeStatus: null, value: null },
  { orientation: 'defense', type: 'ice', status: null, value: null },
  { orientation: 'offense', type: 'fairy', value: null },
  { orientation: 'offense', type: 'ice', value: null },
  { orientation: 'offense', type: 'dark', foeAbility: 'darkaura', value: null },
  {
    orientation: 'offense',
    type: 'fairy',
    foeAbility: 'fairyaura',
    value: null,
  },
  {
    orientation: 'defense',
    type: 'normal',
    contact: false,
    critical: false,
    effectiveness: 0.5,
    indirect: false,
    damage: 0,
    value: null,
  },
  {
    orientation: 'offense',
    type: 'normal',
    contact: false,
    critical: false,
    effectiveness: 0.5,
    indirect: false,
    value: null,
  },
  {
    orientation: 'defense',
    type: 'ground',
    contact: false,
    critical: false,
    effectiveness: 1,
    value: null,
  },
  {
    orientation: 'defense',
    type: 'normal',
    cause: 'sandstorm',
    indirect: true,
    value: null,
  },
  {
    orientation: 'defense',
    type: 'normal',
    cause: 'hail',
    indirect: true,
    value: null,
  },
  {
    orientation: 'defense',
    type: 'normal',
    cause: 'poison',
    indirect: true,
    status: 'poison',
    value: null,
  },
  {
    orientation: 'defense',
    type: 'normal',
    cause: 'badly-poisoned',
    indirect: true,
    status: 'badly-poisoned',
    value: null,
  },
  { orientation: 'offense', type: 'normal', moveKey: 'explosion', value: null },
  {
    orientation: 'offense',
    type: 'normal',
    moveKey: 'struggle',
    kind: 'recoil',
    value: null,
  },
  {
    orientation: 'defense',
    type: 'normal',
    moveIndex: null,
    foeStatus: null,
    value: null,
  },
  {
    actionType: 'switch',
    stateSide: 'foe',
    orientation: 'defense',
    value: null,
  },
  {
    actionType: 'forced-switch',
    stateSide: 'player',
    orientation: 'defense',
    value: null,
  },
  { actionType: 'run', stateSide: null, orientation: 'offense', value: null },
  {
    kind: 'stat-change',
    stat: 'defense',
    value: -1,
    targetSide: 'player',
    causeSide: 'foe',
  },
  {
    kind: 'stat-change',
    stat: 'accuracy',
    value: -1,
    targetSide: 'player',
    causeSide: 'foe',
  },
  {
    kind: 'stat-change-applied',
    delta: -1,
    value: null,
    targetSide: 'player',
    causeSide: 'foe',
  },
  {
    kind: 'status-applied',
    status: 'paralysis',
    targetSide: 'player',
    causeSide: 'foe',
    foeStatus: null,
  },
  {
    kind: 'status-applied',
    status: 'sleep',
    targetSide: 'player',
    causeSide: 'foe',
    foeStatus: null,
  },
  {
    kind: 'secondary-effect',
    targetSide: 'foe',
    causeSide: 'player',
    value: null,
  },
  { kind: 'flinch', targetSide: 'foe', value: null },
  { kind: 'weight', value: null },
  { kind: 'sleep-counter-decrement', status: 'sleep', value: null },
  { kind: 'dance-used', orientation: 'offense', value: null },
  { preloadState: true, orientation: 'offense', type: 'fire', value: null },
  {
    preloadState: true,
    orientation: 'defense',
    type: 'water',
    status: 'poison',
    value: null,
  },
  { preloadState: true, weather: 'sun', status: 'poison', value: null },
  {
    automatic: false,
    consumed: false,
    lost: false,
    reason: 'used',
    itemKind: 'other',
    value: null,
  },
  { reason: 'stolen', itemKind: 'berry', value: null },
  { reason: 'swapped', itemKind: 'berry', value: null },
  {
    foeAbility: 'stickyhold',
    orientation: 'offense',
    foeHeldItem: 'oran-berry',
    value: null,
  },
  { foeHeldItem: null, orientation: 'offense', value: null },
  {
    attackerGender: 'male',
    defenderGender: 'male',
    orientation: 'defense',
    foeStatus: null,
    value: null,
  },
  {
    attackerGender: null,
    defenderGender: null,
    orientation: 'defense',
    foeStatus: null,
    value: null,
  },
  {
    reflectable: false,
    damageClass: 'status',
    orientation: 'defense',
    value: null,
  },
  { hitIndex: 0, orientation: 'offense', value: null },
  {
    movingLast: false,
    targetSwitchedThisTurn: false,
    orientation: 'offense',
    value: null,
  },
  { effectiveness: 1, orientation: 'offense', value: null },
  { effectiveness: 0.5, orientation: 'offense', value: null },
  { hp: 100, ohko: false, orientation: 'defense', value: null },
  { hp: 0, orientation: 'defense', damage: 0, value: null },
  ...[
    'normal',
    'fire',
    'water',
    'electric',
    'grass',
    'dark',
    'ghost',
    'bug',
    'steel',
    'flying',
    'psychic',
    'dragon',
    'ground',
    'fairy',
    'ice',
  ].flatMap((type) => [
    { orientation: 'offense', type, value: null },
    { orientation: 'defense', type, value: null },
  ]),
  {
    sparse: true,
    weather: null,
    terrain: null,
    status: null,
    hp: 0,
    value: null,
  },
]

describe('ability handler edge coverage', () => {
  test('Should handle flag metadata, missing targets, saturated stages, and lifecycle edge cases', () => {
    expect(moveHasFlag({ flags: new Set(['sound']) }, 'sound')).toBe(true)
    expect(moveHasFlag({ flags: ['bullet'] }, 'bullet')).toBe(true)
    expect(moveHasFlag({}, 'sound')).toBe(false)
    expect(moveHasFlag({ id: 'bite' }, 'bite')).toBe(true)
    expect(moveHasFlag({ key: 'spore' }, 'powder')).toBe(true)
    expect(moveHasFlag({ key: 'wild-charge' }, 'recoil')).toBe(true)
    expect(moveHasFlag({ key: 'recover' }, 'heal')).toBe(true)
    expect(moveHasFlag({ key: 'fixture' }, 'unknown')).toBe(false)
    expect(emitAbilityReveal(null, 'player', 'static', 'test')).toBeUndefined()

    const invoke = (ability, family, options = {}, mutate) => {
      const handler = handlersForAbility(ability).find(
        (entry) => entry.family === family,
      )
      expect(handler, `${ability}:${family}`).toBeDefined()
      const state = handlerCoverageState(ability, handler, options)
      mutate?.(state)
      return handler.handler(state)
    }

    invoke('intimidate', 'switch-in-stat', {}, (state) => {
      delete state.battle.foe
    })
    invoke('intimidate', 'switch-in-stat', {}, (state) => {
      state.battle.foe.stages.attack = -6
    })

    invoke(
      'poisonpoint',
      'contact-status',
      { orientation: 'defense', foeStatus: null },
      (state) => {
        state.battle.foe.mon.ability = 'immunity'
      },
    )
    invoke(
      'poisonpoint',
      'contact-status',
      { orientation: 'defense', foeStatus: null, weather: 'sun' },
      (state) => {
        state.battle.foe.mon.ability = 'leafguard'
      },
    )

    invoke('regenerator', 'switch-out-recovery', {}, (state) => {
      delete state.battle.player
    })
    invoke('solarpower', 'end-turn-damage', { weather: 'sun' }, (state) => {
      delete state.battle.player
    })
    invoke(
      'normalize',
      'move-type-power',
      { orientation: 'offense' },
      (state) => {
        state.move = null
      },
    )

    invoke('static', 'contact-status', { orientation: 'defense' }, (state) => {
      state.battle.rng = () => 1
    })
    invoke('static', 'contact-status', { orientation: 'defense' }, (state) => {
      state.attacker = null
      state.attackerSide = null
    })
    invoke(
      'roughskin',
      'contact-damage',
      { orientation: 'defense' },
      (state) => {
        state.attacker = null
        state.attackerSide = null
      },
    )
    invoke('gooey', 'contact-stage', { orientation: 'defense' }, (state) => {
      state.attacker = null
      state.attackerSide = null
    })

    invoke('download', 'switch-in-stat', {}, (state) => {
      delete state.battle.foe
    })
    invoke('trace', 'ability-copy', { foeAbility: 'trace' })
    invoke(
      'technician',
      'power-threshold',
      { orientation: 'offense' },
      (state) => {
        state.move.power = 80
      },
    )

    invoke('unburden', 'item-loss-speed', {
      itemOwnerSide: 'foe',
      stateSide: 'foe',
    })
    invoke(
      'effectspore',
      'contact-random-status',
      { orientation: 'defense' },
      (state) => {
        state.battle.rng = () => 1
      },
    )
    invoke(
      'effectspore',
      'contact-random-status',
      { orientation: 'defense' },
      (state) => {
        state.attacker = null
        state.attackerSide = null
      },
    )
    invoke(
      'mummy',
      'contact-ability-change',
      { orientation: 'defense' },
      (state) => {
        state.attacker = null
        state.attackerSide = null
      },
    )
    invoke('mummy', 'contact-ability-change', {
      orientation: 'defense',
      foeAbility: 'mummy',
    })

    invoke('baddreams', 'foe-residual', { foeStatus: 'sleep' })
    invoke('moody', 'random-stage-pair', {}, (state) => {
      for (const stat of Object.keys(state.battle.player.stages))
        state.battle.player.stages[stat] = 6
    })
    invoke('moxie', 'ko-stage', { faintedSide: 'player' })
    invoke('beastboost', 'ko-highest-stat', { faintedSide: 'player' })

    invoke('aftermath', 'faint-contact-damage', {
      faintedSide: 'player',
      orientation: 'defense',
    })
    invoke(
      'aftermath',
      'faint-contact-damage',
      { faintedSide: 'player', orientation: 'defense' },
      (state) => {
        state.battle.foe.mon.ability = 'damp'
      },
    )
    invoke('innardsout', 'faint-retaliation', {
      faintedSide: 'player',
      orientation: 'defense',
    })
    invoke(
      'innardsout',
      'faint-retaliation',
      { faintedSide: 'player', orientation: 'defense' },
      (state) => {
        state.attacker = null
        state.attackerSide = null
      },
    )

    invoke(
      'harvest',
      'berry-restore',
      { preloadState: true, weather: 'rain' },
      (state) => {
        state.battle.rng = () => 1
      },
    )
  })
})

describe('supported ability handler coverage matrix', () => {
  test('Should execute every supported handler across offensive, defensive, lifecycle, item, and sparse contexts', () => {
    let invocations = 0

    for (const ability of supportedAbilityKeys()) {
      for (const handler of handlersForAbility(ability)) {
        for (const coverageCase of handlerCoverageCases) {
          const state = handlerCoverageState(ability, handler, coverageCase)
          expect(
            () => handler.handler(state),
            `${ability}:${handler.family}`,
          ).not.toThrow()
          invocations++
        }
      }
    }

    expect(invocations).toBeGreaterThan(5000)
  })
})

describe('live battle ability integration', () => {
  test('Should activate switch-in weather immediately when a battle is created', () => {
    const player = liveMon(25, 'drizzle', 'growl')
    const foe = liveMon(16, 'keeneye', 'growl', 2)
    const current = createLiveBattle({
      playerMon: player,
      wildMon: foe,
      seed: 12,
    })

    expect(current.field.weather?.key).toBe('rain')
    expect(current.pendingEvents).toContainEqual({
      type: 'ability',
      side: 'player',
      ability: 'drizzle',
      cause: 'switch-in',
    })
  })

  test('Should extend ability-set weather and terrain from the setter held item', () => {
    const rainSetter = liveMon(25, 'drizzle', 'growl')
    rainSetter.heldItem = 'damp-rock'
    const rain = createLiveBattle({
      playerMon: rainSetter,
      wildMon: liveMon(16, 'keeneye', 'growl', 2),
      seed: 13,
    })

    expect(rain.field.weather).toEqual({
      key: 'rain',
      source: { side: 'player', ability: 'drizzle' },
      turns: 8,
    })

    const terrainSetter = liveMon(25, 'grassysurge', 'growl')
    terrainSetter.heldItem = 'terrain-extender'
    const terrain = createLiveBattle({
      playerMon: terrainSetter,
      wildMon: liveMon(16, 'keeneye', 'growl', 3),
      seed: 14,
    })

    expect(terrain.field.terrain).toEqual({
      key: 'grassy',
      source: { side: 'player', ability: 'grassysurge' },
      turns: 8,
    })
  })

  test('Should activate a grounded terrain seed when the opposing setter switches in', () => {
    const player = liveMon(25, 'keeneye', 'growl')
    player.heldItem = 'grassy-seed'
    const foe = liveMon(1, 'grassysurge', 'growl', 2)
    const current = createLiveBattle({
      playerMon: player,
      wildMon: foe,
      seed: 15,
    })

    expect(current.field.terrain).toMatchObject({
      key: 'grassy',
      source: { side: 'foe', ability: 'grassysurge' },
    })
    expect(current.player.stages.defense).toBe(1)
    expect(current.player.mon.heldItem).toBeNull()
  })

  test('Should replace fields deterministically when opposing setters switch in', () => {
    const player = liveMon(25, 'drizzle', 'growl')
    player.heldItem = 'damp-rock'
    const foe = liveMon(4, 'drought', 'growl', 2)
    foe.heldItem = 'heat-rock'
    const current = createLiveBattle({
      playerMon: player,
      wildMon: foe,
      seed: 16,
    })

    expect(current.field.weather).toEqual({
      key: 'sun',
      source: { side: 'foe', ability: 'drought' },
      turns: 8,
    })
    expect(
      current.pendingEvents.filter((event) =>
        ['ability', 'field'].includes(event.type),
      ),
    ).toEqual([
      {
        type: 'ability',
        side: 'player',
        ability: 'drizzle',
        cause: 'switch-in',
      },
      {
        type: 'field',
        kind: 'weather',
        key: 'rain',
        source: { side: 'player', ability: 'drizzle' },
        turns: 8,
      },
      {
        type: 'ability',
        side: 'foe',
        ability: 'drought',
        cause: 'switch-in',
      },
      {
        type: 'field',
        kind: 'weather',
        key: 'sun',
        source: { side: 'foe', ability: 'drought' },
        turns: 8,
      },
    ])
  })

  test('Should apply Intimidate once for the side that actually switches in', () => {
    const player = liveMon(25, 'intimidate', 'growl')
    const foe = liveMon(16, 'intimidate', 'growl', 2)
    const current = createLiveBattle({
      playerMon: player,
      wildMon: foe,
      seed: 3,
    })

    expect(current.player.stages.attack).toBe(-1)
    expect(current.foe.stages.attack).toBe(-1)
  })

  test('Should route type conversion through real move resolution', () => {
    const player = liveMon(25, 'aerilate', 'tackle')
    const foe = liveMon(92, 'keeneye', 'growl', 2)
    player.stats.speed = 999
    foe.stats.speed = 1
    const current = createLiveBattle({
      playerMon: player,
      wildMon: foe,
      seed: 9,
    })

    const events = submitAction(current, { type: 'move', index: 0 })
    const damage = events.find(
      (event) => event.type === 'damage' && event.side === 'foe',
    )

    expect(damage?.amount).toBeGreaterThan(0)
  })

  test('Should route absorbing immunities through real move resolution', () => {
    const player = liveMon(25, 'keeneye', 'water-gun')
    const foe = liveMon(16, 'waterabsorb', 'growl', 2)
    player.stats.speed = 999
    foe.stats.speed = 1
    foe.hp = Math.floor(foe.stats.hp / 2)
    const before = foe.hp
    const current = createLiveBattle({
      playerMon: player,
      wildMon: foe,
      seed: 4,
    })

    const events = submitAction(current, { type: 'move', index: 0 })

    expect(foe.hp).toBeGreaterThan(before)
    expect(
      events.some((event) => event.type === 'damage' && event.side === 'foe'),
    ).toBe(false)
  })

  test('Should trigger Moxie from a real KO before battle resolution finishes', () => {
    const player = liveMon(25, 'moxie', 'tackle')
    const foe = liveMon(16, 'keeneye', 'growl', 2)
    player.stats.speed = 999
    foe.stats.speed = 1
    foe.hp = 1
    const current = createLiveBattle({
      playerMon: player,
      wildMon: foe,
      seed: 5,
    })

    submitAction(current, { type: 'move', index: 0 })

    expect(current.player.stages.attack).toBe(1)
    expect(current.outcome).toBe('win')
  })

  test('Should execute Regenerator and refresh ability handlers on a real switch', () => {
    const player = liveMon(25, 'regenerator', 'growl')
    const foe = liveMon(16, 'keeneye', 'growl', 2)
    player.hp = Math.floor(player.stats.hp / 3)
    const current = createLiveBattle({
      playerMon: player,
      wildMon: foe,
      seed: 6,
    })
    const replacement = liveMon(4, 'blaze', 'growl', 7)
    const before = player.hp

    liveSwitchIn(current, replacement)

    expect(player.hp).toBeGreaterThan(before)
    expect(current.player.mon).toBe(replacement)
    expect(
      current.effects.some(
        (entry) =>
          entry.sourceType === 'ability' &&
          entry.side === 'player' &&
          entry.key === 'blaze',
      ),
    ).toBe(true)
    expect(
      current.effects.some(
        (entry) =>
          entry.sourceType === 'ability' &&
          entry.side === 'player' &&
          entry.key === 'regenerator',
      ),
    ).toBe(false)
  })
})
