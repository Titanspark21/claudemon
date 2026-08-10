import { expect, test } from 'vitest'
import {
  achievementEntries,
  achievementProgress,
  earnedCount,
  recordAchievements,
} from './achievements.mjs'
import { ACHIEVEMENTS, HOUR_MS } from './constants.mjs'
import { createPokemon } from './pokemon.mjs'
import { makeRng } from './rng.mjs'

const aSave = ({
  party = [],
  box = [],
  slots = [],
  badges = [],
  caught = [],
  shiny = [],
  wins = 0,
  streak = 0,
}) => {
  return {
    party,
    box,
    daycare: { slots, egg: null },
    badges,
    dex: { seen: caught, caught, shiny, faced: {} },
    stats: {
      battles: 0,
      wins,
      losses: 0,
      caught: caught.length,
      runs: 0,
      streak,
      lastPlayedAt: null,
    },
    achievements: [],
  }
}

const aMon = (speciesId, level) => {
  return createPokemon(speciesId, level, makeRng(speciesId))
}

const idsOf = (save) => save.achievements.map((entry) => entry.id)

const entryOf = (save, worked, id) => {
  return achievementEntries(save, worked).find((entry) => entry.id === id)
}

test('Should read every metric an achievement is measured against off the save', () => {
  const save = aSave({
    party: [aMon(25, 12)],
    box: [aMon(1, 41)],
    slots: [aMon(4, 52)],
    badges: ['pewter', 'cerulean'],
    caught: [1, 2],
    shiny: [2],
    wins: 21,
    streak: 9,
  })

  expect(achievementProgress(save, { totalMs: HOUR_MS * 30 })).toEqual({
    caught: 2,
    shiny: 1,
    badges: 2,
    wins: 21,
    streak: 9,
    level: 52,
    hours: 30,
  })
})

test('Should count no level at all when the party and the box are both empty', () => {
  expect(achievementProgress(aSave({}), { totalMs: 0 }).level).toBe(0)
})

test('Should award every achievement the save has reached and stamp the day it happened', () => {
  const save = aSave({ badges: ['pewter'], caught: [1, 2, 3], shiny: [3] })

  const earned = recordAchievements(
    save,
    { totalMs: 0 },
    Date.parse('2026-08-08T10:00:00.000Z'),
  )

  expect(earned).toEqual(['first-catch', 'first-badge', 'first-shiny'])
  expect(save.achievements).toEqual([
    { id: 'first-catch', earnedAt: '2026-08-08T10:00:00.000Z' },
    { id: 'first-badge', earnedAt: '2026-08-08T10:00:00.000Z' },
    { id: 'first-shiny', earnedAt: '2026-08-08T10:00:00.000Z' },
  ])
})

test('Should award nothing twice, so a second look leaves the first date alone', () => {
  const save = aSave({ badges: ['pewter'] })

  recordAchievements(save, { totalMs: 0 }, Date.parse('2026-08-08T10:00:00Z'))

  const again = recordAchievements(
    save,
    { totalMs: 0 },
    Date.parse('2026-09-01T10:00:00Z'),
  )

  expect(again, 'nothing new the second time').toEqual([])
  expect(save.achievements).toHaveLength(1)
  expect(save.achievements[0].earnedAt).toBe('2026-08-08T10:00:00.000Z')
})

test('Should keep a streak achievement earned after the streak breaks', () => {
  const save = aSave({ streak: 7 })

  recordAchievements(save, { totalMs: 0 }, Date.parse('2026-08-08T10:00:00Z'))

  expect(idsOf(save)).toContain('streak-7')

  save.stats.streak = 1

  recordAchievements(save, { totalMs: 0 }, Date.parse('2026-08-10T10:00:00Z'))

  const entry = entryOf(save, { totalMs: 0 }, 'streak-7')

  expect(idsOf(save), 'it does not lock again').toContain('streak-7')
  expect(entry.earnedAt).toBe('2026-08-08T10:00:00.000Z')
  expect(entry.value, 'even though the streak is back to one').toBe(1)
})

test('Should describe every achievement with how far along it is and whether it is earned', () => {
  const save = aSave({ caught: [1, 2, 3] })

  recordAchievements(save, { totalMs: 0 }, Date.parse('2026-08-08T10:00:00Z'))

  const entries = achievementEntries(save, { totalMs: 0 })

  expect(entries).toHaveLength(ACHIEVEMENTS.length)
  expect(earnedCount(entries)).toBe(1)
  expect(entryOf(save, { totalMs: 0 }, 'first-catch').earnedAt).toBe(
    '2026-08-08T10:00:00.000Z',
  )
  expect(entryOf(save, { totalMs: 0 }, 'dex-25')).toEqual({
    id: 'dex-25',
    label: 'Dex at 25',
    hint: 'Fill twenty-five entries of the Pokédex.',
    goal: 25,
    value: 3,
    earnedAt: null,
  })
})

test('Should give every achievement a unique id and a metric the progress actually reports', () => {
  const progress = achievementProgress(aSave({}), { totalMs: 0 })
  const ids = ACHIEVEMENTS.map((achievement) => achievement.id)

  expect(new Set(ids).size, 'no id is used twice').toBe(ids.length)

  for (const achievement of ACHIEVEMENTS) {
    expect(progress[achievement.metric], achievement.id).toBeTypeOf('number')
    expect(achievement.goal, achievement.id).toBeGreaterThan(0)
  }
})
