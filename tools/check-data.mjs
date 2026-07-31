// Validates the generated dataset.
//
// Two kinds of check. Structural ones catch a broken or half-written build:
// missing fields, dangling references, absent sprites. Then a handful of facts
// anyone who played Red or Blue knows by heart, which is what catches a build
// that is well-formed but quietly wrong — a moveset from the wrong version group,
// say, or an evolution chain read in the wrong direction.
//
//   node tools/check-data.mjs

import { existsSync, readFileSync } from 'node:fs'
import { dataFile, spriteFile } from '../src/paths.mjs'
import { bold, brightGreen, brightRed, dim } from '../src/ui/ansi.mjs'

const failures = []
const checks = { run: 0 }

function check(description, condition, detail = '') {
  checks.run++
  if (!condition) failures.push(`${description}${detail ? ` ${dim(`(${detail})`)}` : ''}`)
}

function load(name) {
  try {
    return JSON.parse(readFileSync(dataFile(name), 'utf8'))
  } catch (error) {
    console.error(`\n${brightRed('✘')} cannot read ${name}: ${error.message}`)
    console.error(`  Run ${bold('node tools/fetch-data.mjs')} first.\n`)
    process.exit(1)
  }
}

const pokedex = load('pokedex.json')
const moves = load('moves.json')
const types = load('types.json')
const growth = load('growth.json')

const byId = new Map(pokedex.map((mon) => [mon.id, mon]))

// --- Structure ---------------------------------------------------------------

check('pokedex holds 151 entries', pokedex.length === 151, `got ${pokedex.length}`)

for (let id = 1; id <= 151; id++) {
  check(`#${id} is present`, byId.has(id))
}

for (const mon of pokedex) {
  const label = `#${mon.id} ${mon.name}`

  check(`${label} has a name`, typeof mon.name === 'string' && mon.name.length > 0)
  check(`${label} has 1-2 types`, mon.types.length >= 1 && mon.types.length <= 2)
  for (const type of mon.types) {
    check(`${label} type "${type}" is in the type chart`, type in types)
  }

  for (const stat of ['hp', 'attack', 'defense', 'spAttack', 'spDefense', 'speed']) {
    check(`${label} has ${stat}`, Number.isInteger(mon.stats[stat]) && mon.stats[stat] > 0)
  }

  check(`${label} has base exp`, Number.isInteger(mon.baseExp) && mon.baseExp > 0)
  check(
    `${label} capture rate is 1-255`,
    mon.captureRate >= 1 && mon.captureRate <= 255,
    String(mon.captureRate),
  )
  check(`${label} growth curve exists`, mon.growthRate in growth, mon.growthRate)

  // Every Pokemon knows at least one move at level 1, or it could not battle.
  check(`${label} has a learnset`, mon.learnset.length > 0)
  check(
    `${label} knows something at level 1`,
    mon.learnset.some((entry) => entry.level <= 1),
  )
  for (const entry of mon.learnset) {
    check(`${label} move "${entry.move}" exists`, entry.move in moves)
  }

  for (const evolution of mon.evolutions) {
    check(
      `${label} evolves into a real Pokemon`,
      byId.has(evolution.to),
      `-> ${evolution.to}`,
    )
    // Kanto has nothing above #151, so a chain pointing past it means we picked up
    // a later generation's evolution (Golbath -> Crobat and friends).
    check(`${label} evolution stays in Kanto`, evolution.to <= 151, `-> ${evolution.to}`)
  }

  check(`${label} stage is 0-2`, [0, 1, 2].includes(mon.stage), String(mon.stage))
  if (mon.evolvesFrom !== null) {
    // A pre-evolution outside Kanto means the generation filter let something
    // through: Pichu, Cleffa, Igglybuff and Happiny all precede Kanto Pokemon.
    check(`${label} pre-evolution is in Kanto`, byId.has(mon.evolvesFrom), `<- ${mon.evolvesFrom}`)
    check(
      `${label} stage is one above its pre-evolution`,
      mon.stage === (byId.get(mon.evolvesFrom)?.stage ?? -99) + 1,
    )
  } else {
    check(`${label} with no pre-evolution is stage 0`, mon.stage === 0)
  }

  for (const side of ['front', 'back']) {
    check(`${label} ${side} sprite is on disk`, existsSync(spriteFile(side, mon.id, 'png')))
  }
}

// --- Moves -------------------------------------------------------------------

/**
 * Moves that deal damage by a rule of their own instead of a power value: fixed
 * amounts, the user's level, a fraction of the target's HP, or a one-hit knockout.
 * The battle engine has to special-case each of these.
 */
const SPECIAL_DAMAGE = new Set([
  'counter', 'dragon-rage', 'fissure', 'guillotine', 'horn-drill', 'low-kick',
  'night-shade', 'psywave', 'seismic-toss', 'sonic-boom', 'super-fang',
])

for (const [key, move] of Object.entries(moves)) {
  check(`move ${key} has a type in the chart`, move.type in types)
  check(
    `move ${key} has a damage class`,
    ['physical', 'special', 'status'].includes(move.damageClass),
    move.damageClass,
  )
  check(`move ${key} has PP`, Number.isInteger(move.pp) && move.pp > 0)

  if (move.damageClass === 'status') {
    check(`status move ${key} has no power`, move.power === null, String(move.power))
  } else if (move.power === null) {
    // Catch a genuinely new power-less move rather than waving all of them through.
    check(
      `damaging move ${key} without power is a known special case`,
      SPECIAL_DAMAGE.has(key),
      'needs handling in the battle engine',
    )
  } else {
    check(`damaging move ${key} has power`, move.power > 0, String(move.power))
  }
}

// --- Experience curves -------------------------------------------------------

for (const [name, table] of Object.entries(growth)) {
  check(`curve ${name} covers 100 levels`, table.length === 101, `length ${table.length}`)
  check(`curve ${name} starts at 0`, table[1] === 0, String(table[1]))
  let rising = true
  for (let level = 2; level <= 100; level++) {
    if (table[level] <= table[level - 1]) rising = false
  }
  check(`curve ${name} increases every level`, rising)
}

// --- Facts anyone who played the game would notice ---------------------------

const fact = (description, condition, detail) => check(`FACT: ${description}`, condition, detail)

const charizard = byId.get(6)
fact('Charizard is Fire/Flying', charizard.types.join('/') === 'fire/flying', charizard.types.join('/'))
fact('Charizard is a second evolution', charizard.stage === 2, String(charizard.stage))
fact('Charizard comes from Charmeleon', charizard.evolvesFrom === 5, String(charizard.evolvesFrom))

const bulbasaur = byId.get(1)
fact(
  'Bulbasaur evolves at 16',
  bulbasaur.evolutions[0]?.to === 2 && bulbasaur.evolutions[0]?.level === 16,
  JSON.stringify(bulbasaur.evolutions[0]),
)

const eevee = byId.get(133)
fact('Eevee has three evolutions', eevee.evolutions.length === 3, String(eevee.evolutions.length))
fact(
  'Eevee evolves by stone',
  eevee.evolutions.every((evolution) => evolution.item?.endsWith('-stone')),
  eevee.evolutions.map((e) => e.item).join(', '),
)

const pikachu = byId.get(25)
fact(
  'Pikachu needs a Thunder Stone',
  pikachu.evolutions[0]?.item === 'thunder-stone',
  String(pikachu.evolutions[0]?.item),
)
fact('Pikachu knows Thunder Shock at level 1',
  pikachu.learnset.some((entry) => entry.move === 'thunder-shock' && entry.level <= 1))

const machoke = byId.get(67)
fact('Machoke evolves by trade', machoke.evolutions[0]?.trigger === 'trade', machoke.evolutions[0]?.trigger)

const mewtwo = byId.get(150)
fact('Mewtwo is legendary', mewtwo.legendary === true)
fact('Mewtwo is hard to catch', mewtwo.captureRate === 3, String(mewtwo.captureRate))

const caterpie = byId.get(10)
fact('Caterpie is easy to catch', caterpie.captureRate === 255, String(caterpie.captureRate))

const charmander = byId.get(4)
fact(
  'Charmander learns Ember',
  charmander.learnset.some((entry) => entry.move === 'ember'),
)
fact(
  'Charmander starts with Scratch',
  charmander.learnset.some((entry) => entry.move === 'scratch' && entry.level <= 1),
)

fact('Water beats Fire', types.water.double.includes('fire'))
fact('Fire is weak into Water', types.fire.half.includes('water'))
fact('Normal cannot hit Ghost', types.normal.zero.includes('ghost'))
fact('Electric cannot hit Ground', types.electric.zero.includes('ground'))

fact('Tackle is physical', moves.tackle.damageClass === 'physical')
fact('Growl lowers Attack',
  moves.growl.statChanges.some((change) => change.stat === 'attack' && change.change === -1))
fact('Thunder Wave paralyses', moves['thunder-wave'].ailment === 'paralysis', moves['thunder-wave'].ailment)
fact('Ember can burn', moves.ember.ailment === 'burn', moves.ember.ailment)
fact('Hyper Beam hits hard', moves['hyper-beam'].power === 150, String(moves['hyper-beam'].power))

// Medium-slow at level 100 is 1,059,860 experience in every game since Red.
fact(
  'medium-slow tops out at 1,059,860 exp',
  growth['medium-slow'][100] === 1059860,
  String(growth['medium-slow'][100]),
)

// --- Report ------------------------------------------------------------------

console.log(bold('\nDataset check\n'))
console.log(`  ${pokedex.length} Pokemon, ${Object.keys(moves).length} moves, ` +
  `${Object.keys(types).length} types, ${Object.keys(growth).length} exp curves`)
console.log(`  ${checks.run} assertions\n`)

if (failures.length === 0) {
  console.log(`  ${brightGreen('✔')} everything checks out\n`)
} else {
  console.log(`  ${brightRed('✘')} ${failures.length} failed:\n`)
  for (const failure of failures.slice(0, 40)) console.log(`    ${failure}`)
  if (failures.length > 40) console.log(`    ${dim(`...and ${failures.length - 40} more`)}`)
  console.log()
  process.exit(1)
}
