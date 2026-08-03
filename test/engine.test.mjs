// Engine tests. Pure logic only: no terminal, no save file, no network.
//
// Run with: node --test test/

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isDataReady, move as moveOf, species } from '../src/data.mjs'
import { effectiveness } from '../src/typechart.mjs'
import {
  expForLevel, expFromDefeating, expProgress, levelFromExp, movesAtLevel, statsAtLevel,
} from '../src/exp.mjs'
import { attemptCatch, catchValue } from '../src/capture.mjs'
import {
  createPokemon, displayName, evolveInto, genderOf, levelOf, pendingEvolution, refreshStats,
  speciesGender, speciesName,
} from '../src/pokemon.mjs'
import { createBattle, submitAction } from '../src/battle.mjs'
import { makeRng } from '../src/rng.mjs'

if (!isDataReady()) {
  throw new Error('dataset missing — run: node tools/fetch-data.mjs')
}

/** A Pokemon with fixed IVs, so tests never depend on a lucky roll. */
function mon(speciesId, level, ivValue = 15) {
  const created = createPokemon(speciesId, level, makeRng(1))
  for (const key of Object.keys(created.ivs)) created.ivs[key] = ivValue
  created.stats = statsAtLevel(speciesId, level, created.ivs)
  created.hp = created.stats.hp
  return created
}

// --- Type chart --------------------------------------------------------------

test('type effectiveness multiplies across both defending types', () => {
  assert.equal(effectiveness('water', ['fire']), 2)
  assert.equal(effectiveness('fire', ['water']), 0.5)
  assert.equal(effectiveness('electric', ['ground']), 0)
  assert.equal(effectiveness('normal', ['ghost']), 0)

  // Charizard is Fire/Flying, and Rock is strong against both.
  assert.equal(effectiveness('rock', species(6).types), 4)
  // Grass into Bulbasaur (Grass/Poison) is halved twice.
  assert.equal(effectiveness('grass', species(1).types), 0.25)
})

test('an immunity in either slot beats a weakness in the other', () => {
  // Gengar is Ghost/Poison: Normal cannot touch it regardless of the Poison half.
  assert.equal(effectiveness('normal', species(94).types), 0)
})

// --- Stats and experience ----------------------------------------------------

test('stats grow with level and HP carries its flat bonus', () => {
  const low = statsAtLevel(4, 5, Object.fromEntries(
    ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'].map((k) => [k, 15]),
  ))
  const high = statsAtLevel(4, 50, Object.fromEntries(
    ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed'].map((k) => [k, 15]),
  ))

  for (const stat of Object.keys(low)) {
    assert.ok(high[stat] > low[stat], `${stat} should grow`)
  }
  // A level 5 starter sits around 19-20 HP in the real games.
  assert.ok(low.hp >= 17 && low.hp <= 22, `level 5 HP was ${low.hp}`)
})

test('experience curves and levels agree in both directions', () => {
  for (const speciesId of [1, 25, 143, 150]) {
    for (const level of [1, 2, 10, 37, 99, 100]) {
      const exp = expForLevel(speciesId, level)
      assert.equal(levelFromExp(speciesId, exp), level, `#${speciesId} at level ${level}`)
    }
  }
})

test('one experience point short of a level is still the level below', () => {
  const exp = expForLevel(4, 20)
  assert.equal(levelFromExp(4, exp), 20)
  assert.equal(levelFromExp(4, exp - 1), 19)
})

test('experience progress reports a sane fraction', () => {
  const start = expForLevel(4, 10)
  const next = expForLevel(4, 11)
  const halfway = start + Math.floor((next - start) / 2)

  const progress = expProgress(4, halfway)
  assert.equal(progress.level, 10)
  assert.ok(progress.fraction > 0.4 && progress.fraction < 0.6, `fraction ${progress.fraction}`)
})

test('beating something bigger is worth more experience', () => {
  assert.ok(expFromDefeating(16, 20) > expFromDefeating(16, 5))
  // Snorlax gives more than Caterpie at the same level.
  assert.ok(expFromDefeating(143, 10) > expFromDefeating(10, 10))
})

test('a natural moveset is the last four moves learned', () => {
  const early = movesAtLevel(4, 1)
  assert.ok(early.length >= 1)
  assert.ok(early.includes('scratch'), `level 1 Charmander knows ${early.join(', ')}`)

  const late = movesAtLevel(4, 100)
  assert.equal(late.length, 4)
  assert.equal(new Set(late).size, 4, 'no duplicate move slots')
})

test('a starter leads with a move that attacks', () => {
  // First impressions: the default action on a brand new Pokemon should not be
  // Growl. Only true at low level — see the next test for why.
  for (const speciesId of [1, 4, 7, 25]) {
    const first = moveOf(movesAtLevel(speciesId, 1)[0])
    assert.notEqual(first.damageClass, 'status', `#${speciesId} leads with a status move`)
  }
})

test('every Pokemon has something to attack with', () => {
  // Not the same as slot 0 attacking. Keeping only the last four moves learned is
  // faithful to the games, and it genuinely can leave a status move in front:
  // Bulbasaur at 20 knows Growl, Leech Seed, Vine Whip, Poison Powder, having
  // dropped Tackle. What must never happen is a Pokemon that cannot fight at all.
  for (const mon of [1, 4, 7, 16, 19, 25, 74, 143, 150]) {
    for (const level of [1, 5, 20, 50, 100]) {
      const moves = movesAtLevel(mon, level)
      assert.ok(
        moves.some((name) => moveOf(name).damageClass !== 'status'),
        `#${mon} at level ${level} only knows status moves: ${moves.join(', ')}`,
      )
    }
  }
})

// --- Individual Pokemon ------------------------------------------------------

test('a created Pokemon is ready to battle', () => {
  const charmander = createPokemon(4, 5, makeRng(42))
  assert.equal(levelOf(charmander), 5)
  assert.equal(charmander.hp, charmander.stats.hp)
  assert.ok(charmander.moves.length >= 1)
  assert.ok(charmander.moves.every((slot) => slot.pp === slot.maxPp))
})

test('levelling up adds the HP gained rather than healing', () => {
  const charmander = mon(4, 10)
  charmander.hp = 5
  const beforeMax = charmander.stats.hp

  charmander.exp = expForLevel(4, 11)
  refreshStats(charmander)

  const gained = charmander.stats.hp - beforeMax
  assert.ok(gained > 0, 'max HP should rise')
  assert.equal(charmander.hp, 5 + gained)
  assert.ok(charmander.hp < charmander.stats.hp, 'a level up is not a full heal')
})

test('evolution keeps level and HP proportion', () => {
  const charmander = mon(4, 16)
  charmander.hp = Math.floor(charmander.stats.hp / 2)

  assert.equal(pendingEvolution(charmander), 5, 'Charmander evolves at 16')
  evolveInto(charmander, 5)

  assert.equal(charmander.species, 5)
  assert.equal(levelOf(charmander), 16)
  const fraction = charmander.hp / charmander.stats.hp
  assert.ok(fraction > 0.4 && fraction < 0.6, `kept ${fraction} of its health`)
})

test('a Pokemon below its evolution level does not evolve', () => {
  assert.equal(pendingEvolution(mon(4, 15)), null)
  // Pikachu needs a stone, so it never evolves on level alone.
  assert.equal(pendingEvolution(mon(25, 50)), null)
})

// --- Gender ------------------------------------------------------------------
//
// Derived from the Attack IV against the species' ratio, so it is never stored and
// never migrated. Pikachu is an even split, which puts the boundary at IV 16.

test('gender comes from the Attack IV against the species ratio', () => {
  const female = mon(25, 10)
  female.ivs.attack = 15
  assert.equal(genderOf(female), 'female')

  const male = mon(25, 10)
  male.ivs.attack = 16
  assert.equal(genderOf(male), 'male')

  // The ends of the range, so a ratio read as a percentage would not pass.
  const lowest = mon(25, 10)
  lowest.ivs.attack = 0
  assert.equal(genderOf(lowest), 'female')
  const highest = mon(25, 10)
  highest.ivs.attack = 31
  assert.equal(genderOf(highest), 'male')
})

test('the species with only one gender ignore the IV entirely', () => {
  for (const iv of [0, 15, 16, 31]) {
    const nidoranF = mon(29, 10)
    nidoranF.ivs.attack = iv
    assert.equal(genderOf(nidoranF), 'female', `Nidoran♀ at IV ${iv}`)

    const nidoranM = mon(32, 10)
    nidoranM.ivs.attack = iv
    assert.equal(genderOf(nidoranM), 'male', `Nidoran♂ at IV ${iv}`)
  }
})

test('the ones with no gender have none at any IV', () => {
  for (const id of [81, 132, 137, 150]) {
    for (const iv of [0, 31]) {
      const genderless = mon(id, 10)
      genderless.ivs.attack = iv
      assert.equal(genderOf(genderless), null, `${species(id).name} at IV ${iv}`)
    }
  }
})

test('gender survives an evolution, which keeps the IVs', () => {
  const bulbasaur = mon(1, 16)
  const before = genderOf(bulbasaur)
  assert.ok(before)

  evolveInto(bulbasaur, 2)
  assert.equal(genderOf(bulbasaur), before)
})

test('a dataset too old to know shows no gender, rather than all male', () => {
  const pikachu = mon(25, 10)
  pikachu.ivs.attack = 31
  assert.equal(genderOf(pikachu), 'male')

  // What an install predating the field has on disk: dataFile() prefers a local copy
  // of the Pokedex, so new code can be reading one written before genders existed.
  const entry = species(25)
  const { genderRate } = entry
  try {
    delete entry.genderRate
    assert.equal(genderOf(pikachu), null)
  } finally {
    entry.genderRate = genderRate
  }
})

test('the two Nidoran lose their suffix and are told apart by gender instead', () => {
  assert.equal(speciesName(29), 'Nidoran')
  assert.equal(speciesName(32), 'Nidoran')
  assert.equal(speciesGender(29), 'female')
  assert.equal(speciesGender(32), 'male')

  // An even split is nobody's species-wide gender.
  assert.equal(speciesGender(25), null)
  assert.equal(speciesGender(132), null)

  assert.equal(displayName(mon(29, 5)), 'Nidoran')
  const nicknamed = mon(29, 5)
  nicknamed.nickname = 'Spike'
  assert.equal(displayName(nicknamed), 'Spike')
})

// --- Catching ----------------------------------------------------------------

test('a weakened Pokemon is easier to catch than a healthy one', () => {
  const pidgey = mon(16, 10)
  const healthy = catchValue(pidgey, 'poke-ball')

  pidgey.hp = 1
  const weakened = catchValue(pidgey, 'poke-ball')

  assert.ok(weakened > healthy, `${weakened} should beat ${healthy}`)
})

test('better balls and status conditions both help', () => {
  const pidgey = mon(16, 10)
  assert.ok(catchValue(pidgey, 'ultra-ball') > catchValue(pidgey, 'poke-ball'))

  const plain = catchValue(pidgey, 'poke-ball')
  pidgey.status = 'sleep'
  assert.equal(catchValue(pidgey, 'poke-ball'), plain * 2)
})

test('a Master Ball never fails, even on Mewtwo at full health', () => {
  const mewtwo = mon(150, 70)
  for (let seed = 1; seed <= 50; seed++) {
    assert.equal(attemptCatch(mewtwo, 'master-ball', makeRng(seed)).caught, true)
  }
})

test('Mewtwo at full health resists a Poke Ball', () => {
  const mewtwo = mon(150, 70)
  let caught = 0
  for (let seed = 1; seed <= 200; seed++) {
    if (attemptCatch(mewtwo, 'poke-ball', makeRng(seed)).caught) caught++
  }
  assert.ok(caught <= 4, `caught ${caught} times out of 200, which is too generous`)
})

test('an untouched Caterpie takes a few balls, a weakened one goes straight down', () => {
  // Even at capture rate 255, full health caps the odds near a third. Weakening it
  // first is what makes catching reliable, which is the whole point of the mechanic.
  const healthy = mon(10, 5)
  let caughtHealthy = 0
  for (let seed = 1; seed <= 400; seed++) {
    if (attemptCatch(healthy, 'poke-ball', makeRng(seed)).caught) caughtHealthy++
  }
  const healthyRate = caughtHealthy / 400
  assert.ok(healthyRate > 0.2 && healthyRate < 0.5, `full health rate was ${healthyRate}`)

  const weakened = mon(10, 5)
  weakened.hp = 1
  let caughtWeak = 0
  for (let seed = 1; seed <= 400; seed++) {
    if (attemptCatch(weakened, 'poke-ball', makeRng(seed)).caught) caughtWeak++
  }
  assert.ok(caughtWeak / 400 > 0.95, `weakened rate was only ${caughtWeak / 400}`)
})

// --- Battle ------------------------------------------------------------------

function freshBattle(seed = 7, playerLevel = 20, foeLevel = 10) {
  return createBattle({
    playerMon: mon(4, playerLevel),
    wildMon: mon(16, foeLevel),
    seed,
  })
}

/**
 * The slot holding a move that actually deals damage.
 *
 * Natural movesets can lead with a status move, so tests that need damage have to
 * ask for it rather than assuming slot 0.
 */
function attackSlot(battleMon) {
  const index = battleMon.moves.findIndex((slot) => moveOf(slot.move).damageClass !== 'status')
  assert.notEqual(index, -1, 'test Pokemon has no damaging move')
  return index
}

test('the same seed and actions replay identically', () => {
  const runOnce = () => {
    const battle = freshBattle(1234)
    const log = []
    for (let turn = 0; turn < 6 && !battle.over; turn++) {
      log.push(...submitAction(battle, { type: 'move', index: 0 }))
    }
    return { log, outcome: battle.outcome, hp: battle.foe.mon.hp }
  }

  assert.deepEqual(runOnce(), runOnce())
})

test('attacking damages the foe and spends PP', () => {
  const battle = freshBattle()
  const slot = attackSlot(battle.player.mon)
  const before = battle.foe.mon.hp
  const ppBefore = battle.player.mon.moves[slot].pp

  const events = submitAction(battle, { type: 'move', index: slot })

  assert.ok(battle.foe.mon.hp < before, 'the foe should have taken damage')
  assert.equal(battle.player.mon.moves[slot].pp, ppBefore - 1)
  assert.ok(events.some((event) => event.type === 'damage'))
})

test('beating the foe ends the battle and pays out', () => {
  const battle = freshBattle(99, 40, 5)
  const slot = attackSlot(battle.player.mon)

  let guard = 0
  while (!battle.over && guard++ < 30) submitAction(battle, { type: 'move', index: slot })

  assert.equal(battle.over, true)
  assert.equal(battle.outcome, 'win')
  assert.ok(battle.rewards.exp > 0, 'should award experience')
  assert.ok(battle.rewards.money > 0, 'should award money')
  assert.ok(battle.foe.mon.hp <= 0)
})

test('losing is reported as a loss, not a win', () => {
  const battle = createBattle({
    playerMon: mon(129, 5), // Magikarp, which only knows Splash
    wildMon: mon(150, 70), // Mewtwo
    seed: 3,
  })

  let guard = 0
  while (!battle.over && guard++ < 60) submitAction(battle, { type: 'move', index: 0 })

  assert.equal(battle.outcome, 'loss')
  assert.ok(battle.player.mon.hp <= 0)
  assert.equal(battle.rewards, null, 'a loss pays nothing')
})

test('a faster Pokemon always escapes', () => {
  for (let seed = 1; seed <= 20; seed++) {
    // Charizard outruns a Caterpie every time.
    const battle = createBattle({ playerMon: mon(6, 50), wildMon: mon(10, 5), seed })
    const events = submitAction(battle, { type: 'run' })
    assert.equal(battle.outcome, 'fled', `seed ${seed}`)
    assert.ok(events.some((event) => event.text === 'Got away safely!'))
  }
})

test('catching in battle ends it as caught', () => {
  const battle = freshBattle()
  const events = submitAction(battle, { type: 'ball', key: 'master-ball' })

  assert.equal(battle.outcome, 'caught')
  assert.ok(events.some((event) => event.type === 'catch' && event.caught))
})

test('a failed ball still gives the foe its turn', () => {
  // Snorlax has the bulk to survive the reply, so the test is about the turn
  // being taken rather than about who wins.
  const battle = createBattle({ playerMon: mon(143, 70), wildMon: mon(150, 70), seed: 5 })
  const before = battle.player.mon.hp

  submitAction(battle, { type: 'ball', key: 'poke-ball' })

  assert.equal(battle.outcome, null, 'Mewtwo should not be caught by one Poke Ball')
  assert.ok(battle.player.mon.hp < before, 'the foe should have attacked back')
})

test('super effective hits harder than resisted ones', () => {
  // Charmander's Ember into Bulbasaur (Grass, weak to Fire) versus into
  // Squirtle (Water, resists it). Averaged over seeds to survive the damage roll.
  const total = { strong: 0, weak: 0 }

  for (let seed = 1; seed <= 40; seed++) {
    for (const [key, foeId] of [['strong', 1], ['weak', 7]]) {
      const charmander = mon(4, 30)
      // Force Ember into the first slot.
      charmander.moves = [{ move: 'ember', pp: 25, maxPp: 25 }]
      const battle = createBattle({ playerMon: charmander, wildMon: mon(foeId, 30), seed })
      const before = battle.foe.mon.hp
      submitAction(battle, { type: 'move', index: 0 })
      total[key] += before - battle.foe.mon.hp
    }
  }

  assert.ok(total.strong > total.weak * 2, `${total.strong} versus ${total.weak}`)
})

test('a burn halves physical damage', () => {
  const dealt = { healthy: 0, burned: 0 }

  for (let seed = 1; seed <= 40; seed++) {
    for (const state of ['healthy', 'burned']) {
      const attacker = mon(4, 30)
      attacker.moves = [{ move: 'scratch', pp: 35, maxPp: 35 }]
      if (state === 'burned') attacker.status = 'burn'

      const battle = createBattle({ playerMon: attacker, wildMon: mon(16, 40), seed })
      const before = battle.foe.mon.hp
      submitAction(battle, { type: 'move', index: 0 })
      dealt[state] += before - battle.foe.mon.hp
    }
  }

  const ratio = dealt.burned / dealt.healthy
  assert.ok(ratio > 0.4 && ratio < 0.62, `burned dealt ${ratio} of healthy output`)
})

test('running out of PP falls back to Struggle, which hurts the user', () => {
  const attacker = mon(4, 30)
  attacker.moves = [{ move: 'scratch', pp: 0, maxPp: 35 }]

  const battle = createBattle({ playerMon: attacker, wildMon: mon(16, 30), seed: 11 })
  const before = battle.player.mon.hp
  const events = submitAction(battle, { type: 'move', index: 0 })

  assert.ok(events.some((event) => event.text?.includes('Struggle')), 'should use Struggle')
  assert.ok(battle.player.mon.hp < before, 'recoil should hurt')
})

test('a status move applies its condition without dealing damage', () => {
  const attacker = mon(25, 30)
  attacker.moves = [{ move: 'thunder-wave', pp: 20, maxPp: 20 }]

  const battle = createBattle({ playerMon: attacker, wildMon: mon(16, 30), seed: 2 })
  const before = battle.foe.mon.hp
  submitAction(battle, { type: 'move', index: 0 })

  assert.equal(battle.foe.mon.status, 'paralysis')
  assert.equal(battle.foe.mon.hp, before, 'Thunder Wave deals no damage')
})

test('an immune target takes nothing at all', () => {
  const attacker = mon(25, 40)
  attacker.moves = [{ move: 'thunder-shock', pp: 30, maxPp: 30 }]

  // Geodude is Rock/Ground, so Electric cannot touch it.
  const battle = createBattle({ playerMon: attacker, wildMon: mon(74, 20), seed: 4 })
  const before = battle.foe.mon.hp
  const events = submitAction(battle, { type: 'move', index: 0 })

  assert.equal(battle.foe.mon.hp, before)
  assert.ok(events.some((event) => event.text?.includes("doesn't affect")))
})

test('actions after the battle is over do nothing', () => {
  const battle = freshBattle()
  submitAction(battle, { type: 'ball', key: 'master-ball' })
  assert.equal(battle.over, true)

  const events = submitAction(battle, { type: 'move', index: 0 })
  assert.deepEqual(events, [])
})

test('a battle survives a round trip through JSON', () => {
  const battle = freshBattle(77)
  submitAction(battle, { type: 'move', index: 0 })

  const revived = JSON.parse(JSON.stringify(battle))
  const events = submitAction(revived, { type: 'move', index: 0 })

  assert.ok(events.length > 0, 'should keep playing after being rehydrated')
})
