import { existsSync, readFileSync } from 'node:fs'
import { Generations } from '@pkmn/data'
import { Dex, toID } from '@pkmn/dex'
import {
  bundledDataFile,
  shinySpriteFile,
  spriteFile,
  trainerSpriteFile,
} from '../src/paths.mjs'
import { TRAINER_CLASSES } from '../src/constants.mjs'
import { bold, brightGreen, brightRed, dim } from '../src/ui/ansi.mjs'
import {
  DAMAGE_CLASSES,
  FAILURE_LIST_LIMIT,
  KANTO,
  NATIONAL_DEX,
  SPRITE_SIDES,
  STAT_KEYS,
} from './constants.mjs'
import { BIOME_IDS, BIOME_NAMES } from './biomeOverrides.mjs'
import { validateSpeciesIdentityManifest } from './speciesIdentity.mjs'

const failures = []
const checks = { run: 0 }

const check = (description, condition, detail = '') => {
  checks.run++

  if (!condition)
    failures.push(`${description}${detail ? ` ${dim(`(${detail})`)}` : ''}`)
}

const read = (name) => {
  try {
    return JSON.parse(readFileSync(bundledDataFile(name), 'utf8'))
  } catch (error) {
    console.error(`\n${brightRed('✘')} cannot read ${name}: ${error.message}`)
    console.error(`  Run ${bold('node tools/fetch-data.mjs --force')} first.\n`)
    process.exit(1)
  }
}

const pokedex = read('pokedex.json')
const moves = read('moves.json')
const types = read('types.json')
const growth = read('growth.json')
const identities = read('form-ids.json')
const audit = read('generation-vii-audit.json')
const biomeData = read('biomes.json')
const byId = new Map(pokedex.map((mon) => [mon.id, mon]))
const generation = new Generations(Dex).get(7)
const sourceAbilities = new Set(
  [...generation.abilities].map((entry) => entry.id),
)
const sourceItems = new Set([...generation.items].map((entry) => entry.id))

try {
  validateSpeciesIdentityManifest(identities)
} catch (error) {
  failures.push(
    `species identity manifest is valid ${dim(`(${error.message})`)}`,
  )
}

check(
  `pokedex holds all ${identities.records.length} pinned species/form records`,
  pokedex.length === identities.records.length,
  `got ${pokedex.length}`,
)
check(
  `pokedex holds ${NATIONAL_DEX} base National Dex species`,
  pokedex.filter((record) => record.formKey === null).length === NATIONAL_DEX,
)

for (let id = 1; id <= NATIONAL_DEX; id++)
  check(`#${id} is present`, byId.has(id))

check(
  'biome dataset contains the nine canonical ecosystems',
  biomeData.biomes?.map((biome) => biome.id).join(',') === BIOME_IDS.join(','),
)

for (const biome of biomeData.biomes ?? []) {
  check(
    `biome ${biome.id} has its canonical name`,
    biome.name === BIOME_NAMES[biome.id],
  )
  const expected = audit.biomes?.expectedPoolSize ?? 0
  const delta =
    expected === 0 ? 0 : Math.abs(biome.ordinary.length - expected) / expected
  check(
    `biome ${biome.id} ordinary pool is within 15% of target`,
    delta <= 0.15,
  )
}

const biomeMemberships = new Map()
for (const biome of biomeData.biomes ?? []) {
  for (const entry of [...(biome.ordinary ?? []), ...(biome.special ?? [])])
    biomeMemberships.set(entry.id, (biomeMemberships.get(entry.id) ?? 0) + 1)

  for (const entry of biome.ordinary ?? []) {
    const record = byId.get(entry.id)
    check(
      `${entry.sourceKey} ordinary biome record is collectible`,
      record?.collectible === true,
    )
    check(
      `${entry.sourceKey} ordinary biome record is not battle-only`,
      record?.battleOnly === false,
    )
    check(
      `${entry.sourceKey} ordinary biome record is not special`,
      !record?.legendary && !record?.mythical,
    )
    check(
      `${entry.sourceKey} ordinary biome record has ordinary rarity weighting`,
      entry.rarity !== 'special',
    )
    check(
      `${entry.sourceKey} ordinary biome membership has evidence`,
      entry.override === true || (entry.evidence?.length ?? 0) > 0,
    )
  }

  for (const entry of biome.special ?? []) {
    const record = byId.get(entry.id)
    check(
      `${entry.sourceKey} special biome record is collectible`,
      record?.collectible === true,
    )
    check(
      `${entry.sourceKey} special biome record is not battle-only`,
      record?.battleOnly === false,
    )
    check(
      `${entry.sourceKey} special biome record is special`,
      Boolean(record?.legendary || record?.mythical),
    )
    check(
      `${entry.sourceKey} special biome record uses special rarity weighting`,
      entry.rarity === 'special',
    )
    check(
      `${entry.sourceKey} special biome membership has evidence`,
      entry.override === true || (entry.evidence?.length ?? 0) > 0,
    )
  }
}

for (const record of pokedex.filter(
  (entry) => entry.collectible && !entry.battleOnly,
)) {
  const count = biomeMemberships.get(record.id) ?? 0
  check(
    `${record.sourceKey} has one to three biome memberships`,
    count >= 1 && count <= 3,
    String(count),
  )
}

const biomeReportText = existsSync(bundledDataFile('biome-report.md'))
  ? readFileSync(bundledDataFile('biome-report.md'), 'utf8')
  : ''
for (const heading of [
  '## Pools',
  '## Membership overlap',
  '## Unassigned records',
  '## Family coherence',
  '### Split edges',
  '## Evidence sources',
  '## Rarity bands',
  '## Manual overrides',
  '## Anomalies',
  '## Validation',
])
  check(`biome report includes ${heading}`, biomeReportText.includes(heading))

check(
  'biome report has no validation errors',
  biomeReportText.includes('Zero validation errors.'),
)
check(
  'biome report has no anomalies',
  biomeReportText.includes('## Anomalies\n\n- none'),
)

for (const identity of identities.records) {
  const record = byId.get(identity.id)

  check(
    `identity ${identity.sourceKey} has a generated record`,
    Boolean(record),
  )

  if (!record) continue

  check(
    `${identity.sourceKey} keeps its pinned source key`,
    record.sourceKey === identity.sourceKey,
    record.sourceKey,
  )
  check(
    `${identity.sourceKey} keeps its National number`,
    record.dexNumber === identity.dexNumber,
    String(record.dexNumber),
  )
  check(
    `${identity.sourceKey} keeps its base species`,
    record.baseSpecies === identity.baseSpecies,
    String(record.baseSpecies),
  )
  check(
    `${identity.sourceKey} keeps its form key`,
    record.formKey === identity.formKey,
    String(record.formKey),
  )
  check(
    `${identity.sourceKey} keeps collectible semantics`,
    record.collectible === identity.collectible,
  )
  check(
    `${identity.sourceKey} keeps battle-only semantics`,
    record.battleOnly === identity.battleOnly,
  )
}

for (const mon of pokedex) {
  const label = `#${mon.id} ${mon.name}`

  check(
    `${label} has a name`,
    typeof mon.name === 'string' && mon.name.length > 0,
  )
  check(
    `${label} has 1-2 types`,
    Array.isArray(mon.types) && mon.types.length >= 1 && mon.types.length <= 2,
  )
  for (const type of mon.types ?? [])
    check(`${label} type "${type}" is in the type chart`, type in types)

  for (const stat of Object.values(STAT_KEYS)) {
    check(
      `${label} has ${stat}`,
      Number.isInteger(mon.stats?.[stat]) && mon.stats[stat] > 0,
    )
  }

  check(
    `${label} has base exp`,
    Number.isInteger(mon.baseExp) && mon.baseExp > 0,
    String(mon.baseExp),
  )
  check(
    `${label} capture rate is 1-255`,
    Number.isInteger(mon.captureRate) &&
      mon.captureRate >= 1 &&
      mon.captureRate <= 255,
    String(mon.captureRate),
  )
  check(
    `${label} growth curve exists`,
    mon.growthRate in growth,
    mon.growthRate,
  )
  check(
    `${label} gender ratio is -1 or 0-8`,
    Number.isInteger(mon.genderRate) &&
      mon.genderRate >= -1 &&
      mon.genderRate <= 8,
    String(mon.genderRate),
  )
  check(
    `${label} has egg groups`,
    Array.isArray(mon.eggGroups) && mon.eggGroups.length > 0,
  )
  check(
    `${label} habitat is nullable text`,
    mon.habitat === null || typeof mon.habitat === 'string',
  )
  check(`${label} baby flag is boolean`, typeof mon.baby === 'boolean')
  check(
    `${label} legendary flag is boolean`,
    typeof mon.legendary === 'boolean',
  )
  check(`${label} mythical flag is boolean`, typeof mon.mythical === 'boolean')
  check(
    `${label} references a real base species`,
    byId.has(mon.baseSpecies),
    String(mon.baseSpecies),
  )
  check(
    `${label} has at least one legal ability slot`,
    Array.isArray(mon.abilities) && mon.abilities.length > 0,
  )

  for (const ability of mon.abilities ?? []) {
    check(
      `${label} ability "${ability.ability}" is in the Gen VII source`,
      sourceAbilities.has(ability.ability),
    )
    check(
      `${label} ability ${ability.ability} has a stable slot`,
      typeof ability.slot === 'string' && ability.slot.length > 0,
    )
    check(
      `${label} ability ${ability.ability} has hidden semantics`,
      typeof ability.hidden === 'boolean',
    )
  }

  check(
    `${label} has a learnset`,
    Array.isArray(mon.learnset) && mon.learnset.length > 0,
  )
  check(
    `${label} knows something at level 1`,
    mon.learnset.some((entry) => entry.level <= 1),
  )
  for (const entry of mon.learnset) {
    check(`${label} move "${entry.move}" exists`, entry.move in moves)
    check(
      `${label} move "${entry.move}" has a level`,
      Number.isInteger(entry.level) && entry.level >= 0 && entry.level <= 100,
    )
  }

  for (const evolution of mon.evolutions) {
    check(
      `${label} evolves into a generated species`,
      byId.has(evolution.to),
      `-> ${evolution.to}`,
    )
    check(
      `${label} has a supported evolution trigger`,
      ['level-up', 'use-item', 'trade'].includes(evolution.trigger),
      evolution.trigger,
    )
    check(
      `${label} evolution conditions are structured`,
      evolution.conditions && typeof evolution.conditions === 'object',
    )
    check(
      `${label} evolution substitute is nullable text`,
      evolution.substitute === null || typeof evolution.substitute === 'string',
    )
    if (evolution.item) {
      check(
        `${label} evolution item "${evolution.item}" is in the Gen VII source`,
        sourceItems.has(toID(evolution.item)),
      )
    }
  }

  check(
    `${label} stage is 0-2`,
    [0, 1, 2].includes(mon.stage),
    String(mon.stage),
  )
  if (mon.evolvesFrom !== null) {
    check(
      `${label} pre-evolution is generated`,
      byId.has(mon.evolvesFrom),
      `<- ${mon.evolvesFrom}`,
    )
    check(
      `${label} stage is one above its pre-evolution`,
      mon.stage === Math.min(2, (byId.get(mon.evolvesFrom)?.stage ?? -99) + 1),
    )
  } else {
    check(`${label} with no pre-evolution is stage 0`, mon.stage === 0)
  }

  if (mon.id <= KANTO) {
    for (const side of SPRITE_SIDES) {
      check(
        `${label} ${side} sprite is on disk`,
        existsSync(spriteFile(side, mon.id, 'png')),
      )
      check(
        `${label} shiny ${side} sprite is on disk`,
        existsSync(shinySpriteFile(side, mon.id, 'png')),
      )
    }
  }
}

for (const entry of TRAINER_CLASSES) {
  check(`${entry.name} has trainer sprites`, entry.sprites.length > 0)

  for (const name of entry.sprites) {
    check(
      `${entry.name} sprite ${name} is on disk`,
      existsSync(trainerSpriteFile(name)),
    )
  }
}

for (const [key, move] of Object.entries(moves)) {
  check(`move ${key} has a type in the chart`, move.type in types)
  check(
    `move ${key} has a damage class`,
    DAMAGE_CLASSES.includes(move.damageClass),
    move.damageClass,
  )
  check(`move ${key} has PP`, Number.isInteger(move.pp) && move.pp > 0)

  if (move.damageClass === 'status') {
    check(
      `status move ${key} has no power`,
      move.power === null,
      String(move.power),
    )
  } else if (move.power !== null) {
    check(
      `damaging move ${key} has positive power`,
      move.power > 0,
      String(move.power),
    )
  }
}

for (const [name, table] of Object.entries(growth)) {
  check(
    `curve ${name} covers 100 levels`,
    table.length === 101,
    `length ${table.length}`,
  )
  check(`curve ${name} starts at 0`, table[1] === 0, String(table[1]))

  let rising = true

  for (let level = 2; level <= 100; level++) {
    if (table[level] <= table[level - 1]) rising = false
  }

  check(`curve ${name} increases every level`, rising)
}

const fact = (description, condition, detail = '') => {
  return check(`FACT: ${description}`, condition, detail)
}

const charizard = byId.get(6)
fact(
  'Charizard is Fire/Flying in Generation VII',
  charizard.types.join('/') === 'fire/flying',
  charizard.types.join('/'),
)
fact('the Generation VII chart includes Fairy', Boolean(types.fairy))

const bulbasaur = byId.get(1)
fact(
  'Bulbasaur evolves at 16',
  bulbasaur.evolutions.some(
    (evolution) => evolution.to === 2 && evolution.level === 16,
  ),
)

const eevee = byId.get(133)
fact(
  'Eevee has all eight Generation VII evolutions',
  eevee.evolutions.length === 8,
  String(eevee.evolutions.length),
)

const espeon = byId.get(196)
const espeonRule = eevee.evolutions.find(
  (evolution) => evolution.to === espeon.id,
)
fact(
  'Espeon preserves friendship and daytime evolution semantics',
  espeonRule?.conditions?.friendship === true &&
    espeonRule?.conditions?.text === 'during the day' &&
    typeof espeonRule?.substitute === 'string',
)

const pikachu = byId.get(25)
fact(
  'Pikachu has a Thunder Stone evolution',
  pikachu.evolutions.some((evolution) => evolution.item === 'thunder-stone'),
)
fact(
  'Pikachu knows Thunder Shock at level 1',
  pikachu.learnset.some(
    (entry) => entry.move === 'thunder-shock' && entry.level <= 1,
  ),
)

const machoke = byId.get(67)
fact(
  'Machoke evolves by trade',
  machoke.evolutions.some((evolution) => evolution.trigger === 'trade'),
)

const mewtwo = byId.get(150)
fact('Mewtwo is legendary', mewtwo.legendary === true)
fact('Mewtwo has no gender', mewtwo.genderRate === -1)
fact('Mew is mythical', byId.get(151).mythical === true)

const togepi = byId.get(175)
fact('Togepi is a Generation II baby', togepi.baby === true)
fact('Togepi is Fairy in Generation VII', togepi.types.includes('fairy'))
fact(
  'Togepi has its hidden ability slot',
  togepi.abilities.some(
    (ability) => ability.hidden && ability.ability === 'superluck',
  ),
)

fact('Meltan #808 is present', byId.get(808)?.sourceKey === 'meltan')
fact('Melmetal #809 is present', byId.get(809)?.sourceKey === 'melmetal')
fact('Meltan is mythical', byId.get(808)?.mythical === true)
fact('Melmetal is mythical', byId.get(809)?.mythical === true)

const alolanForms = pokedex.filter((record) => record.formKey === 'alola')
fact(
  'all 18 Alolan forms are included',
  alolanForms.length === 18,
  String(alolanForms.length),
)

fact(
  'generated audit reports 809 base species',
  audit.baseSpecies === NATIONAL_DEX &&
    audit.nationalDex?.count === NATIONAL_DEX,
)
fact(
  'generated audit count matches the dataset',
  audit.species === pokedex.length &&
    audit.forms === pokedex.length - NATIONAL_DEX,
)
fact(
  'every generated evolution rule has PokéAPI chain evidence',
  audit.pokeApi?.unconfirmedEvolutionRules?.length === 0 &&
    audit.pokeApi?.confirmedEvolutionRules === audit.evolutionRules,
)

fact('Water beats Fire', types.water.double.includes('fire'))
fact('Fire is weak into Water', types.fire.half.includes('water'))
fact('Normal cannot hit Ghost', types.normal.zero.includes('ghost'))
fact('Electric cannot hit Ground', types.electric.zero.includes('ground'))
fact('Tackle is physical', moves.tackle.damageClass === 'physical')
fact('Hyper Beam hits hard', moves['hyper-beam'].power === 150)
fact(
  'medium-slow tops out at 1,059,860 exp',
  growth['medium-slow'][100] === 1059860,
  String(growth['medium-slow'][100]),
)

console.log(bold('\nDataset check\n'))
console.log(
  `  ${pokedex.length} species/forms (${NATIONAL_DEX} National), ` +
    `${Object.keys(moves).length} moves, ${Object.keys(types).length} types, ` +
    `${Object.keys(growth).length} exp curves`,
)
console.log(
  `  ${audit.evolutionRules} evolution rules · ${audit.evolutionSubstitutes} explicit substitutes`,
)
console.log(`  ${checks.run} assertions\n`)

if (failures.length === 0) {
  console.log(`  ${brightGreen('✔')} everything checks out\n`)
} else {
  console.log(`  ${brightRed('✘')} ${failures.length} failed:\n`)

  for (const failure of failures.slice(0, FAILURE_LIST_LIMIT))
    console.log(`    ${failure}`)

  if (failures.length > FAILURE_LIST_LIMIT)
    console.log(
      `    ${dim(`...and ${failures.length - FAILURE_LIST_LIMIT} more`)}`,
    )

  console.log()
  process.exit(1)
}
