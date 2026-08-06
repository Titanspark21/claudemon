import { expect, test } from 'vitest'
import {
  transformRequestWriteGrowth,
  transformRequestWriteMoves,
  transformRequestWritePokedex,
  transformRequestWriteSettings,
  transformRequestWriteTypes,
  transformResponseEvolutionChain,
  transformResponseGrowthRate,
  transformResponseMove,
  transformResponsePokemon,
  transformResponseSettings,
  transformResponseSpecies,
  transformResponseType,
} from './transformers.mjs'

test('Should map a pokemon response keeping PokeAPI field names and dropping the rest', () => {
  const entry = transformResponsePokemon({
    id: 25,
    base_experience: 112,
    height: 4,
    weight: 60,
    is_default: true,
    order: 35,
    sprites: { front_default: 'https://example.test/25.png' },
    abilities: [{ ability: { name: 'static' } }],
    types: [{ slot: 1, type: { name: 'electric', url: 'type/13/' } }],
    stats: [
      { base_stat: 35, effort: 0, stat: { name: 'hp', url: 'stat/1/' } },
      { base_stat: 90, effort: 2, stat: { name: 'speed', url: 'stat/6/' } },
    ],
    moves: [
      {
        move: { name: 'thunder-shock', url: 'move/84/' },
        version_group_details: [
          {
            level_learned_at: 1,
            version_group: { name: 'red-blue' },
            move_learn_method: { name: 'level-up' },
            order: 1,
          },
        ],
      },
    ],
  })

  expect(entry).toEqual({
    id: 25,
    types: [{ slot: 1, type: { name: 'electric' } }],
    stats: [
      { stat: { name: 'hp' }, base_stat: 35 },
      { stat: { name: 'speed' }, base_stat: 90 },
    ],
    base_experience: 112,
    moves: [
      {
        move: { name: 'thunder-shock' },
        version_group_details: [
          {
            level_learned_at: 1,
            version_group: { name: 'red-blue' },
            move_learn_method: { name: 'level-up' },
          },
        ],
      },
    ],
  })
  expect(entry).not.toHaveProperty('baseExp')
  expect(entry).not.toHaveProperty('height')
  expect(entry).not.toHaveProperty('weight')
  expect(entry).not.toHaveProperty('sprites')
  expect(entry).not.toHaveProperty('abilities')
  expect(entry.types[0].type).not.toHaveProperty('url')
  expect(entry.stats[0]).not.toHaveProperty('effort')
})

test('Should map a species response keeping the snake_case names the dataset derives from', () => {
  const entry = transformResponseSpecies({
    name: 'pikachu',
    capture_rate: 190,
    growth_rate: { name: 'medium', url: 'growth-rate/2/' },
    gender_rate: 4,
    is_legendary: false,
    is_mythical: false,
    evolution_chain: { url: 'https://example.test/evolution-chain/10/' },
    color: { name: 'yellow' },
    flavor_text_entries: [{ flavor_text: 'a mouse' }],
    varieties: [],
  })

  expect(entry).toEqual({
    name: 'pikachu',
    capture_rate: 190,
    growth_rate: { name: 'medium' },
    gender_rate: 4,
    is_legendary: false,
    is_mythical: false,
    evolution_chain: { url: 'https://example.test/evolution-chain/10/' },
  })
  expect(entry).not.toHaveProperty('captureRate')
  expect(entry).not.toHaveProperty('legendary')
  expect(entry).not.toHaveProperty('color')
  expect(entry).not.toHaveProperty('flavor_text_entries')
  expect(entry).not.toHaveProperty('varieties')
})

test('Should map an evolution chain down every branch and keep the trigger details', () => {
  const chain = transformResponseEvolutionChain({
    id: 67,
    baby_trigger_item: null,
    chain: {
      is_baby: false,
      species: { name: 'eevee', url: 'https://example.test/species/133/' },
      evolution_details: [],
      evolves_to: [
        {
          is_baby: false,
          species: {
            name: 'vaporeon',
            url: 'https://example.test/species/134/',
          },
          evolution_details: [
            {
              trigger: { name: 'use-item', url: 'trigger/3/' },
              min_level: null,
              item: { name: 'water-stone', url: 'item/84/' },
              gender: null,
              held_item: null,
            },
          ],
          evolves_to: [],
        },
      ],
    },
  })

  expect(chain).toEqual({
    chain: {
      species: { url: 'https://example.test/species/133/' },
      evolution_details: [],
      evolves_to: [
        {
          species: { url: 'https://example.test/species/134/' },
          evolution_details: [
            {
              trigger: { name: 'use-item' },
              min_level: null,
              item: { name: 'water-stone' },
            },
          ],
          evolves_to: [],
        },
      ],
    },
  })
  expect(chain).not.toHaveProperty('id')
  expect(chain).not.toHaveProperty('baby_trigger_item')
  expect(chain.chain).not.toHaveProperty('is_baby')
  expect(chain.chain.species).not.toHaveProperty('name')
  expect(chain.chain.evolves_to[0].evolution_details[0]).not.toHaveProperty(
    'held_item',
  )
})

test('Should map a move response including its meta and drop the fields the dataset ignores', () => {
  const move = transformResponseMove({
    id: 84,
    name: 'thunder-shock',
    names: [
      { name: 'Thunder Shock', language: { name: 'en', url: 'language/9/' } },
      { name: 'Éclair', language: { name: 'fr' } },
    ],
    type: { name: 'electric' },
    power: 40,
    accuracy: 100,
    pp: 30,
    priority: 0,
    damage_class: { name: 'special' },
    meta: {
      ailment: { name: 'paralysis' },
      ailment_chance: 10,
      stat_chance: 0,
      min_hits: null,
      max_hits: null,
      drain: 0,
      healing: 0,
      flinch_chance: 0,
      crit_rate: 0,
      category: { name: 'damage+ailment' },
    },
    stat_changes: [{ stat: { name: 'special-attack' }, change: -1 }],
    target: { name: 'selected-pokemon' },
    effect_entries: [{ effect: 'may paralyze' }],
    generation: { name: 'generation-i' },
    machines: [],
  })

  expect(move).toEqual({
    name: 'thunder-shock',
    names: [
      { name: 'Thunder Shock', language: { name: 'en' } },
      { name: 'Éclair', language: { name: 'fr' } },
    ],
    type: { name: 'electric' },
    power: 40,
    accuracy: 100,
    pp: 30,
    priority: 0,
    damage_class: { name: 'special' },
    meta: {
      ailment: { name: 'paralysis' },
      ailment_chance: 10,
      stat_chance: 0,
      min_hits: null,
      max_hits: null,
      drain: 0,
      healing: 0,
      flinch_chance: 0,
      crit_rate: 0,
    },
    stat_changes: [{ stat: { name: 'special-attack' }, change: -1 }],
    target: { name: 'selected-pokemon' },
  })
  expect(move).not.toHaveProperty('damageClass')
  expect(move).not.toHaveProperty('effect_entries')
  expect(move).not.toHaveProperty('generation')
  expect(move).not.toHaveProperty('machines')
  expect(move.meta).not.toHaveProperty('category')
})

test('Should map a move with no meta block to a null meta', () => {
  const move = transformResponseMove({
    name: 'splash',
    names: [],
    type: { name: 'normal' },
    power: null,
    accuracy: null,
    pp: 40,
    priority: 0,
    damage_class: { name: 'status' },
    meta: null,
    stat_changes: [],
    target: { name: 'user' },
  })

  expect(move.meta).toBeNull()
  expect(move.power).toBeNull()
})

test('Should map a type response to its offensive damage relations only', () => {
  const type = transformResponseType({
    id: 11,
    name: 'water',
    damage_relations: {
      double_damage_to: [
        { name: 'ground' },
        { name: 'rock' },
        { name: 'fire' },
      ],
      half_damage_to: [{ name: 'water' }, { name: 'grass' }],
      no_damage_to: [],
      double_damage_from: [{ name: 'grass' }],
      half_damage_from: [{ name: 'steel' }],
      no_damage_from: [],
    },
    moves: [{ name: 'surf' }],
  })

  expect(type).toEqual({
    name: 'water',
    damage_relations: {
      double_damage_to: [
        { name: 'ground' },
        { name: 'rock' },
        { name: 'fire' },
      ],
      half_damage_to: [{ name: 'water' }, { name: 'grass' }],
      no_damage_to: [],
    },
  })
  expect(type).not.toHaveProperty('id')
  expect(type).not.toHaveProperty('moves')
  expect(type.damage_relations).not.toHaveProperty('double_damage_from')
  expect(type.damage_relations).not.toHaveProperty('half_damage_from')
  expect(type.damage_relations).not.toHaveProperty('no_damage_from')
})

test('Should map a growth rate response to its name and level table', () => {
  const curve = transformResponseGrowthRate({
    id: 2,
    name: 'medium',
    formula: 'n^3',
    descriptions: [{ description: 'medium' }],
    levels: [
      { level: 1, experience: 0 },
      { level: 2, experience: 8 },
    ],
    pokemon_species: [{ name: 'pikachu' }],
  })

  expect(curve).toEqual({
    name: 'medium',
    levels: [
      { level: 1, experience: 0 },
      { level: 2, experience: 8 },
    ],
  })
  expect(curve).not.toHaveProperty('formula')
  expect(curve).not.toHaveProperty('descriptions')
  expect(curve).not.toHaveProperty('pokemon_species')
})

test('Should map nothing when a PokeAPI response is missing', () => {
  expect(transformResponsePokemon(null)).toBeNull()
  expect(transformResponseSpecies(null)).toBeNull()
  expect(transformResponseEvolutionChain(null)).toBeNull()
  expect(transformResponseMove(null)).toBeNull()
  expect(transformResponseType(null)).toBeNull()
  expect(transformResponseGrowthRate(null)).toBeNull()
})

test('Should write pokedex entries with the camelCase names and key order data/pokedex.json holds', () => {
  const [entry] = transformRequestWritePokedex([
    {
      id: 1,
      name: 'Bulbasaur',
      types: ['grass', 'poison'],
      stats: {
        hp: 45,
        attack: 49,
        defense: 49,
        spAttack: 65,
        spDefense: 65,
        speed: 45,
      },
      base_experience: 64,
      capture_rate: 45,
      growth_rate: 'medium-slow',
      gender_rate: 1,
      stage: 0,
      evolvesFrom: null,
      evolutions: [
        { to: 2, trigger: 'level-up', level: 16, item: null, extra: 'ignored' },
      ],
      legendary: false,
      learnset: [{ level: 1, move: 'tackle', method: 'level-up' }],
    },
  ])

  expect(Object.keys(entry)).toEqual([
    'id',
    'name',
    'types',
    'stats',
    'baseExp',
    'captureRate',
    'growthRate',
    'genderRate',
    'stage',
    'evolvesFrom',
    'evolutions',
    'legendary',
    'learnset',
  ])
  expect(Object.keys(entry.stats)).toEqual([
    'hp',
    'attack',
    'defense',
    'spAttack',
    'spDefense',
    'speed',
  ])
  expect(entry.baseExp).toBe(64)
  expect(entry.captureRate).toBe(45)
  expect(entry.growthRate).toBe('medium-slow')
  expect(entry.genderRate).toBe(1)
  expect(entry.legendary).toBe(false)
  expect(entry.evolutions).toEqual([
    { to: 2, trigger: 'level-up', level: 16, item: null },
  ])
  expect(entry.learnset).toEqual([{ level: 1, move: 'tackle' }])
  expect(entry).not.toHaveProperty('base_experience')
  expect(entry).not.toHaveProperty('capture_rate')
  expect(entry).not.toHaveProperty('growth_rate')
  expect(entry).not.toHaveProperty('gender_rate')
})

test('Should write moves keyed by name with the camelCase names and key order data/moves.json holds', () => {
  const moves = transformRequestWriteMoves({
    absorb: {
      name: 'Absorb',
      type: 'grass',
      power: 20,
      accuracy: 100,
      pp: 25,
      priority: 0,
      damage_class: 'special',
      ailment: null,
      ailment_chance: null,
      stat_chance: null,
      stat_changes: [{ stat: 'spAttack', change: -1, extra: 'ignored' }],
      target: 'selected-pokemon',
      min_hits: null,
      max_hits: null,
      drain: 50,
      healing: null,
      flinch_chance: null,
      crit_rate: 0,
    },
  })

  expect(Object.keys(moves)).toEqual(['absorb'])
  expect(Object.keys(moves.absorb)).toEqual([
    'name',
    'type',
    'power',
    'accuracy',
    'pp',
    'priority',
    'damageClass',
    'ailment',
    'ailmentChance',
    'statChance',
    'statChanges',
    'target',
    'minHits',
    'maxHits',
    'drain',
    'healing',
    'flinchChance',
    'critRate',
  ])
  expect(moves.absorb.damageClass).toBe('special')
  expect(moves.absorb.critRate).toBe(0)
  expect(moves.absorb.statChanges).toEqual([{ stat: 'spAttack', change: -1 }])
  expect(moves.absorb).not.toHaveProperty('damage_class')
  expect(moves.absorb).not.toHaveProperty('crit_rate')
  expect(moves.absorb).not.toHaveProperty('meta')
})

test('Should write the type chart as the double, half and zero lists the engine reads', () => {
  const types = transformRequestWriteTypes({
    water: {
      double_damage_to: ['ground', 'rock', 'fire'],
      half_damage_to: ['water', 'grass', 'dragon'],
      no_damage_to: [],
    },
  })

  expect(types).toEqual({
    water: {
      double: ['ground', 'rock', 'fire'],
      half: ['water', 'grass', 'dragon'],
      zero: [],
    },
  })
  expect(Object.keys(types.water)).toEqual(['double', 'half', 'zero'])
})

test('Should write the growth curves as a table per curve name', () => {
  const growth = transformRequestWriteGrowth({
    'medium-slow': [0, 0, 9, 57],
    fast: [0, 0, 6, 21],
  })

  expect(growth).toEqual({
    'medium-slow': [0, 0, 9, 57],
    fast: [0, 0, 6, 21],
  })
  expect(Object.keys(growth)).toEqual(['medium-slow', 'fast'])
})

test('Should map only the status line out of the Claude Code settings document', () => {
  const settings = transformResponseSettings({
    statusLine: {
      type: 'command',
      command: '~/.claudemon/statusline.sh',
      padding: 0,
    },
    model: 'opus',
    permissions: { allow: ['Bash'] },
  })

  expect(settings).toEqual({
    statusLine: { type: 'command', command: '~/.claudemon/statusline.sh' },
  })
  expect(settings).not.toHaveProperty('model')
  expect(settings).not.toHaveProperty('permissions')
  expect(settings.statusLine).not.toHaveProperty('padding')
})

test('Should map a settings document with no status line to a null status line', () => {
  expect(transformResponseSettings({ model: 'opus' })).toEqual({
    statusLine: null,
  })
  expect(transformResponseSettings(null)).toBeNull()
})

test('Should write the status line as the type and command pair only', () => {
  expect(
    transformRequestWriteSettings({
      statusLine: {
        type: 'command',
        command: '/bin/my-line',
        padding: 1,
      },
    }),
  ).toEqual({
    statusLine: { type: 'command', command: '/bin/my-line' },
  })
})
