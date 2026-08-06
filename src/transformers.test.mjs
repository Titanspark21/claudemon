import { expect, test } from 'vitest'
import {
  transformRequestSaveGame,
  transformRequestWriteActivity,
  transformRequestWriteConfig,
  transformRequestWriteEncounter,
  transformRequestWriteStatus,
  transformRequestWriteUpdateState,
  transformResponseActivity,
  transformResponseConfig,
  transformResponseEncounter,
  transformResponseManifest,
  transformResponseSave,
  transformResponseStatus,
  transformResponseUpdateState,
} from './transformers.mjs'

const rawSave = {
  version: 1,
  trainer: { name: 'ASH', startedAt: '2026-01-01T00:00:00.000Z' },
  party: [
    {
      species: 4,
      nickname: 'Sparky',
      exp: 135,
      ivs: { hp: 20, attack: 3 },
      stats: { hp: 21, attack: 11 },
      hp: 18,
      moves: [{ move: 'ember', pp: 24, maxPp: 25, learnedAt: 9 }],
      status: 'burn',
      statusTurns: 2,
      level: 7,
    },
  ],
  box: [
    {
      species: 19,
      nickname: null,
      exp: 100,
      ivs: { hp: 1 },
      stats: { hp: 15 },
      hp: 15,
      moves: [],
      status: null,
      statusTurns: 0,
    },
  ],
  bag: { 'poke-ball': 5 },
  money: 3000,
  dex: { seen: [4, 19], caught: [4], faced: { 19: 2 } },
  stats: { battles: 3, wins: 2, losses: 1, caught: 1, runs: 0 },
  cheatMode: true,
}

test('Should map every field of a save on the way in and drop the rest', () => {
  const save = transformResponseSave(rawSave)

  expect(Object.keys(save).sort()).toEqual([
    'bag',
    'box',
    'dex',
    'money',
    'party',
    'stats',
    'trainer',
    'version',
  ])
  expect(save.trainer).toEqual(rawSave.trainer)
  expect(save.dex).toEqual({ seen: [4, 19], caught: [4], faced: { 19: 2 } })
  expect(save.stats).toEqual({
    battles: 3,
    wins: 2,
    losses: 1,
    caught: 1,
    runs: 0,
  })
})

test('Should map a Pokemon to the nine stored fields and its slots to three', () => {
  const [mon] = transformResponseSave(rawSave).party

  expect(Object.keys(mon).sort()).toEqual([
    'exp',
    'hp',
    'ivs',
    'moves',
    'nickname',
    'species',
    'stats',
    'status',
    'statusTurns',
  ])
  expect(mon.level).toBeUndefined()
  expect(mon.moves).toEqual([{ move: 'ember', pp: 24, maxPp: 25 }])
})

test('Should give a save written before a field existed an empty one instead', () => {
  const save = transformResponseSave({ version: 1, party: [{ species: 4 }] })

  expect(save.party[0].moves).toEqual([])
  expect(save.box).toEqual([])
  expect(save.bag).toEqual({})
  expect(save.money).toBe(0)
  expect(save.dex).toEqual({ seen: [], caught: [], faced: {} })
  expect(save.stats).toEqual({
    battles: 0,
    wins: 0,
    losses: 0,
    caught: 0,
    runs: 0,
  })

  expect(transformResponseSave({ version: 1 }).party).toEqual([])

  const written = transformRequestSaveGame({ version: 1 })

  expect(written.party).toEqual([])
  expect(written.box).toEqual([])
})

test('Should read no save at all as nothing rather than an empty one', () => {
  expect(transformResponseSave(null)).toBeNull()
})

test('Should write back the same fields a save was read with, trainer included', () => {
  const save = transformResponseSave(rawSave)
  const written = transformRequestSaveGame(save)

  expect(written).toEqual(save)
  expect(written.trainer.name).toBe('ASH')
})

test('Should keep a field the game attached during play out of the save file', () => {
  const written = transformRequestSaveGame({
    version: 1,
    trainer: { name: 'ASH' },
    party: [
      {
        species: 4,
        nickname: null,
        exp: 1,
        ivs: {},
        stats: { hp: 1 },
        hp: 1,
        moves: [],
        status: null,
        statusTurns: 0,
        flashing: true,
      },
    ],
    box: [],
    bag: {},
    money: 0,
    dex: { seen: [], caught: [], faced: {} },
    stats: { battles: 0, wins: 0, losses: 0, caught: 0, runs: 0 },
    battle: { turn: 3 },
  })

  expect(written.battle).toBeUndefined()
  expect(written.party[0].flashing).toBeUndefined()
})

test('Should map a status to the lead, the counters and the heartbeat', () => {
  const status = transformResponseStatus({
    lead: { name: 'Charmander', level: 7, hp: 18 },
    balls: 5,
    money: 3000,
    caught: 2,
    heartbeat: 1234,
    session: 'abc',
  })

  expect(status).toEqual({
    lead: { name: 'Charmander', level: 7 },
    balls: 5,
    money: 3000,
    caught: 2,
    heartbeat: 1234,
  })
})

test('Should read a status with no lead as no lead, in both directions', () => {
  expect(transformResponseStatus({ balls: 0 }).lead).toBeNull()
  expect(
    transformRequestWriteStatus({ lead: null, heartbeat: 1 }).lead,
  ).toBeNull()
  expect(transformResponseStatus(null)).toBeNull()
})

test('Should write a status with only the five fields the status line reads', () => {
  const written = transformRequestWriteStatus({
    lead: { name: 'Pikachu', level: 5 },
    balls: 1,
    money: 10,
    caught: 1,
    heartbeat: 99,
    state: 'working',
  })

  expect(Object.keys(written).sort()).toEqual([
    'balls',
    'caught',
    'heartbeat',
    'lead',
    'money',
  ])
  expect(written.state).toBeUndefined()
})

test('Should map a session entry to the ten fields the hooks and the game read', () => {
  const entry = transformResponseActivity({
    v: 1,
    session: 'abc',
    cwd: '/work',
    at: 1000,
    state: 'working',
    tool: 'Bash',
    since: 900,
    lastStepAt: 950,
    pendingSteps: 2,
    message: 'needs permission',
    transcript_path: '/tmp/t.jsonl',
  })

  expect(entry).toEqual({
    v: 1,
    session: 'abc',
    cwd: '/work',
    at: 1000,
    state: 'working',
    tool: 'Bash',
    since: 900,
    lastStepAt: 950,
    pendingSteps: 2,
    message: 'needs permission',
  })
})

test('Should leave a missing step clock missing rather than calling it zero', () => {
  const entry = transformResponseActivity({ session: 'abc', at: 1000 })

  expect(entry.lastStepAt).toBeUndefined()
  expect(entry.since).toBeUndefined()
  expect(entry.pendingSteps).toBeUndefined()
  expect(transformResponseActivity(null)).toBeNull()
})

test('Should write a session entry with the same fields it is read with', () => {
  const written = transformRequestWriteActivity({
    v: 1,
    session: 'abc',
    cwd: null,
    at: 1000,
    state: 'idle',
    tool: null,
    since: 1000,
    lastStepAt: 1000,
    pendingSteps: 0,
    hookEventName: 'Stop',
  })

  expect(Object.keys(written).sort()).toEqual([
    'at',
    'cwd',
    'lastStepAt',
    'message',
    'pendingSteps',
    'session',
    'since',
    'state',
    'tool',
    'v',
  ])
  expect(written.hookEventName).toBeUndefined()
})

test('Should map the eleven config keys the game reads and drop anything else', () => {
  const config = transformResponseConfig({
    encounterChance: 0.5,
    charsPerStep: 10,
    maxSteps: 2,
    workStepSeconds: 5,
    sound: false,
    bell: false,
    updateCheck: 'launch',
    encounterTtlSeconds: 60,
    spriteScale: 0.6,
    wrappedStatusLine: 'echo hi',
    probeRows: 3,
    theme: 'dark',
  })

  expect(config).toEqual({
    encounterChance: 0.5,
    charsPerStep: 10,
    maxSteps: 2,
    workStepSeconds: 5,
    sound: false,
    bell: false,
    updateCheck: 'launch',
    encounterTtlSeconds: 60,
    spriteScale: 0.6,
    wrappedStatusLine: 'echo hi',
    probeRows: 3,
  })
  expect(transformResponseConfig(null)).toBeNull()
})

test('Should write only the config keys that are actually set', () => {
  const written = transformRequestWriteConfig({ sound: false, theme: 'dark' })

  expect(JSON.parse(JSON.stringify(written))).toEqual({ sound: false })
})

test('Should map an encounter to the seven fields the queue file carries', () => {
  const entry = transformResponseEncounter({
    v: 1,
    species: 16,
    name: 'Pidgey',
    level: 4,
    seed: 777,
    session: 'abc',
    at: '2026-01-01T00:00:00.000Z',
    weight: 20,
  })

  expect(entry).toEqual({
    v: 1,
    species: 16,
    name: 'Pidgey',
    level: 4,
    seed: 777,
    session: 'abc',
    at: '2026-01-01T00:00:00.000Z',
  })
  expect(transformResponseEncounter(null)).toBeNull()
})

test('Should write an encounter with the same seven fields and nothing more', () => {
  const written = transformRequestWriteEncounter({
    v: 1,
    species: 16,
    name: 'Pidgey',
    level: 4,
    seed: 777,
    session: 'abc',
    at: '2026-01-01T00:00:00.000Z',
    expiresAt: 123,
  })

  expect(Object.keys(written).sort()).toEqual([
    'at',
    'level',
    'name',
    'seed',
    'session',
    'species',
    'v',
  ])
  expect(written.expiresAt).toBeUndefined()
})

test('Should take only the version out of a plugin manifest', () => {
  expect(
    transformResponseManifest({
      name: 'claudemon',
      version: '0.6.0',
      description: 'a game',
    }),
  ).toEqual({ version: '0.6.0' })
  expect(transformResponseManifest({ name: 'claudemon' })).toEqual({
    version: undefined,
  })
  expect(transformResponseManifest(null)).toBeNull()
})

test('Should map the update state to when it checked, what it found and why not', () => {
  const state = transformResponseUpdateState({
    checkedAt: '2026-03-01T12:00:00.000Z',
    latest: '9.9.9',
    error: 'ECONNREFUSED',
    notice: { kind: 'available' },
  })

  expect(state).toEqual({
    checkedAt: '2026-03-01T12:00:00.000Z',
    latest: '9.9.9',
    error: 'ECONNREFUSED',
  })
  expect(state.notice).toBeUndefined()
})

test('Should read a missing update file as nothing so the first check is due', () => {
  expect(transformResponseUpdateState(null)).toBeNull()
})

test('Should write the update state with the same three fields', () => {
  const written = transformRequestWriteUpdateState({
    checkedAt: '2026-03-01T12:00:00.000Z',
    latest: '9.9.9',
    error: null,
    force: true,
  })

  expect(Object.keys(written).sort()).toEqual(['checkedAt', 'error', 'latest'])
  expect(written.force).toBeUndefined()
})
