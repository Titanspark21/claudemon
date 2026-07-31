// Save file, items and progression.
//
// Runs against a throwaway CLAUDEMON_HOME so a test can never touch a real save.
// The dataset is symlinked in rather than copied, since it is read-only here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, symlinkSync, existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

// Must happen before importing anything that resolves paths at module load.
const sandbox = mkdtempSync(join(tmpdir(), 'claudemon-test-'))
const realData = join(process.env.CLAUDEMON_HOME || join(homedir(), '.claudemon'), 'data')
if (existsSync(realData)) symlinkSync(realData, join(sandbox, 'data'))
process.env.CLAUDEMON_HOME = sandbox

const { isDataReady, move: moveOf, species } = await import('../src/data.mjs')
const { SAVE_FILE } = await import('../src/paths.mjs')
const {
  activePokemon, addPokemon, createSave, healParty, loadSave, markSeen,
  partyIsWipedOut, PARTY_LIMIT, saveGame, setLead, totalBalls,
} = await import('../src/state.mjs')
const { buy, countOf, ITEMS, useItem, ballsInBag } = await import('../src/shop.mjs')
const { applyVictory, learnMove, MOVE_LIMIT } = await import('../src/progression.mjs')
const { createPokemon, levelOf, isFainted } = await import('../src/pokemon.mjs')
const { expForLevel } = await import('../src/exp.mjs')
const { makeRng } = await import('../src/rng.mjs')

if (!isDataReady()) {
  throw new Error('dataset missing — run: node tools/fetch-data.mjs')
}

function newSave(starter = 4) {
  return createSave({ trainer: 'Tester', starterId: starter, rng: makeRng(7) })
}

// --- Save file ---------------------------------------------------------------

test('a new save starts with a level 5 starter and some supplies', () => {
  const save = newSave(4)

  assert.equal(save.party.length, 1)
  assert.equal(save.party[0].species, 4)
  assert.equal(levelOf(save.party[0]), 5)
  assert.ok(save.money > 0)
  assert.ok(totalBalls(save) > 0)
  assert.deepEqual(save.dex.caught, [4], 'the starter counts as caught')
})

test('a save survives a write and a read', () => {
  const save = newSave(7)
  save.money = 4242
  save.party[0].hp = 3
  saveGame(save)

  assert.ok(existsSync(SAVE_FILE))
  const loaded = loadSave()
  assert.equal(loaded.money, 4242)
  assert.equal(loaded.party[0].species, 7)
  assert.equal(loaded.party[0].hp, 3)
})

test('loading a save with missing fields fills them in rather than failing', () => {
  const bare = { party: [createPokemon(4, 5, makeRng(1))] }
  saveGame(bare)

  const loaded = loadSave()
  assert.ok(Array.isArray(loaded.box))
  assert.ok(loaded.dex.seen)
  assert.equal(typeof loaded.money, 'number')
  assert.equal(loaded.party.length, 1, 'the team survives the migration')
})

test('a caught Pokemon joins the party until it is full, then goes to the box', () => {
  const save = newSave()
  for (let i = 1; i < PARTY_LIMIT; i++) {
    assert.equal(addPokemon(save, createPokemon(16, 5, makeRng(i))), 'party')
  }
  assert.equal(save.party.length, PARTY_LIMIT)

  assert.equal(addPokemon(save, createPokemon(19, 5, makeRng(99))), 'box')
  assert.equal(save.box.length, 1)
})

test('the active Pokemon skips fainted ones', () => {
  const save = newSave()
  addPokemon(save, createPokemon(16, 5, makeRng(2)))

  save.party[0].hp = 0
  assert.equal(activePokemon(save).species, 16)

  save.party[1].hp = 0
  assert.equal(activePokemon(save), null)
  assert.equal(partyIsWipedOut(save), true)

  healParty(save)
  assert.ok(save.party.every((mon) => !isFainted(mon)))
  assert.equal(partyIsWipedOut(save), false)
})

test('setting a lead moves it to the front', () => {
  const save = newSave()
  addPokemon(save, createPokemon(25, 9, makeRng(3)))

  setLead(save, 1)
  assert.equal(save.party[0].species, 25)
  assert.equal(save.party[1].species, 4)
})

test('the Pokedex records what was only seen separately from what was caught', () => {
  const save = newSave()
  markSeen(save, 150)

  assert.ok(save.dex.seen.includes(150))
  assert.ok(!save.dex.caught.includes(150))

  markSeen(save, 150)
  assert.equal(save.dex.seen.filter((id) => id === 150).length, 1, 'no duplicates')
})

// --- Shop and items ----------------------------------------------------------

test('buying costs money and stocks the bag', () => {
  const save = newSave()
  save.money = 1000
  const before = countOf(save, 'poke-ball')

  const result = buy(save, 'poke-ball', 2)
  assert.equal(result.ok, true)
  assert.equal(save.money, 1000 - ITEMS['poke-ball'].price * 2)
  assert.equal(countOf(save, 'poke-ball'), before + 2)
})

test('you cannot buy what you cannot afford, and nothing changes when you try', () => {
  const save = newSave()
  save.money = 10
  const before = countOf(save, 'ultra-ball')

  const result = buy(save, 'ultra-ball')
  assert.equal(result.ok, false)
  assert.equal(save.money, 10, 'money must not move')
  assert.equal(countOf(save, 'ultra-ball'), before)
})

test('the Master Ball is not for sale', () => {
  const save = newSave()
  save.money = 999999
  assert.equal(buy(save, 'master-ball').ok, false)
})

test('a potion heals, and does nothing at full health', () => {
  const save = newSave()
  const mon = save.party[0]
  mon.hp = 1

  const healed = useItem(save, 'potion', mon)
  assert.equal(healed.ok, true)
  assert.equal(mon.hp, Math.min(mon.stats.hp, 1 + 20))

  const afterHealing = countOf(save, 'potion')
  mon.hp = mon.stats.hp
  const wasted = useItem(save, 'potion', mon)
  assert.equal(wasted.ok, false)
  assert.equal(countOf(save, 'potion'), afterHealing, 'a refused item is not consumed')
})

test('a revive only works on a fainted Pokemon', () => {
  const save = newSave()
  save.bag.revive = 2
  const mon = save.party[0]

  assert.equal(useItem(save, 'revive', mon).ok, false)

  mon.hp = 0
  assert.equal(useItem(save, 'revive', mon).ok, true)
  assert.equal(mon.hp, Math.floor(mon.stats.hp / 2))
  assert.equal(countOf(save, 'revive'), 1)
})

test('the right stone evolves and the wrong one does nothing', () => {
  const save = newSave(4)
  save.bag['thunder-stone'] = 1
  save.bag['fire-stone'] = 1
  const pikachu = createPokemon(25, 20, makeRng(4))
  addPokemon(save, pikachu)

  const wrong = useItem(save, 'fire-stone', pikachu)
  assert.equal(wrong.ok, false)
  assert.equal(countOf(save, 'fire-stone'), 1, 'a wasted stone is kept')

  const right = useItem(save, 'thunder-stone', pikachu)
  assert.equal(right.ok, true)
  assert.equal(right.evolvedInto, 26, 'Pikachu becomes Raichu')
  assert.equal(countOf(save, 'thunder-stone'), 0)
})

test('the battle menu only lists balls you actually have', () => {
  const save = newSave()
  save.bag = { 'poke-ball': 2, potion: 1 }
  assert.deepEqual(ballsInBag(save), ['poke-ball'])

  save.bag['ultra-ball'] = 1
  assert.deepEqual(ballsInBag(save), ['poke-ball', 'ultra-ball'], 'weakest first')
})

// --- Progression -------------------------------------------------------------

test('winning pays out money and experience', () => {
  const save = newSave()
  const mon = save.party[0]
  const expBefore = mon.exp
  const moneyBefore = save.money

  const steps = applyVictory(save, [mon], { exp: 50, money: 120 })

  assert.equal(save.money, moneyBefore + 120)
  assert.equal(mon.exp, expBefore + 50)
  assert.ok(steps.some((step) => step.kind === 'money'))
  assert.ok(steps.some((step) => step.kind === 'exp'))
})

test('enough experience levels a Pokemon up and raises its stats', () => {
  const save = newSave()
  const mon = save.party[0]
  const statsBefore = { ...mon.stats }

  // Exactly enough to reach level 12 from level 5.
  const steps = applyVictory(save, [mon], { exp: expForLevel(4, 12) - mon.exp, money: 0 })

  assert.equal(levelOf(mon), 12)
  assert.ok(mon.stats.attack > statsBefore.attack)
  const levels = steps.filter((step) => step.kind === 'level')
  assert.equal(levels.length, 7, 'one step per level crossed')
  assert.equal(levels.at(-1).level, 12)
})

test('moves learned on the way up are picked up, not skipped', () => {
  const save = newSave(4)
  const mon = save.party[0]
  mon.moves = mon.moves.slice(0, 1) // room to learn

  const steps = applyVictory(save, [mon], { exp: expForLevel(4, 15) - mon.exp, money: 0 })
  const learned = steps.filter((step) => step.kind === 'learn')

  assert.ok(learned.length > 0, 'Charmander learns Ember at 9 and Leer at 15')
  assert.ok(mon.moves.some((slot) => slot.move === 'ember'))
})

test('a full moveset asks which move to forget instead of silently dropping one', () => {
  const save = newSave(4)
  const mon = save.party[0]
  mon.moves = ['scratch', 'growl', 'tackle', 'leer'].map((name) => ({
    move: name, pp: moveOf(name).pp, maxPp: moveOf(name).pp,
  }))

  const steps = applyVictory(save, [mon], { exp: expForLevel(4, 10) - mon.exp, money: 0 })
  const choice = steps.find((step) => step.kind === 'learn-choice')

  assert.ok(choice, 'should ask rather than decide')
  assert.equal(mon.moves.length, MOVE_LIMIT, 'nothing changed until answered')

  const result = learnMove(mon, choice.move, 1)
  assert.equal(result.learned, true)
  assert.equal(result.forgot, 'growl')
  assert.equal(mon.moves[1].move, choice.move)
  assert.equal(mon.moves.length, MOVE_LIMIT)
})

test('declining to learn a move leaves the moveset alone', () => {
  const save = newSave(4)
  const mon = save.party[0]
  const before = mon.moves.map((slot) => slot.move)

  const result = learnMove(mon, 'flamethrower', null)
  assert.equal(result.learned, false)
  assert.deepEqual(mon.moves.map((slot) => slot.move), before)
})

test('reaching the evolution level evolves at the end of the payout', () => {
  const save = newSave(4)
  const mon = save.party[0]

  const steps = applyVictory(save, [mon], { exp: expForLevel(4, 16) - mon.exp, money: 0 })
  const evolve = steps.find((step) => step.kind === 'evolve')

  assert.ok(evolve, 'Charmander evolves at 16')
  assert.equal(evolve.to, 5)
  assert.equal(mon.species, 5)
  assert.equal(species(mon.species).name, 'Charmeleon')
  // The evolve step comes after every level step.
  assert.equal(steps.at(-1).kind, 'evolve')
})

test('everyone who took part earns the experience, and the money is paid once', () => {
  const save = newSave()
  const starter = save.party[0]
  const backup = createPokemon(16, 5, makeRng(8))
  addPokemon(save, backup)
  const moneyBefore = save.money
  const expBefore = { starter: starter.exp, backup: backup.exp }

  const steps = applyVictory(save, [starter, backup], { exp: 50, money: 120 })

  assert.equal(starter.exp, expBefore.starter + 50, 'the one that finished it earns')
  assert.equal(backup.exp, expBefore.backup + 50, 'and so does the one that only stood there')
  assert.equal(save.money, moneyBefore + 120, 'the prize is the trainer\'s, not a share each')
  assert.equal(steps.filter((step) => step.kind === 'exp').length, 2, 'one line each')
  assert.equal(steps.filter((step) => step.kind === 'money').length, 1)
})

test('a Pokemon still fainted at the end earns nothing', () => {
  const save = newSave()
  const starter = save.party[0]
  const knockedOut = createPokemon(16, 5, makeRng(9))
  addPokemon(save, knockedOut)
  knockedOut.hp = 0
  const expBefore = knockedOut.exp

  const steps = applyVictory(save, [knockedOut, starter], { exp: 50, money: 0 })

  assert.equal(knockedOut.exp, expBefore, 'it was carried off before the payout')
  assert.equal(steps.filter((step) => step.kind === 'exp').length, 1, 'and is not announced')
})

test('a step says which Pokemon it is about, bench included', () => {
  const save = newSave(4)
  const mon = save.party[0]
  mon.moves = mon.moves.slice(0, 1)

  const steps = applyVictory(save, [mon], { exp: expForLevel(4, 16) - mon.exp, money: 0 })

  assert.ok(steps.length > 0)
  assert.ok(steps.every((step) => step.kind === 'money' || step.mon === mon))
})

test('a Pokemon that gains no level just gains experience', () => {
  const save = newSave()
  const mon = save.party[0]
  const steps = applyVictory(save, [mon], { exp: 1, money: 1 })

  assert.equal(levelOf(mon), 5)
  assert.ok(!steps.some((step) => step.kind === 'level'))
})
