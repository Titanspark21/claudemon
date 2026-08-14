import { expect, test, vi } from 'vitest'
import { gyms } from '../../gym.mjs'
import { startLeague } from '../../league.mjs'
import { createPokemon } from '../../pokemon.mjs'
import { makeRng } from '../../rng.mjs'
import { stripAnsi } from '../text.mjs'
import { draw, onKey } from './league.mjs'

const allBadges = () => gyms().map((gym) => gym.id)

const aSave = (badges = allBadges()) => {
  const lead = createPokemon(25, 70, makeRng(1))
  const backup = createPokemon(6, 70, makeRng(2))
  backup.hp = 0

  return {
    badges,
    party: [lead, backup],
    league: { championships: 0, firstWonAt: null },
  }
}

const aCtx = (patch = {}) => ({
  save: aSave(),
  league: null,
  leagueMessage: null,
  leagueLeaving: false,
  bagMessage: null,
  teamSelection: 0,
  homeSelection: 3,
  setMode: vi.fn(),
  startLeagueRun: vi.fn(),
  startLeagueBattle: vi.fn(),
  openBag: vi.fn(),
  makeLead: vi.fn(),
  confirmLeaveLeague: vi.fn(),
  cancelLeaveLeague: vi.fn(),
  ...patch,
})

const textOf = (ctx) =>
  draw(ctx, { cols: 100, rows: 34 }).lines.map(stripAnsi).join('\n')

test('Should show the generated five-trainer gauntlet locked before eight badges and ready after them', () => {
  const locked = aCtx({ save: aSave(allBadges().slice(0, 7)) })
  const ready = aCtx()

  expect(textOf(locked)).toContain('Earn all eight badges')
  expect(textOf(locked)).toContain('LORELEI')
  expect(textOf(locked)).toContain('BLUE')
  expect(textOf(ready)).toContain('[enter] Five battles')

  onKey(ready, { name: 'enter' })
  expect(ready.startLeagueRun).toHaveBeenCalledOnce()

  onKey(ready, { name: 'escape' })
  expect(ready.homeSelection).toBe(0)
  expect(ready.setMode).toHaveBeenCalledWith('home')
})

test('Should render League progress, messages, party state and the next opponent during a run', () => {
  const save = aSave()
  save.league.championships = 2
  save.party[0].status = 'poison'
  const run = startLeague(save, 42)
  run.index = 2
  const ctx = aCtx({ save, league: run, teamSelection: 1 })

  const text = textOf(ctx)
  expect(text).toContain('2 championships')
  expect(text).toContain('AGATHA')
  expect(text).toContain('PIKACHU')
  expect(text).toContain('CHARIZARD')

  ctx.bagMessage = 'Bag says no.'
  expect(textOf(ctx)).toContain('Bag says no.')
  ctx.bagMessage = null
  ctx.leagueMessage = 'League notice.'
  expect(textOf(ctx)).toContain('League notice.')
  ctx.leagueMessage = null
  ctx.leagueLeaving = true
  expect(textOf(ctx)).toContain('Walk out and none of it counted')
})

test('Should route every League control without leaving the sealed run', () => {
  const save = aSave()
  const ctx = aCtx({ save, league: startLeague(save, 7) })

  onKey(ctx, { name: 'escape' })
  expect(ctx.confirmLeaveLeague).toHaveBeenCalledOnce()

  ctx.leagueLeaving = true
  onKey(ctx, { name: 'down' })
  expect(ctx.cancelLeaveLeague).toHaveBeenCalledOnce()

  ctx.leagueLeaving = false
  onKey(ctx, { name: 'up' })
  expect(ctx.teamSelection).toBe(1)
  onKey(ctx, { name: 'down' })
  expect(ctx.teamSelection).toBe(0)
  onKey(ctx, { name: 'enter' })
  onKey(ctx, { name: 'i' })
  onKey(ctx, { name: 'l' })

  expect(ctx.startLeagueBattle).toHaveBeenCalledOnce()
  expect(ctx.openBag).toHaveBeenCalledOnce()
  expect(ctx.makeLead).toHaveBeenCalledWith(0)
})
