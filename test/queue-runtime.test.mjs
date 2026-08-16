import { writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { useSandboxHome } from './sandboxHome.mjs'

useSandboxHome('claudemon-queue-runtime-')

const { QUEUE_FILE } = await import('../src/paths.mjs')
const {
  clearEncounter,
  encounterExpiresAt,
  offerEncounter,
  peekQueue,
  readEncounterResult,
  writeEncounter,
} = await import('../src/queue.mjs')
const { runtimeIdentity, runtimeReinstallInstruction } =
  await import('../src/runtime.mjs')

const wild = (patch = {}) => ({
  v: 1,
  species: 25,
  name: 'Pikachu',
  level: 22,
  seed: 7,
  biome: 'city-powerworks',
  visitRevision: 3,
  ...patch,
})

test('Should keep one stamped runtime encounter live and refuse a second offer', () => {
  clearEncounter()
  const written = writeEncounter(wild())
  const at = Date.parse(written.at)

  expect(written.runtime).toEqual(runtimeIdentity())
  expect(encounterExpiresAt(written, 30_000)).toBe(at + 30_000)
  expect(readEncounterResult(30_000, at + 1).encounter).toEqual(written)
  expect(
    offerEncounter(wild({ species: 26, name: 'Raichu' }), 30_000, at + 1),
  ).toBe(false)

  clearEncounter()
  expect(peekQueue()).toEqual([])
  expect(offerEncounter(wild(), 30_000, at + 1)).toBe(true)
})

test('Should ignore torn, expired and unusable queue lines', () => {
  const now = Date.now()

  writeFileSync(
    QUEUE_FILE,
    [
      '{not-json',
      JSON.stringify(wild({ at: 'not-a-date' })),
      JSON.stringify(
        wild({
          kind: 'trainer',
          species: undefined,
          name: undefined,
          trainer: {
            class: 'Definitely Not A Trainer',
            name: 'Nope',
            team: [],
          },
          at: new Date(now).toISOString(),
        }),
      ),
    ].join('\n'),
  )

  expect(encounterExpiresAt({ at: 'not-a-date' }, 30_000)).toBeNull()
  expect(readEncounterResult(30_000, now)).toEqual({
    encounter: null,
    error: null,
  })
})

test('Should reject a live encounter from another runtime revision', () => {
  const runtime = runtimeIdentity()
  const now = Date.now()

  writeEncounter(
    wild({
      runtime: { ...runtime, root: `${runtime.root}-foreign` },
      at: new Date(now).toISOString(),
    }),
  )

  expect(readEncounterResult(30_000, now)).toEqual({
    encounter: null,
    error: runtimeReinstallInstruction(),
  })
})
