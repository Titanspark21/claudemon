import { expect, test } from 'vitest'
import { useSandboxHome } from './sandboxHome.mjs'

useSandboxHome('claudemon-league-app-')

const { createApp } = await import('../src/app.mjs')
const { DEFAULT_CONFIG, LEAGUE_MESSAGES } = await import('../src/constants.mjs')
const { gyms } = await import('../src/gym.mjs')
const { createPokemon } = await import('../src/pokemon.mjs')
const { makeRng } = await import('../src/rng.mjs')
const { createSave, loadSave } = await import('../src/state.mjs')
const homeView = await import('../src/ui/views/home.mjs')

const stubScreen = () => ({
  size: () => ({ cols: 100, rows: 34 }),
  render: () => {},
  repaint: () => {},
  stop: () => {},
  onKey: () => {},
  onResize: () => {},
  bell: () => {},
})

const leagueSave = () => {
  const save = createSave({ trainer: 'Red', starterId: 1, rng: makeRng(1) })
  save.badges = gyms().map((gym) => gym.id)
  save.party = [createPokemon(150, 90, makeRng(2))]
  return save
}

const appWith = (save) =>
  createApp({ screen: stubScreen(), save, config: { ...DEFAULT_CONFIG } })

test('Should keep the League visible but locked until all eight generated badges are earned', () => {
  const save = leagueSave()
  const app = appWith(save)

  save.badges.pop()
  expect(
    homeView.menuItems(app).find((item) => item.id === 'league').disabled,
  ).toBe(true)

  save.badges = gyms().map((gym) => gym.id)
  expect(
    homeView.menuItems(app).find((item) => item.id === 'league').disabled ??
      false,
  ).toBe(false)
})

test('Should instantiate the generated League team with its explicit ability, moves and held item data', () => {
  const app = appWith(leagueSave())

  app.openHomeSelection('league')
  app.startLeagueRun()
  app.startLeagueBattle()

  const team = app.battle.state.trainer.team
  expect(team[0].ability).toBeTruthy()
  expect(team[0].moves).toHaveLength(4)
  expect(team[0].moves.every((slot) => slot.pp === slot.maxPp)).toBe(true)
  expect(team.at(-1).heldItem).toBe('leftovers')
})

test('Should restore the exact pre-League save after a loss and persist the rollback', () => {
  const app = appWith(leagueSave())
  app.save.money = 4321
  app.save.bag = { potion: 3 }
  app.persist()
  const hpBefore = app.save.party[0].hp

  app.openHomeSelection('league')
  app.startLeagueRun()
  app.save.money = 1
  app.save.bag.potion = 0
  app.save.party[0].hp = 1
  app.save.stats.wins = 99
  app.finishLeagueBattle('loss')

  expect(app.league).toBeNull()
  expect(app.mode).toBe('league')
  expect(app.leagueMessage).toBe(LEAGUE_MESSAGES.defeated)
  expect(app.save.money).toBe(4321)
  expect(app.save.bag).toEqual({ potion: 3 })
  expect(app.save.party[0].hp).toBe(hpBefore)
  expect(app.save.stats.wins).toBe(0)
  expect(loadSave().money).toBe(4321)
})

test('Should record and persist a championship only after all five League wins', () => {
  const app = appWith(leagueSave())

  app.openHomeSelection('league')
  app.startLeagueRun()

  for (let battle = 0; battle < 4; battle++) {
    app.finishLeagueBattle('win')
    expect(app.league).not.toBeNull()
  }

  app.finishLeagueBattle('win')

  expect(app.league).toBeNull()
  expect(app.save.league.championships).toBe(1)
  expect(app.save.league.firstWonAt).toBeTruthy()
  expect(
    app.save.achievements.some((entry) => entry.id === 'league-champion'),
  ).toBe(true)

  const firstWonAt = app.save.league.firstWonAt
  const persisted = loadSave()
  expect(persisted.league.championships).toBe(1)
  expect(
    persisted.achievements.some((entry) => entry.id === 'league-champion'),
  ).toBe(true)

  app.startLeagueRun()
  for (let battle = 0; battle < 5; battle++) app.finishLeagueBattle('win')

  expect(app.save.league.championships).toBe(2)
  expect(
    app.save.league.firstWonAt,
    'the first championship date is immutable',
  ).toBe(firstWonAt)
  expect(
    app.save.achievements.filter((entry) => entry.id === 'league-champion'),
    'the Champion achievement is idempotent',
  ).toHaveLength(1)
})
