import { expect, test } from 'vitest'

import { isDataReady, move as moveOf, species } from '../src/data.mjs'
import { effectiveness } from '../src/typechart.mjs'
import { expForLevel } from '../src/exp.mjs'
import { statsAtLevel } from '../src/stats.mjs'
import { attemptCatch, catchValue } from '../src/capture.mjs'
import {
  createPokemon,
  displayName,
  evolveInto,
  genderOf,
  levelOf,
  pendingEvolution,
  refreshStats,
  speciesGender,
  speciesName,
} from '../src/pokemon.mjs'
import { createBattle, submitAction } from '../src/battle.mjs'
import { makeRng } from '../src/rng.mjs'

if (!isDataReady()) {
  throw new Error('dataset missing — run: node tools/fetch-data.mjs')
}

const aPokemon = (speciesId, level) => {
  const created = createPokemon(speciesId, level, makeRng(1))

  for (const key of Object.keys(created.ivs)) created.ivs[key] = 15

  created.stats = statsAtLevel(speciesId, level, created.ivs)
  created.hp = created.stats.hp

  return created
}

const playSixTurns = (battle) => {
  const log = []

  for (let turn = 0; turn < 6 && !battle.over; turn++) {
    log.push(...submitAction(battle, { type: 'move', index: 0 }))
  }

  return { log, outcome: battle.outcome, hp: battle.foe.mon.hp }
}

test('Should multiply the effectiveness across both defending types, and zero it on an immunity in either slot', () => {
  expect(effectiveness('water', ['fire'])).toBe(2)
  expect(effectiveness('fire', ['water'])).toBe(0.5)
  expect(effectiveness('electric', ['ground'])).toBe(0)
  expect(effectiveness('normal', ['ghost'])).toBe(0)

  expect(effectiveness('rock', species(6).types)).toBe(4)
  expect(effectiveness('grass', species(1).types)).toBe(0.25)
  expect(effectiveness('normal', species(94).types)).toBe(0)
})

test('Should hand back a created Pokemon ready to battle, at full health with full PP', () => {
  const charmander = createPokemon(4, 5, makeRng(42))

  expect(levelOf(charmander)).toBe(5)
  expect(charmander.hp).toBe(charmander.stats.hp)
  expect(charmander.moves.length).toBeGreaterThanOrEqual(1)
  expect(charmander.moves.every((slot) => slot.pp === slot.maxPp)).toBe(true)
})

test('Should add the HP gained on levelling up rather than healing the damage', () => {
  const charmander = aPokemon(4, 10)

  charmander.hp = 5

  const beforeMax = charmander.stats.hp

  charmander.exp = expForLevel(4, 11)
  refreshStats(charmander)

  const gained = charmander.stats.hp - beforeMax

  expect(gained, 'max HP should rise').toBeGreaterThan(0)
  expect(charmander.hp).toBe(5 + gained)
  expect(charmander.hp, 'a level up is not a full heal').toBeLessThan(
    charmander.stats.hp,
  )
})

test('Should keep the level, the share of health and the gender when a Pokemon evolves', () => {
  const charmander = aPokemon(4, 16)

  charmander.hp = Math.floor(charmander.stats.hp / 2)

  const gender = genderOf(charmander)

  expect(
    gender,
    'the Pokemon needs a gender for this to mean much',
  ).toBeTruthy()
  expect(pendingEvolution(charmander), 'Charmander evolves at 16').toBe(5)

  evolveInto(charmander, 5)

  expect(charmander.species).toBe(5)
  expect(levelOf(charmander)).toBe(16)
  expect(genderOf(charmander)).toBe(gender)

  const fraction = charmander.hp / charmander.stats.hp

  expect(fraction, `kept ${fraction} of its health`).toBeGreaterThan(0.4)
  expect(fraction, `kept ${fraction} of its health`).toBeLessThan(0.6)
})

test('Should leave a Pokemon below its evolution level, or one that needs a stone, unevolved', () => {
  expect(pendingEvolution(aPokemon(4, 15))).toBe(null)
  expect(pendingEvolution(aPokemon(25, 50))).toBe(null)
})

test('Should read the gender off the Attack IV against the species ratio', () => {
  const female = aPokemon(25, 10)

  female.ivs.attack = 15

  expect(genderOf(female)).toBe('female')

  const male = aPokemon(25, 10)

  male.ivs.attack = 16

  expect(genderOf(male)).toBe('male')

  const lowest = aPokemon(25, 10)

  lowest.ivs.attack = 0

  expect(genderOf(lowest)).toBe('female')

  const highest = aPokemon(25, 10)

  highest.ivs.attack = 31

  expect(genderOf(highest)).toBe('male')
})

test('Should ignore the IV entirely for the species that come in only one gender', () => {
  for (const iv of [0, 15, 16, 31]) {
    const nidoranF = aPokemon(29, 10)

    nidoranF.ivs.attack = iv

    expect(genderOf(nidoranF), `Nidoran♀ at IV ${iv}`).toBe('female')

    const nidoranM = aPokemon(32, 10)

    nidoranM.ivs.attack = iv

    expect(genderOf(nidoranM), `Nidoran♂ at IV ${iv}`).toBe('male')
  }
})

test('Should give the ones with no gender none at any IV', () => {
  for (const id of [81, 132, 137, 150]) {
    for (const iv of [0, 31]) {
      const genderless = aPokemon(id, 10)

      genderless.ivs.attack = iv

      expect(genderOf(genderless), `${species(id).name} at IV ${iv}`).toBe(null)
    }
  }
})

test('Should show no gender, rather than all male, on a dataset too old to know', () => {
  const pikachu = aPokemon(25, 10)
  const entry = species(25)
  const { genderRate } = entry

  try {
    delete entry.genderRate

    expect(genderOf(pikachu)).toBe(null)
  } finally {
    entry.genderRate = genderRate
  }
})

test('Should strip the suffix from the two Nidoran and tell them apart by gender instead', () => {
  expect(speciesName(29)).toBe('Nidoran')
  expect(speciesName(32)).toBe('Nidoran')
  expect(speciesGender(29)).toBe('female')
  expect(speciesGender(32)).toBe('male')

  expect(speciesGender(25)).toBe(null)
  expect(speciesGender(132)).toBe(null)

  expect(displayName(aPokemon(29, 5))).toBe('Nidoran')

  const nicknamed = aPokemon(29, 5)

  nicknamed.nickname = 'Spike'

  expect(displayName(nicknamed)).toBe('Spike')
})

test('Should make a weakened Pokemon easier to catch than a healthy one', () => {
  const pidgey = aPokemon(16, 10)
  const healthy = catchValue(pidgey, 'poke-ball')

  pidgey.hp = 1

  const weakened = catchValue(pidgey, 'poke-ball')

  expect(weakened, `${weakened} should beat ${healthy}`).toBeGreaterThan(
    healthy,
  )
})

test('Should catch better with a better ball, and twice as well against a sleeping target', () => {
  const pidgey = aPokemon(16, 10)
  const plain = catchValue(pidgey, 'poke-ball')

  expect(catchValue(pidgey, 'ultra-ball')).toBeGreaterThan(plain)

  pidgey.status = 'sleep'

  expect(catchValue(pidgey, 'poke-ball')).toBe(plain * 2)
})

test('Should never fail a Master Ball, even on Mewtwo at full health', () => {
  const mewtwo = aPokemon(150, 70)

  for (let seed = 1; seed <= 50; seed++) {
    expect(
      attemptCatch(mewtwo, 'master-ball', makeRng(seed)).caught,
      `seed ${seed}`,
    ).toBe(true)
  }
})

test('Should let Mewtwo at full health resist a Poke Ball', () => {
  const mewtwo = aPokemon(150, 70)

  let caught = 0

  for (let seed = 1; seed <= 200; seed++) {
    if (attemptCatch(mewtwo, 'poke-ball', makeRng(seed)).caught) caught++
  }

  expect(
    caught,
    `caught ${caught} times out of 200, which is too generous`,
  ).toBeLessThanOrEqual(4)
})

test('Should take a few balls on an untouched Caterpie and go straight down on a weakened one', () => {
  const healthy = aPokemon(10, 5)

  let caughtHealthy = 0

  for (let seed = 1; seed <= 400; seed++) {
    if (attemptCatch(healthy, 'poke-ball', makeRng(seed)).caught)
      caughtHealthy++
  }

  const healthyRate = caughtHealthy / 400

  expect(healthyRate, `full health rate was ${healthyRate}`).toBeGreaterThan(
    0.2,
  )
  expect(healthyRate, `full health rate was ${healthyRate}`).toBeLessThan(0.5)

  const weakened = aPokemon(10, 5)

  weakened.hp = 1

  let caughtWeak = 0

  for (let seed = 1; seed <= 400; seed++) {
    if (attemptCatch(weakened, 'poke-ball', makeRng(seed)).caught) caughtWeak++
  }

  const weakenedRate = caughtWeak / 400

  expect(
    weakenedRate,
    `weakened rate was only ${weakenedRate}`,
  ).toBeGreaterThan(0.95)
})

test('Should replay a battle identically from the same seed and the same actions', () => {
  const first = playSixTurns(
    createBattle({
      playerMon: aPokemon(4, 20),
      wildMon: aPokemon(16, 10),
      seed: 1234,
    }),
  )
  const second = playSixTurns(
    createBattle({
      playerMon: aPokemon(4, 20),
      wildMon: aPokemon(16, 10),
      seed: 1234,
    }),
  )

  expect(first).toEqual(second)
})

test('Should damage the foe and spend a PP when attacking', () => {
  const battle = createBattle({
    playerMon: aPokemon(4, 20),
    wildMon: aPokemon(16, 10),
    seed: 7,
  })
  const slot = battle.player.mon.moves.findIndex(
    (entry) => moveOf(entry.move).damageClass !== 'status',
  )
  const before = battle.foe.mon.hp
  const ppBefore = battle.player.mon.moves[slot].pp

  const events = submitAction(battle, { type: 'move', index: slot })

  expect(battle.foe.mon.hp, 'the foe should have taken damage').toBeLessThan(
    before,
  )
  expect(battle.player.mon.moves[slot].pp).toBe(ppBefore - 1)
  expect(events.some((event) => event.type === 'damage')).toBe(true)
})

test('Should end the battle in a win that pays out when the foe is beaten', () => {
  const battle = createBattle({
    playerMon: aPokemon(4, 40),
    wildMon: aPokemon(16, 5),
    seed: 99,
  })
  const slot = battle.player.mon.moves.findIndex(
    (entry) => moveOf(entry.move).damageClass !== 'status',
  )

  let guard = 0

  while (!battle.over && guard++ < 30)
    submitAction(battle, { type: 'move', index: slot })

  expect(battle.over).toBe(true)
  expect(battle.outcome).toBe('win')
  expect(battle.rewards.exp, 'should award experience').toBeGreaterThan(0)
  expect(battle.rewards.money, 'should award money').toBeGreaterThan(0)
  expect(battle.foe.mon.hp).toBeLessThanOrEqual(0)
})

test('Should report a lost battle as a loss that pays nothing', () => {
  const battle = createBattle({
    playerMon: aPokemon(129, 5),
    wildMon: aPokemon(150, 70),
    seed: 3,
  })

  let guard = 0

  while (!battle.over && guard++ < 60)
    submitAction(battle, { type: 'move', index: 0 })

  expect(battle.outcome).toBe('loss')
  expect(battle.player.mon.hp).toBeLessThanOrEqual(0)
  expect(battle.rewards, 'a loss pays nothing').toBe(null)
})

test('Should always get away with a faster Pokemon', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const battle = createBattle({
      playerMon: aPokemon(6, 50),
      wildMon: aPokemon(10, 5),
      seed,
    })

    const events = submitAction(battle, { type: 'run' })

    expect(battle.outcome, `seed ${seed}`).toBe('fled')
    expect(events.some((event) => event.text === 'Got away safely!')).toBe(true)
  }
})

test('Should end the battle as caught when the ball holds', () => {
  const battle = createBattle({
    playerMon: aPokemon(4, 20),
    wildMon: aPokemon(16, 10),
    seed: 7,
  })

  const events = submitAction(battle, { type: 'ball', key: 'master-ball' })

  expect(battle.outcome).toBe('caught')
  expect(events.some((event) => event.type === 'catch' && event.caught)).toBe(
    true,
  )
})

test('Should still give the foe its turn when the ball fails', () => {
  const battle = createBattle({
    playerMon: aPokemon(143, 70),
    wildMon: aPokemon(150, 70),
    seed: 5,
  })
  const before = battle.player.mon.hp

  submitAction(battle, { type: 'ball', key: 'poke-ball' })

  expect(battle.outcome, 'Mewtwo should not be caught by one Poke Ball').toBe(
    null,
  )
  expect(
    battle.player.mon.hp,
    'the foe should have attacked back',
  ).toBeLessThan(before)
})

test('Should hit harder with a super effective move than with a resisted one', () => {
  const total = { strong: 0, weak: 0 }

  for (let seed = 1; seed <= 40; seed++) {
    for (const [key, foeId] of [
      ['strong', 1],
      ['weak', 7],
    ]) {
      const charmander = aPokemon(4, 30)

      charmander.moves = [{ move: 'ember', pp: 25, maxPp: 25 }]

      const battle = createBattle({
        playerMon: charmander,
        wildMon: aPokemon(foeId, 30),
        seed,
      })
      const before = battle.foe.mon.hp

      submitAction(battle, { type: 'move', index: 0 })

      total[key] += before - battle.foe.mon.hp
    }
  }

  expect(total.strong, `${total.strong} versus ${total.weak}`).toBeGreaterThan(
    total.weak * 2,
  )
})

test('Should halve the physical damage a burned attacker deals', () => {
  const dealt = { healthy: 0, burned: 0 }

  for (let seed = 1; seed <= 40; seed++) {
    for (const state of ['healthy', 'burned']) {
      const attacker = aPokemon(4, 30)

      attacker.moves = [{ move: 'scratch', pp: 35, maxPp: 35 }]

      if (state === 'burned') attacker.status = 'burn'

      const battle = createBattle({
        playerMon: attacker,
        wildMon: aPokemon(16, 40),
        seed,
      })
      const before = battle.foe.mon.hp

      submitAction(battle, { type: 'move', index: 0 })

      dealt[state] += before - battle.foe.mon.hp
    }
  }

  const ratio = dealt.burned / dealt.healthy

  expect(ratio, `burned dealt ${ratio} of healthy output`).toBeGreaterThan(0.4)
  expect(ratio, `burned dealt ${ratio} of healthy output`).toBeLessThan(0.62)
})

test('Should fall back to Struggle when the PP runs out, and hurt the user with it', () => {
  const attacker = aPokemon(4, 30)

  attacker.moves = [{ move: 'scratch', pp: 0, maxPp: 35 }]

  const battle = createBattle({
    playerMon: attacker,
    wildMon: aPokemon(16, 30),
    seed: 11,
  })
  const before = battle.player.mon.hp

  const events = submitAction(battle, { type: 'move', index: 0 })

  expect(events.some((event) => event.text?.includes('Struggle'))).toBe(true)
  expect(battle.player.mon.hp, 'recoil should hurt').toBeLessThan(before)
})

test('Should apply the condition of a status move without dealing damage', () => {
  const attacker = aPokemon(25, 30)

  attacker.moves = [{ move: 'thunder-wave', pp: 20, maxPp: 20 }]

  const battle = createBattle({
    playerMon: attacker,
    wildMon: aPokemon(16, 30),
    seed: 2,
  })
  const before = battle.foe.mon.hp

  submitAction(battle, { type: 'move', index: 0 })

  expect(battle.foe.mon.status).toBe('paralysis')
  expect(battle.foe.mon.hp, 'Thunder Wave deals no damage').toBe(before)
})

test('Should burn away a fraction of HP at the end of the turn only for poison and burn', () => {
  const damageByStatus = {}

  for (const status of ['poison', 'burn', 'paralysis', 'sleep', null]) {
    const poisoned = aPokemon(1, 20)

    poisoned.status = status
    poisoned.statusTurns = 3

    const foe = aPokemon(25, 20)

    foe.moves = [{ move: 'thunder-wave', pp: 20, maxPp: 20 }]

    const battle = createBattle({ playerMon: poisoned, wildMon: foe, seed: 3 })
    const before = poisoned.hp

    submitAction(battle, { type: 'move', index: 0 })

    damageByStatus[status] = before - poisoned.hp
  }

  const maxHp = aPokemon(1, 20).stats.hp

  expect(damageByStatus.poison).toBe(Math.floor(maxHp / 8))
  expect(damageByStatus.burn).toBe(Math.floor(maxHp / 16))
  expect(damageByStatus.paralysis).toBe(0)
  expect(damageByStatus.sleep).toBe(0)
  expect(damageByStatus.null).toBe(0)
})

test('Should leave an immune target with nothing at all', () => {
  const attacker = aPokemon(25, 40)

  attacker.moves = [{ move: 'thunder-shock', pp: 30, maxPp: 30 }]

  const battle = createBattle({
    playerMon: attacker,
    wildMon: aPokemon(74, 20),
    seed: 4,
  })
  const before = battle.foe.mon.hp

  const events = submitAction(battle, { type: 'move', index: 0 })

  expect(battle.foe.mon.hp).toBe(before)
  expect(events.some((event) => event.text?.includes("doesn't affect"))).toBe(
    true,
  )
})

test('Should ignore an action once the battle is over', () => {
  const battle = createBattle({
    playerMon: aPokemon(4, 20),
    wildMon: aPokemon(16, 10),
    seed: 7,
  })

  submitAction(battle, { type: 'ball', key: 'master-ball' })

  expect(battle.over).toBe(true)

  const events = submitAction(battle, { type: 'move', index: 0 })

  expect(events).toEqual([])
})

test('Should keep playing after a round trip through JSON', () => {
  const battle = createBattle({
    playerMon: aPokemon(4, 20),
    wildMon: aPokemon(16, 10),
    seed: 77,
  })

  submitAction(battle, { type: 'move', index: 0 })

  const revived = JSON.parse(JSON.stringify(battle))
  const events = submitAction(revived, { type: 'move', index: 0 })

  expect(
    events.length,
    'should keep playing after being rehydrated',
  ).toBeGreaterThan(0)
})
