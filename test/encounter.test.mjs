import { test } from 'vitest'
import assert from 'node:assert/strict'

import {
  chance,
  makeRng,
  pick,
  randInt,
  randomSeed,
  weightedPick,
} from '../src/rng.mjs'
import {
  rollEncounters,
  speciesTableFromDex,
  stepsFromPrompt,
  stepsWhileWorking,
} from '../src/encounter.mjs'

const CONFIG = {
  encounterChance: 0.12,
  charsPerStep: 40,
  maxSteps: 4,
  workStepSeconds: 20,
}

const always = { ...CONFIG, encounterChance: 1 }
const never = { ...CONFIG, encounterChance: 0 }

function draws(rng, count, fn) {
  const out = []
  for (let i = 0; i < count; i++) out.push(fn(rng))
  return out
}

test('the same seed replays the same numbers, a different one does not', () => {
  const a = draws(makeRng(1234), 20, (rng) => rng())
  const b = draws(makeRng(1234), 20, (rng) => rng())
  const c = draws(makeRng(1235), 20, (rng) => rng())

  assert.deepEqual(a, b, 'a seed is a promise about the whole sequence')
  assert.notDeepEqual(a, c)
})

test('every number the generator gives is a fraction below one', () => {
  for (const value of draws(makeRng(7), 500, (rng) => rng())) {
    assert.ok(value >= 0 && value < 1, `${value} escaped [0, 1)`)
  }
})

test('a fresh seed is a plain unsigned 32-bit number', () => {
  for (let i = 0; i < 50; i++) {
    const seed = randomSeed()
    assert.ok(Number.isInteger(seed), `${seed} is not whole`)
    assert.ok(seed >= 0 && seed <= 0xffffffff, `${seed} is out of range`)
  }
})

test('randInt covers both ends of the range and never leaves it', () => {
  const rolled = new Set(draws(makeRng(3), 500, (rng) => randInt(rng, 1, 6)))

  for (const value of rolled) assert.ok(value >= 1 && value <= 6, `${value}`)
  assert.deepEqual(
    [...rolled].sort(),
    [1, 2, 3, 4, 5, 6],
    'a die needs all six faces',
  )
})

test('a range of one is not a choice at all', () => {
  const rng = makeRng(11)
  for (let i = 0; i < 20; i++) assert.equal(randInt(rng, 4, 4), 4)
})

test('a certainty and an impossibility are both honoured', () => {
  const rng = makeRng(5)
  for (let i = 0; i < 100; i++) {
    assert.equal(chance(rng, 1), true)
    assert.equal(chance(rng, 0), false)
  }
})

test('pick always comes back with something from the bag', () => {
  const items = ['a', 'b', 'c']
  for (const got of draws(makeRng(9), 200, (rng) => pick(rng, items))) {
    assert.ok(items.includes(got), `${got} was not in the bag`)
  }
})

test('weight decides how often, and a weight of zero means never', () => {
  const items = [
    { name: 'common', weight: 90 },
    { name: 'rare', weight: 10 },
    { name: 'impossible', weight: 0 },
  ]
  const counts = { common: 0, rare: 0, impossible: 0 }
  const rng = makeRng(42)
  for (let i = 0; i < 2000; i++) {
    counts[weightedPick(rng, items, (item) => item.weight).name]++
  }

  assert.equal(counts.impossible, 0, 'no weight, no appearances')
  assert.ok(counts.common > counts.rare * 4, JSON.stringify(counts))
  assert.equal(counts.common + counts.rare, 2000)
})

test('when nothing has weight the pick is a plain uniform one', () => {
  const items = [{ w: 0 }, { w: 0 }, { w: 0 }]
  const seen = new Set()
  const rng = makeRng(13)
  for (let i = 0; i < 200; i++)
    seen.add(items.indexOf(weightedPick(rng, items, (i2) => i2.w)))

  assert.equal(seen.size, 3, 'all three should still turn up')
  assert.ok(!seen.has(-1), 'and each one is a real member')
})

test('a roll that lands past the end falls back on the last item', () => {
  const items = [{ w: 1 }, { w: 1 }, { w: 1 }]
  const exhausted = () => 1

  assert.equal(
    weightedPick(exhausted, items, (item) => item.w),
    items[2],
  )
})

test('a weightless item is skipped even by a roll of exactly nothing', () => {
  const items = [
    { name: 'weightless', w: 0 },
    { name: 'real', w: 1 },
  ]
  const lowest = () => 0

  assert.equal(
    weightedPick(lowest, items, (item) => item.w).name,
    'real',
    'landing on its edge is not landing on it',
  )
})

test('a prompt is at least one step and never more than the cap', () => {
  assert.equal(stepsFromPrompt(0, CONFIG), 1, 'even nothing is worth a step')
  assert.equal(stepsFromPrompt(1, CONFIG), 1)
  assert.equal(stepsFromPrompt(40, CONFIG), 1)
  assert.equal(
    stepsFromPrompt(41, CONFIG),
    2,
    'one character over is a step over',
  )
  assert.equal(stepsFromPrompt(160, CONFIG), 4)
  assert.equal(
    stepsFromPrompt(100000, CONFIG),
    CONFIG.maxSteps,
    'the cap holds',
  )
})

test('working walks a step per interval and banks only what it used', () => {
  assert.deepEqual(stepsWhileWorking(0, CONFIG), { steps: 0, taken: 0 })
  assert.deepEqual(stepsWhileWorking(19_999, CONFIG), { steps: 0, taken: 0 })
  assert.deepEqual(stepsWhileWorking(20_000, CONFIG), {
    steps: 1,
    taken: 20_000,
  })
  assert.deepEqual(
    stepsWhileWorking(50_000, CONFIG),
    { steps: 2, taken: 40_000 },
    'the leftover ten seconds stay on the clock',
  )
})

test('once the cap is hit the whole wait is swallowed, not just the part used', () => {
  const { steps, taken } = stepsWhileWorking(200_000, CONFIG)

  assert.equal(steps, CONFIG.maxSteps)
  assert.equal(taken, 200_000, 'no credit is carried over from a long absence')
})

test('a session with no step interval never walks', () => {
  assert.deepEqual(
    stepsWhileWorking(999_999, { ...CONFIG, workStepSeconds: 0 }),
    {
      steps: 0,
      taken: 0,
    },
  )
  assert.deepEqual(stepsWhileWorking(999_999, { maxSteps: 4 }), {
    steps: 0,
    taken: 0,
  })
})

const DEX = [
  { id: 16, name: 'Pidgey', stage: 0, captureRate: 255 },
  { id: 17, name: 'Pidgeotto', stage: 1, captureRate: 120 },
  { id: 18, name: 'Pidgeot', stage: 2, captureRate: 45 },
  { id: 144, name: 'Articuno', stage: 0, captureRate: 3, legendary: true },
]

const namesAt = (leadLevel) =>
  speciesTableFromDex(DEX, leadLevel)
    .map((entry) => entry.name)
    .sort()

test('the grass fills up as your lead grows', () => {
  assert.deepEqual(namesAt(5), ['Pidgey'], 'a rookie meets only first stages')
  assert.deepEqual(
    namesAt(16),
    ['Pidgeotto', 'Pidgey'],
    'sixteen opens the middles',
  )
  assert.deepEqual(namesAt(32), ['Pidgeot', 'Pidgeotto', 'Pidgey'])
  assert.deepEqual(namesAt(40), ['Articuno', 'Pidgeot', 'Pidgeotto', 'Pidgey'])
})

test('each gate opens on its own level and not one sooner', () => {
  for (const [name, gate] of [
    ['Pidgeotto', 16],
    ['Pidgeot', 32],
    ['Articuno', 40],
  ]) {
    assert.ok(
      !namesAt(gate - 1).includes(name),
      `${name} turned up at ${gate - 1}, a level early`,
    )
    assert.ok(
      namesAt(gate).includes(name),
      `${name} was still missing at ${gate}`,
    )
  }
})

test('the easier one is to catch the more often it shows up', () => {
  const table = speciesTableFromDex(DEX, 40)
  const weightOf = (name) => table.find((entry) => entry.name === name).weight

  assert.equal(weightOf('Pidgey'), 32, 'sqrt(255) doubled and rounded')
  assert.equal(weightOf('Pidgeot'), 13)
  assert.equal(weightOf('Articuno'), 3)
  assert.ok(weightOf('Pidgey') > weightOf('Articuno'))
})

test('a species with no catch rate is treated as an ordinary one', () => {
  const [entry] = speciesTableFromDex(
    [{ id: 1, name: 'Nameless', stage: 0 }],
    5,
  )

  assert.equal(
    entry.weight,
    13,
    'the same weight a captureRate of 45 would give',
  )
})

test('a stage with no entry cannot leave the grass empty', () => {
  const table = speciesTableFromDex([{ id: 18, name: 'Pidgeot', stage: 2 }], 5)

  assert.ok(table.length > 0, 'an empty table would mean nothing ever appears')
  assert.ok(
    table.some((entry) => entry.name === 'Rattata'),
    'so it falls back on the built-in list',
  )
})

test('no chance of an encounter means an empty walk', () => {
  const found = rollEncounters({
    steps: 100,
    leadLevel: 10,
    rng: makeRng(1),
    config: never,
    species: DEX.map((mon) => ({ ...mon, weight: 1 })),
  })

  assert.deepEqual(found, [])
})

test('a certain encounter happens once per step, and looks like one', () => {
  const found = rollEncounters({
    steps: 3,
    leadLevel: 10,
    rng: makeRng(2),
    config: always,
    species: [{ id: 25, name: 'Pikachu', weight: 1 }],
  })

  assert.equal(found.length, 3)
  for (const one of found) {
    assert.equal(one.v, 1)
    assert.equal(one.species, 25)
    assert.equal(one.name, 'Pikachu')
    assert.ok(
      Number.isInteger(one.seed) && one.seed >= 0 && one.seed <= 0xffffffff,
    )
  }
})

test('what comes out of the grass is worth fighting at your level', () => {
  const found = rollEncounters({
    steps: 200,
    leadLevel: 20,
    rng: makeRng(4),
    config: always,
    species: [{ id: 25, name: 'Pikachu', weight: 1 }],
  })

  for (const one of found) {
    assert.ok(
      one.level >= 17 && one.level <= 22,
      `level ${one.level} is off the band`,
    )
  }
})

test('a lead level is never asked for below two nor above a hundred', () => {
  const at = (leadLevel) =>
    rollEncounters({
      steps: 200,
      leadLevel,
      rng: makeRng(6),
      config: always,
      species: [{ id: 25, name: 'Pikachu', weight: 1 }],
    }).map((one) => one.level)

  for (const level of at(1)) assert.ok(level >= 2 && level <= 3, `${level}`)
  for (const level of at(100))
    assert.ok(level >= 97 && level <= 100, `${level}`)
})

test('with no lead at all the grass keeps to the starter range', () => {
  const levels = rollEncounters({
    steps: 200,
    leadLevel: 0,
    rng: makeRng(8),
    config: always,
    species: [{ id: 25, name: 'Pikachu', weight: 1 }],
  }).map((one) => one.level)

  for (const level of levels) assert.ok(level >= 2 && level <= 5, `${level}`)
})

test('the same seed walks the same grass', () => {
  const walk = (seed) =>
    rollEncounters({
      steps: 50,
      leadLevel: 12,
      rng: makeRng(seed),
      config: CONFIG,
      species: DEX.map((mon) => ({ ...mon, weight: 10 })),
    })

  assert.deepEqual(walk(99), walk(99), 'a replay is the same walk')
  assert.notDeepEqual(walk(99), walk(100))
})
