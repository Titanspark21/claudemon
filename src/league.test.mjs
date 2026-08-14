import { expect, test } from 'vitest'
import { loadData, species } from './data.mjs'
import { gyms } from './gym.mjs'
import {
  advanceLeague,
  currentLeagueOpponent,
  formCompletion,
  leagueBattleSeed,
  leagueOpponents,
  leagueUnlocked,
  nationalCompletion,
  rollbackLeagueRun,
  startLeague,
} from './league.mjs'

const allBadges = () => gyms().map((gym) => gym.id)

const aSave = (patch = {}) => ({
  badges: [],
  dex: { seen: [], caught: [], shiny: [], faced: {} },
  league: { championships: 0, firstWonAt: null },
  money: 1200,
  bag: { potion: 2 },
  ...patch,
})

test('Should unlock the League only after all eight generated gym badges are earned', () => {
  expect(gyms()).toHaveLength(8)
  expect(leagueUnlocked(aSave({ badges: allBadges() }))).toBe(true)
  expect(leagueUnlocked(aSave({ badges: allBadges().slice(0, 7) }))).toBe(false)
  expect(
    leagueUnlocked(aSave({ badges: [...allBadges().slice(0, 7), 'fake'] })),
  ).toBe(false)
})

test('Should run four Elite Four battles and then the Champion in a fixed order', () => {
  const opponents = leagueOpponents()
  const save = aSave({ badges: allBadges() })
  const run = startLeague(save, 400)

  expect(opponents).toHaveLength(5)
  expect(
    opponents.slice(0, 4).every((entry) => entry.class === 'Elite Four'),
  ).toBe(true)
  expect(opponents[4].class).toBe('Champion')

  for (let index = 0; index < opponents.length; index++) {
    expect(currentLeagueOpponent(run).name).toBe(opponents[index].name)
    expect(leagueBattleSeed(run)).toBe(400 + index * 131)
    advanceLeague(run, 'win')
  }

  expect(run.completed).toBe(true)
})

test('Should stop a League run on a loss and restore the exact pre-run snapshot', () => {
  const save = aSave({ badges: allBadges() })
  const run = startLeague(save, 77)

  save.money = 1
  save.bag.potion = 0
  advanceLeague(run, 'loss')

  expect(run.lost).toBe(true)
  expect(rollbackLeagueRun(run)).toEqual(aSave({ badges: allBadges() }))
})

test('Should count National base species separately from collectible forms', () => {
  const data = loadData()
  const caught = [1, 151, 152, 809]
  const form = data.speciesIdentities.records.find(
    (entry) => entry.formKey !== null && entry.collectible && !entry.battleOnly,
  )
  const save = aSave({
    dex: {
      seen: [...caught, form.id],
      caught: [...caught, form.id],
      shiny: [],
      faced: {},
    },
  })

  expect(nationalCompletion(save)).toEqual({ caught: 4, total: 809 })
  expect(formCompletion(save, data)).toEqual({
    caught: 1,
    total: data.speciesIdentities.records.filter(
      (entry) =>
        entry.formKey !== null && entry.collectible && !entry.battleOnly,
    ).length,
  })
})

test('Should ship legal generated League teams with explicit abilities, moves, items and one Mega', () => {
  const data = loadData()
  const opponents = leagueOpponents()
  let megaCount = 0

  for (const opponent of opponents) {
    expect(opponent.team.length).toBeGreaterThanOrEqual(4)
    for (const entry of opponent.team) {
      const record = species(entry.species)
      expect(
        record.abilities.some((slot) => slot.ability === entry.ability),
      ).toBe(true)
      expect(entry.moves).toHaveLength(4)
      for (const move of entry.moves) {
        expect(
          data.moves[move],
          `${opponent.name} has unknown move ${move}`,
        ).toBeTruthy()
        expect(
          record.learnset.some(
            (learned) => learned.move === move && learned.level <= entry.level,
          ),
          `${opponent.name}'s ${record.name} cannot know ${move} by level ${entry.level}`,
        ).toBe(true)
      }
      if (entry.heldItem) expect(data.items[entry.heldItem]).toBeTruthy()
      if (entry.mega) megaCount++
    }
  }

  expect(megaCount).toBe(1)
})
