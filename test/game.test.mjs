import { expect, test } from 'vitest'
import { existsSync } from 'node:fs'

import { useSandboxHome } from './sandboxHome.mjs'

useSandboxHome('claudemon-test-')

const { EMPTY_STATS, ITEMS, MOVE_LIMIT, PARTY_LIMIT } =
  await import('../src/constants.mjs')
const { isDataReady, move: moveOf, species } = await import('../src/data.mjs')
const { SAVE_FILE } = await import('../src/paths.mjs')
const {
  activePokemon,
  addPokemon,
  createSave,
  depositPokemon,
  healParty,
  loadSave,
  markFaced,
  markSeen,
  partyIsWipedOut,
  publishStatus,
  publishStatusSnapshot,
  recordPlayday,
  saveGame,
  setLead,
  timesFaced,
  totalBalls,
  withdrawPokemon,
} = await import('../src/state.mjs')
const { buy, countOf, useItem, ballsInBag } = await import('../src/shop.mjs')
const { applyVictory, learnMove } = await import('../src/progression.mjs')
const { createPokemon, levelOf, isFainted } = await import('../src/pokemon.mjs')
const { expForLevel } = await import('../src/exp.mjs')
const { makeRng } = await import('../src/rng.mjs')
const { readStatus } = await import('../src/status.mjs')

if (!isDataReady()) {
  throw new Error('dataset missing — run: node tools/fetch-data.mjs')
}

test('Should read a missing save as no game yet', () => {
  expect(loadSave()).toBeNull()
})

test('Should start a new save with a level 5 starter and some supplies', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  expect(save.party).toHaveLength(1)
  expect(save.party[0].species).toBe(4)
  expect(levelOf(save.party[0])).toBe(5)
  expect(save.money).toBeGreaterThan(0)
  expect(totalBalls(save)).toBeGreaterThan(0)
  expect(save.dex.caught, 'the starter counts as caught').toEqual([4])
})

test('Should open the streak on a new save and only move it on a later day', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const started = new Date(save.stats.lastPlayedAt)
  const tomorrow = new Date(started)

  tomorrow.setDate(tomorrow.getDate() + 1)

  expect(save.stats.streak).toBe(1)
  expect(
    recordPlayday(save, started.getTime() + 60_000),
    'the same day again',
  ).toBe(false)
  expect(save.stats.streak).toBe(1)

  expect(recordPlayday(save, tomorrow.getTime()), 'the day after').toBe(true)
  expect(save.stats.streak).toBe(2)
})

test('Should hand a save back from disk exactly as it was written', () => {
  const save = createSave({ trainer: 'Tester', starterId: 7, rng: makeRng(7) })

  save.money = 4242
  save.party[0].hp = 3
  saveGame(save)

  expect(existsSync(SAVE_FILE)).toBe(true)

  const loaded = loadSave()

  expect(loaded.trainer.name).toBe('Tester')
  expect(loaded.money).toBe(4242)
  expect(loaded.party[0].species).toBe(7)
  expect(loaded.party[0].hp).toBe(3)
  expect(loaded.party[0].moves.map((slot) => slot.move)).toEqual(
    save.party[0].moves.map((slot) => slot.move),
  )
})

test('Should keep the newer save when two loaded copies write', () => {
  const initial = createSave({
    trainer: 'Tester',
    starterId: 4,
    rng: makeRng(7),
  })

  saveGame(initial)

  const first = loadSave()
  const second = loadSave()

  first.money = 1111
  saveGame(first)

  second.money = 2222
  const resolved = saveGame(second)

  expect(loadSave().money).toBe(1111)
  expect(resolved.money).toBe(1111)
})

test('Should publish the biome and visit revision with the status', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  save.expedition = { biome: 'forest', visitRevision: 3 }
  publishStatus(save)

  expect(readStatus()).toMatchObject({ biome: 'forest', visitRevision: 3 })
})

test('Should publish an expedition snapshot without making a closed companion look live', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(8) })

  save.expedition = { biome: 'coast', visitRevision: 5 }
  publishStatusSnapshot(save, 123)

  expect(readStatus()).toMatchObject({
    biome: 'coast',
    visitRevision: 5,
    heartbeat: 123,
  })
})

test('Should fill in the fields a save is missing rather than failing to load it', () => {
  saveGame({ party: [createPokemon(4, 5, makeRng(1))] })

  const loaded = loadSave()

  expect(loaded.box).toEqual([])
  expect(loaded.dex).toStrictEqual({
    seen: [4],
    caught: [4],
    shiny: [],
    faced: {},
  })
  expect(loaded.stats).toStrictEqual(EMPTY_STATS)
  expect(loaded.money, 'a save from before money starts at nothing').toBe(0)
  expect(loaded.party, 'the team survives the migration').toHaveLength(1)

  expect(
    loaded.bag,
    'a save from before the bag has an empty one',
  ).toStrictEqual({})
  expect(countOf(loaded, 'potion')).toBe(0)

  loaded.money = 1000

  expect(buy(loaded, 'potion').ok, 'and it can be shopped into').toBe(true)
  expect(countOf(loaded, 'potion')).toBe(1)
})

test('Should put a caught Pokemon in the party until it is full, then in the box', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  for (let i = 1; i < PARTY_LIMIT; i++) {
    expect(addPokemon(save, createPokemon(16, 5, makeRng(i)))).toBe('party')
  }

  expect(save.party).toHaveLength(PARTY_LIMIT)

  expect(addPokemon(save, createPokemon(19, 5, makeRng(99)))).toBe('box')
  expect(save.box).toHaveLength(1)
})

test('Should give a caught shiny its own Pokedex entry, and keep it across a save', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  addPokemon(save, createPokemon(16, 5, makeRng(1)))
  addPokemon(save, createPokemon(19, 5, makeRng(2), true))

  expect(save.dex.caught, 'both count as caught').toEqual([4, 16, 19])
  expect(save.dex.shiny, 'only the rare one is starred').toEqual([19])

  saveGame(save)

  expect(
    loadSave().dex.shiny,
    'a shiny is not lost on the way to disk',
  ).toEqual([19])
})

test('Should hand a Pokemon back out of the box once there is room for it', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  for (let i = 1; i < PARTY_LIMIT; i++) {
    addPokemon(save, createPokemon(16, 5, makeRng(i)))
  }

  addPokemon(save, createPokemon(19, 5, makeRng(99)))

  expect(withdrawPokemon(save, 0)).toBe(false)
  expect(save.box).toHaveLength(1)
  expect(withdrawPokemon(save, 4), 'and nothing out of range moves').toBe(false)

  expect(depositPokemon(save, PARTY_LIMIT - 1)).toBe(true)
  expect(save.party).toHaveLength(PARTY_LIMIT - 1)
  expect(save.box).toHaveLength(2)

  expect(withdrawPokemon(save, 0)).toBe(true)
  expect(save.party).toHaveLength(PARTY_LIMIT)
  expect(save.party[PARTY_LIMIT - 1].species).toBe(19)
})

test('Should refuse to send the last Pokemon to the box', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  expect(depositPokemon(save, 0)).toBe(false)
  expect(save.party).toHaveLength(1)
  expect(save.box).toHaveLength(0)
})

test('Should skip the fainted ones when picking the active Pokemon', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  addPokemon(save, createPokemon(16, 5, makeRng(2)))

  save.party[0].hp = 0

  expect(activePokemon(save).species).toBe(16)

  save.party[1].hp = 0

  expect(activePokemon(save)).toBe(null)
  expect(partyIsWipedOut(save)).toBe(true)

  healParty(save)

  expect(save.party.some(isFainted), 'healing brings everyone back').toBe(false)
  expect(partyIsWipedOut(save)).toBe(false)
})

test('Should move a Pokemon to the front when it is made the lead', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  addPokemon(save, createPokemon(25, 9, makeRng(3)))
  setLead(save, 1)

  expect(save.party.map((mon) => mon.species)).toEqual([25, 4])
})

test('Should record what the Pokedex only saw apart from what it caught', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  markSeen(save, 150)

  expect(save.dex.seen).toContain(150)
  expect(save.dex.caught).not.toContain(150)

  markSeen(save, 150)

  expect(
    save.dex.seen.filter((id) => id === 150),
    'no duplicates',
  ).toEqual([150])
})

test('Should keep a tally of how many of each you have faced', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  expect(timesFaced(save, 16), 'nothing faced yet').toBe(0)

  markSeen(save, 16)

  expect(timesFaced(save, 16), 'and seeing one is not facing it').toBe(0)

  markFaced(save, 16)
  markFaced(save, 16)
  markFaced(save, 19)

  expect(timesFaced(save, 16)).toBe(2)
  expect(timesFaced(save, 19)).toBe(1)
  expect(
    save.dex.seen,
    'facing one you had never met also records it',
  ).toContain(19)

  saveGame(save)

  expect(timesFaced(loadSave(), 16)).toBe(2)
})

test('Should count from zero on a save from before the tally rather than guessing', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  markSeen(save, 150)
  delete save.dex.faced
  saveGame(save)

  const loaded = loadSave()

  expect(loaded.dex.faced, 'no invented numbers').toStrictEqual({})
  expect(timesFaced(loaded, 150)).toBe(0)

  markFaced(loaded, 150)

  expect(timesFaced(loaded, 150), 'and it counts from here').toBe(1)
})

test('Should charge money and stock the bag when you buy', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  save.money = 1000

  const before = countOf(save, 'poke-ball')
  const result = buy(save, 'poke-ball', 2)

  expect(result.ok).toBe(true)
  expect(save.money).toBe(1000 - ITEMS['poke-ball'].price * 2)
  expect(countOf(save, 'poke-ball')).toBe(before + 2)
})

test('Should refuse what you cannot afford and change nothing when you try', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  save.money = 10

  const before = countOf(save, 'ultra-ball')
  const result = buy(save, 'ultra-ball')

  expect(result.ok).toBe(false)
  expect(save.money, 'money must not move').toBe(10)
  expect(countOf(save, 'ultra-ball')).toBe(before)
})

test('Should keep the Master Ball out of the shop', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  save.money = 999999

  expect(buy(save, 'master-ball').ok).toBe(false)
})

test('Should heal with a potion and do nothing at full health', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const mon = save.party[0]

  mon.hp = 1

  const healed = useItem(save, 'potion', mon)

  expect(healed.ok).toBe(true)
  expect(mon.hp).toBe(Math.min(mon.stats.hp, 1 + ITEMS.potion.heals))

  const afterHealing = countOf(save, 'potion')

  mon.hp = mon.stats.hp

  const wasted = useItem(save, 'potion', mon)

  expect(wasted.ok).toBe(false)
  expect(countOf(save, 'potion'), 'a refused item is not consumed').toBe(
    afterHealing,
  )
})

test('Should only let a revive work on a fainted Pokemon', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const mon = save.party[0]

  save.bag.revive = 2

  expect(useItem(save, 'revive', mon).ok).toBe(false)

  mon.hp = 0

  expect(useItem(save, 'revive', mon).ok).toBe(true)
  expect(mon.hp).toBe(Math.floor(mon.stats.hp / 2))
  expect(countOf(save, 'revive')).toBe(1)
})

test('Should evolve with the right stone and do nothing with the wrong one', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const pikachu = createPokemon(25, 20, makeRng(4))

  save.bag['thunder-stone'] = 1
  save.bag['fire-stone'] = 1
  addPokemon(save, pikachu)

  const wrong = useItem(save, 'fire-stone', pikachu)

  expect(wrong.ok).toBe(false)
  expect(countOf(save, 'fire-stone'), 'a wasted stone is kept').toBe(1)

  const right = useItem(save, 'thunder-stone', pikachu)

  expect(right.ok).toBe(true)
  expect(right.evolvedInto, 'Pikachu becomes Raichu').toBe(26)
  expect(pikachu.species, 'and it has actually evolved').toBe(26)
  expect(right.message).toMatch(/RAICHU/)
  expect(countOf(save, 'thunder-stone')).toBe(0)
})

test('Should only list the balls you actually have, weakest first', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  save.bag = { 'poke-ball': 2, potion: 1 }

  expect(ballsInBag(save)).toEqual(['poke-ball'])

  save.bag['ultra-ball'] = 1

  expect(ballsInBag(save)).toEqual(['poke-ball', 'ultra-ball'])
})

test('Should pay out money and experience for winning', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const mon = save.party[0]
  const expBefore = mon.exp
  const moneyBefore = save.money

  const steps = applyVictory(save, [mon], { exp: 50, money: 120 })

  expect(save.money).toBe(moneyBefore + 120)
  expect(mon.exp).toBe(expBefore + 50)
  expect(steps.map((step) => step.kind)).toEqual(['money', 'exp', 'level'])
})

test('Should level a Pokemon up and raise its stats once it has the experience', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const mon = save.party[0]
  const statsBefore = { ...mon.stats }

  const steps = applyVictory(save, [mon], {
    exp: expForLevel(4, 12) - mon.exp,
    money: 0,
  })
  const levels = steps.filter((step) => step.kind === 'level')

  expect(levelOf(mon)).toBe(12)
  expect(mon.stats.attack).toBeGreaterThan(statsBefore.attack)
  expect(
    levels.map((step) => step.level),
    'one step per level crossed',
  ).toEqual([6, 7, 8, 9, 10, 11, 12])
})

test('Should pick up the moves learned on the way up rather than skipping them', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const mon = save.party[0]

  mon.moves = mon.moves.slice(0, 1)

  const steps = applyVictory(save, [mon], {
    exp: expForLevel(4, 15) - mon.exp,
    money: 0,
  })
  const learned = steps
    .filter((step) => step.kind === 'learn')
    .map((step) => step.move)

  expect(learned, 'Charmander learns Ember at 7 and Smokescreen at 10').toEqual(
    ['ember', 'smokescreen'],
  )
  expect(mon.moves.map((slot) => slot.move)).toEqual([
    'scratch',
    'ember',
    'smokescreen',
  ])
})

test('Should ask which move to forget on a full moveset instead of silently dropping one', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const mon = save.party[0]

  mon.moves = ['scratch', 'growl', 'tackle', 'leer'].map((name) => ({
    move: name,
    pp: moveOf(name).pp,
    maxPp: moveOf(name).pp,
  }))

  const steps = applyVictory(save, [mon], {
    exp: expForLevel(4, 10) - mon.exp,
    money: 0,
  })
  const choice = steps.find((step) => step.kind === 'learn-choice')

  expect(choice, 'should ask rather than decide').toBeTruthy()
  expect(mon.moves, 'nothing changed until answered').toHaveLength(MOVE_LIMIT)

  const result = learnMove(mon, choice.move, 1)

  expect(result.learned).toBe(true)
  expect(result.forgot).toBe('growl')
  expect(mon.moves.map((slot) => slot.move)).toEqual([
    'scratch',
    choice.move,
    'tackle',
    'leer',
  ])
})

test('Should leave the moveset alone when you decline to learn a move', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const mon = save.party[0]
  const before = mon.moves.map((slot) => slot.move)

  const result = learnMove(mon, 'flamethrower', null)

  expect(result.learned).toBe(false)
  expect(mon.moves.map((slot) => slot.move)).toEqual(before)
})

test('Should evolve at the end of the payout and open the new Pokedex entry', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const mon = save.party[0]

  const steps = applyVictory(save, [mon], {
    exp: expForLevel(4, 16) - mon.exp,
    money: 0,
  })
  const evolve = steps.find((step) => step.kind === 'evolve')
  const unattributed = steps.filter((step) => step.mon !== mon)

  expect(evolve.to, 'Charmander evolves at 16').toBe(5)
  expect(mon.species).toBe(5)
  expect(species(mon.species).name).toBe('Charmeleon')
  expect(steps.at(-1).kind).toBe('evolve')

  expect(
    save.dex.caught,
    'Charmeleon is caught rather than merely seen, and Charmander stays behind it',
  ).toEqual([4, 5])
  expect(save.dex.seen).toEqual([4, 5])
  expect(save.stats.caught, 'an evolution is not a new catch').toBe(1)

  expect(
    unattributed.map((step) => step.kind),
    'every step says which Pokemon it is about',
  ).toEqual([])
})

test('Should teach the evolved form the moves it knows above the evolution', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const abra = createPokemon(63, 10, makeRng(12))

  addPokemon(save, abra)

  const steps = applyVictory(save, [abra], {
    exp: expForLevel(63, 20) - abra.exp,
    money: 0,
  })
  const kinds = steps.map((step) => step.kind)
  const evolveAt = kinds.indexOf('evolve')
  const learnAt = steps.findIndex(
    (step) => step.kind === 'learn' && step.move === 'disable',
  )

  expect(abra.species, 'Kadabra').toBe(64)
  expect(abra.moves.map((slot) => slot.move)).toEqual(['teleport', 'disable'])

  expect(steps[evolveAt - 1].kind).toBe('level')
  expect(steps[evolveAt - 1].level, 'it evolved at 16').toBe(16)
  expect(
    evolveAt,
    'the new move arrives with the evolution, after it',
  ).toBeLessThan(learnAt)
  expect(evolveAt, 'and it kept levelling as a Kadabra').toBeLessThan(
    kinds.lastIndexOf('level'),
  )
})

test('Should perform both evolutions when a payout is big enough to cross two', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const mon = save.party[0]

  const steps = applyVictory(save, [mon], {
    exp: expForLevel(4, 40) - mon.exp,
    money: 0,
  })

  expect(mon.species, 'a Charizard, not a Charmeleon still owed one').toBe(6)
  expect(
    steps.filter((step) => step.kind === 'evolve').map((step) => step.to),
    'and it went through the middle of the family rather than skipping it',
  ).toEqual([5, 6])
  expect(save.dex.caught, 'both are entries').toEqual([4, 5, 6])
})

test('Should repair a save on load that evolved before the dex was told', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })

  save.party[0].species = 5
  saveGame(save)

  const loaded = loadSave()

  expect(loaded.dex.caught).toContain(5)
  expect(loaded.stats.caught, 'a repair is not a new catch').toBe(
    save.stats.caught,
  )
})

test('Should hand the experience to everyone who took part and pay the money once', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const starter = save.party[0]
  const backup = createPokemon(16, 5, makeRng(8))

  addPokemon(save, backup)

  const moneyBefore = save.money
  const expBefore = { starter: starter.exp, backup: backup.exp }

  const steps = applyVictory(save, [starter, backup], { exp: 50, money: 120 })

  expect(starter.exp, 'the one that finished it earns').toBe(
    expBefore.starter + 50,
  )
  expect(backup.exp, 'and so does the one that only stood there').toBe(
    expBefore.backup + 50,
  )
  expect(save.money, "the prize is the trainer's, not a share each").toBe(
    moneyBefore + 120,
  )
  expect(
    steps.filter((step) => step.kind === 'exp').map((step) => step.mon),
    'one line each',
  ).toEqual([starter, backup])
  expect(steps.filter((step) => step.kind === 'money')).toHaveLength(1)
})

test('Should hand nothing to a Pokemon still fainted at the end', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const starter = save.party[0]
  const knockedOut = createPokemon(16, 5, makeRng(9))

  addPokemon(save, knockedOut)
  knockedOut.hp = 0

  const expBefore = knockedOut.exp
  const steps = applyVictory(save, [knockedOut, starter], {
    exp: 50,
    money: 0,
  })

  expect(knockedOut.exp, 'it was carried off before the payout').toBe(expBefore)
  expect(
    steps.filter((step) => step.kind === 'exp').map((step) => step.mon),
    'and is not announced',
  ).toEqual([starter])
})

test('Should just hand experience to a Pokemon that gains no level', () => {
  const save = createSave({ trainer: 'Tester', starterId: 4, rng: makeRng(7) })
  const mon = save.party[0]

  const steps = applyVictory(save, [mon], { exp: 1, money: 1 })

  expect(levelOf(mon)).toBe(5)
  expect(steps.map((step) => step.kind)).toEqual(['money', 'exp'])
})
