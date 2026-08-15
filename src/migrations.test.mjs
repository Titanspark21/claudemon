import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  CONFIG_VERSION,
  MIGRATION_BACKUP_SUFFIX,
  SAVE_VERSION,
  TRADE_VERSION,
} from './constants.mjs'
import {
  migrateConfig,
  migrateConfigFile,
  migratePokemon,
  migrateSave,
  migrateSaveFile,
  migrateTrade,
  stablePokemonRoll,
} from './migrations.mjs'
import { createPokemon } from './pokemon.mjs'
import { makeRng } from './rng.mjs'

const legacyMon = (species = 4, seed = 7) => {
  const mon = createPokemon(species, 5, makeRng(seed))

  delete mon.nature
  delete mon.ability
  delete mon.heldItem

  return mon
}

const legacySave = () => ({
  version: 1,
  trainer: { name: 'RED', startedAt: '2026-01-01T00:00:00.000Z' },
  party: [legacyMon()],
  box: [],
  daycare: { slots: [], egg: null },
  bag: { 'poke-ball': 2 },
  money: 1234,
  badges: ['pewter'],
  dex: {
    seen: [4, 19, 10001, 20001],
    caught: [4, 10001, 20001],
    shiny: [10001, 20001],
    faced: { 19: 3, 10001: 2, 20001: 9 },
  },
  stats: {
    battles: 2,
    wins: 1,
    losses: 1,
    caught: 2,
    runs: 0,
    streak: 4,
    lastPlayedAt: '2026-08-01T00:00:00.000Z',
  },
  achievements: [
    { id: 'first-badge', earnedAt: '2026-02-03T04:05:06.000Z' },
    { id: 'dex-151', earnedAt: '2026-07-08T09:10:11.000Z' },
  ],
  trades: { received: ['old-trade'] },
})

test('Should migrate an upstream save without changing any existing Pokemon field', () => {
  const raw = legacySave()
  const before = structuredClone(raw.party[0])
  const migrated = migrateSave(raw, { workedMs: 123_000 })
  const mon = migrated.party[0]

  expect(migrated.version).toBe(SAVE_VERSION)
  for (const [key, value] of Object.entries(before))
    expect(mon[key]).toEqual(value)
  expect(typeof mon.nature).toBe('string')
  expect(typeof mon.ability).toBe('string')
  expect(mon.heldItem).toBeNull()
  expect(migrated.expedition.biome).toBe('meadow')
  expect(migrated.expedition.workedMs).toBe(123_000)
  expect(migrated.achievements).toEqual(raw.achievements)
})

test('Should deterministically fill a partially populated Pokemon and never reroll it', () => {
  const mon = legacyMon(25, 11)
  const first = migratePokemon(mon, 'save-a')
  const second = migratePokemon(mon, 'save-a')
  const again = migratePokemon(first, 'save-a')

  expect(first).toEqual(second)
  expect(again).toEqual(first)
  expect(stablePokemonRoll(mon, 'nature')).toBe(
    stablePokemonRoll(structuredClone(mon), 'nature'),
  )
  expect(stablePokemonRoll(mon, 'nature')).not.toBe(
    stablePokemonRoll(mon, 'ability'),
  )
})

test('Should partition National and collectible form state and discard battle-only IDs', () => {
  const migrated = migrateSave(legacySave(), { workedMs: 50_000 })

  expect(migrated.dex).toEqual({
    seen: [4, 19],
    caught: [4, 19],
    shiny: [19],
    faced: { 19: 5 },
    forms: {
      seen: [10001],
      caught: [10001],
      shiny: [10001],
      faced: { 10001: 2 },
    },
  })
  expect(JSON.stringify(migrated.dex)).not.toContain('20001')
})

test('Should produce byte-equivalent normalized data when migration is repeated', () => {
  const once = migrateSave(legacySave(), { workedMs: 456_000 })
  const twice = migrateSave(once, { workedMs: 456_000 })

  expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
})

test('Should reject battle-only Pokemon instead of persisting a temporary form', () => {
  const raw = legacySave()
  raw.party = [legacyMon(20001, 9)]

  expect(() => migrateSave(raw)).toThrow(
    /battle-only species cannot be persisted/,
  )
})

test('Should reject future saves before touching the file or creating a backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claudemon-migration-'))
  const path = join(dir, 'save.json')
  const source = `${JSON.stringify({ version: SAVE_VERSION + 1, sentinel: true }, null, 2)}\n`

  try {
    writeFileSync(path, source)

    expect(() => migrateSaveFile(path)).toThrow(/newer claudemon/)
    expect(readFileSync(path, 'utf8')).toBe(source)
    expect(existsSync(`${path}${MIGRATION_BACKUP_SUFFIX}`)).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Should keep an exact one-time backup and atomically replace an old save', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claudemon-migration-'))
  const path = join(dir, 'save.json')
  const backup = `${path}${MIGRATION_BACKUP_SUFFIX}`
  const source = `${JSON.stringify(legacySave(), null, 2)}\n`

  try {
    writeFileSync(path, source)
    const migrated = migrateSaveFile(path, { workedMs: 321_000 })

    expect(migrated.version).toBe(SAVE_VERSION)
    expect(readFileSync(backup, 'utf8')).toBe(source)
    expect(JSON.parse(readFileSync(path, 'utf8')).version).toBe(SAVE_VERSION)

    writeFileSync(backup, 'keep this recovery copy')
    writeFileSync(path, source)
    migrateSaveFile(path, { workedMs: 321_000 })
    expect(readFileSync(backup, 'utf8')).toBe('keep this recovery copy')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Should migrate unversioned config and reject future config versions', () => {
  expect(migrateConfig({ sound: false, spriteScale: 0.7 })).toMatchObject({
    version: CONFIG_VERSION,
    sound: false,
    spriteScale: 0.7,
  })
  expect(() => migrateConfig({ version: CONFIG_VERSION + 1 })).toThrow(
    /newer claudemon/,
  )
})

test('Should migrate old trades deterministically and reject future trade versions', () => {
  const raw = {
    v: 1,
    id: 'old-code',
    mon: legacyMon(25, 19),
    from: { name: 'BLUE', at: '2026-03-04T05:06:07.000Z' },
  }
  const first = migrateTrade(raw)
  const second = migrateTrade(raw)

  expect(first).toEqual(second)
  expect(first.v).toBe(TRADE_VERSION)
  expect(typeof first.mon.nature).toBe('string')
  expect(typeof first.mon.ability).toBe('string')
  expect(first.mon.heldItem).toBeNull()
  expect(() => migrateTrade({ ...raw, v: TRADE_VERSION + 1 })).toThrow(
    /newer claudemon/,
  )
})

test('Should reject malformed versions and invalid Pokemon explicitly', () => {
  expect(migrateSave(null)).toBeNull()
  expect(migrateConfig(null)).toBeNull()
  expect(migrateTrade(null)).toBeNull()
  expect(() => migrateSave({ version: 0 })).toThrow(/Unsupported save version/)
  expect(() => migrateConfig({ version: -1 })).toThrow(
    /Unsupported config version/,
  )
  expect(() => migrateTrade({})).toThrow(/Unsupported trade version/)
  expect(() => migrateTrade({ v: 0 })).toThrow(/Unsupported trade version/)
  expect(() => migratePokemon(null)).toThrow(/invalid Pokemon/)

  expect(stablePokemonRoll(null, null)).toEqual(expect.any(Number))
  const sparse = migratePokemon({ species: 4 })
  expect(sparse).toMatchObject({ species: 4, heldItem: null })
  expect(sparse.moves).toBeUndefined()
})

test('Should migrate nested legacy form state plus box and daycare Pokemon', () => {
  const raw = legacySave()

  raw.box = [legacyMon(16, 31)]
  raw.daycare.slots = [legacyMon(19, 32)]
  delete raw.trades
  raw.dex = {
    forms: {
      seen: [10001],
      caught: [10001],
      shiny: [10001],
      faced: { 10001: 2 },
    },
  }

  const migrated = migrateSave(raw, { workedMs: 2 })

  expect(migrated.box[0].nature).toEqual(expect.any(String))
  expect(migrated.daycare.slots[0].ability).toEqual(expect.any(String))
  expect(migrated.trades).toEqual({ received: [] })
  expect(migrated.dex).toEqual({
    seen: [19],
    caught: [19],
    shiny: [19],
    faced: { 19: 2 },
    forms: {
      seen: [10001],
      caught: [10001],
      shiny: [10001],
      faced: { 10001: 2 },
    },
  })
})

test('Should normalize malformed current Dex collections without inventing entries', () => {
  const current = migrateSave(legacySave(), { workedMs: 1 })

  current.dex.seen.push(10001, 20001, 99999)
  current.dex.caught.push(10001, 20001)
  current.dex.faced[10001] = 3
  current.dex.faced[99999] = 4
  current.dex.forms.seen.push(4, 20001, 99999)
  current.dex.forms.caught.push(20001)
  current.dex.forms.faced[4] = 2
  current.dex.forms.faced[10001] = -1
  current.dex.forms.faced[99999] = 2

  const normalized = migrateSave(current, { workedMs: 1 })

  expect(normalized.dex.seen).toEqual([4, 19])
  expect(normalized.dex.caught).toEqual([4, 19])
  expect(normalized.dex.forms.seen).toEqual([10001])
  expect(normalized.dex.forms.caught).toEqual([10001])
  expect(normalized.dex.faced).toEqual({ 19: 5 })
  expect(normalized.dex.forms.faced).toEqual({})
})

test('Should build missing derived stats without overwriting existing modern fields', () => {
  const mon = legacyMon(25, 23)

  mon.nature = 'adamant'
  mon.ability = 'static'
  mon.heldItem = 'light-ball'
  delete mon.stats

  const migrated = migratePokemon(mon, 'known-modern-fields')

  expect(migrated.nature).toBe('adamant')
  expect(migrated.ability).toBe('static')
  expect(migrated.heldItem).toBe('light-ball')
  expect(migrated.stats.hp).toBeGreaterThan(0)
})

test('Should migrate config files once and preserve their original recovery copy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claudemon-config-migration-'))
  const path = join(dir, 'config.json')
  const missing = join(dir, 'missing.json')
  const backup = `${path}${MIGRATION_BACKUP_SUFFIX}`
  const source = '{\n  "sound": false,\n  "spriteScale": 0.8\n}\n'

  try {
    expect(migrateConfigFile(missing)).toBeNull()
    writeFileSync(path, source)

    const migrated = migrateConfigFile(path)

    expect(migrated).toMatchObject({
      version: CONFIG_VERSION,
      sound: false,
      spriteScale: 0.8,
    })
    expect(readFileSync(backup, 'utf8')).toBe(source)
    expect(JSON.parse(readFileSync(path, 'utf8')).version).toBe(CONFIG_VERSION)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
