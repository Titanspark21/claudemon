import { expect, test, vi } from 'vitest'
import {
  achievementDefinitions,
  recordAchievements,
} from '../../achievements.mjs'
import { HOUR_MS } from '../../constants.mjs'
import { createPokemon } from '../../pokemon.mjs'
import { makeRng } from '../../rng.mjs'
import { stripAnsi } from '../text.mjs'
import { draw, onKey } from './trainer.mjs'
import { TRAINER_ACHIEVEMENTS_TITLE, TRAINER_NOTES } from './constants.mjs'

const SIZE = { cols: 100, rows: 34 }

const aSave = ({ caught = [1], badges = [], streak = 1, wins = 0 }) => {
  return {
    trainer: { name: 'Ash', startedAt: '2026-08-01T00:00:00.000Z' },
    party: [createPokemon(25, 12, makeRng(1))],
    box: [],
    daycare: { slots: [], egg: null },
    bag: {},
    money: 3000,
    badges,
    dex: { seen: caught, caught, shiny: [], faced: {} },
    stats: {
      battles: 14,
      wins,
      losses: 3,
      caught: caught.length,
      runs: 2,
      streak,
      lastPlayedAt: null,
    },
    achievements: [],
  }
}

const aCtx = (save, worked, selection) => {
  return {
    save,
    worked,
    trainerSelection: selection,
    notice: null,
    playSound: vi.fn(),
    setMode: vi.fn(),
    exportCard: vi.fn(),
    homeSelection: 3,
  }
}

const textOf = (ctx) => {
  return draw(ctx, SIZE).lines.map(stripAnsi).join('\n')
}

test('Should show the record the card is built from, all of it, on one screen', () => {
  const save = aSave({ caught: [1, 2, 3], badges: ['pewter'], streak: 6 })
  const text = textOf(aCtx(save, { totalMs: HOUR_MS * 41 }, 0))

  expect(text).toContain('ASH')
  expect(text, 'the trainer started a week ago').toMatch(/\d+ days on the road/)
  expect(text).toContain('Caught   3/809')
  expect(text).toContain('Battles  14')
  expect(text).toContain('Lost     3')
  expect(text).toContain('Ran      2')
  expect(text).toContain('Streak   6 days')
  expect(text, 'the hours only the card knew about').toContain('Worked   41h')
  expect(text).toContain('Money    3,000₽')
})

test('Should say one day rather than one days on a save opened for the first time', () => {
  const text = textOf(aCtx(aSave({ streak: 1 }), { totalMs: 0 }, 0))

  expect(text).toContain('Streak   1 day')
})

test('Should count the earned achievements and show the rest with how far along they are', () => {
  const save = aSave({ caught: [1, 2, 3], badges: ['pewter'] })

  recordAchievements(save, { totalMs: 0 }, Date.parse('2026-08-04T09:00:00Z'))

  const text = textOf(aCtx(save, { totalMs: 0 }, 0))

  expect(text).toContain(
    `${TRAINER_ACHIEVEMENTS_TITLE}  2/${achievementDefinitions().length}`,
  )
  expect(text).toContain('● First catch')
  expect(text, 'a locked one carries its progress').toMatch(
    /○ Dex at 25\s+3\/25/,
  )
})

test('Should read out the selected achievement, with the date once it is earned', () => {
  const save = aSave({ caught: [1, 2, 3] })

  recordAchievements(save, { totalMs: 0 }, Date.parse('2026-08-04T09:00:00Z'))

  const earned = textOf(aCtx(save, { totalMs: 0 }, 0))
  const locked = textOf(aCtx(save, { totalMs: 0 }, 1))

  expect(earned).toContain('Catch something that was not handed to you.')
  expect(earned).toContain(`${TRAINER_NOTES.earned} 2026-08-04`)
  expect(locked).toContain('Beat a gym leader and take the badge home.')
  expect(locked, 'nothing to date yet').not.toContain(TRAINER_NOTES.earned)
})

test('Should show where the card was written after sharing one', () => {
  const ctx = aCtx(aSave({}), { totalMs: 0 }, 0)

  ctx.notice = 'Trainer card written to /tmp/card.png'

  expect(textOf(ctx)).toContain('Trainer card written to /tmp/card.png')
})

test('Should wrap the cursor round the ends of the achievement list', () => {
  const ctx = aCtx(aSave({}), { totalMs: 0 }, 0)

  onKey(ctx, { name: 'up' })

  expect(ctx.trainerSelection, 'up from the top lands on the last').toBe(
    achievementDefinitions().length - 1,
  )

  onKey(ctx, { name: 'down' })

  expect(ctx.trainerSelection).toBe(0)
  expect(ctx.playSound).toHaveBeenCalledTimes(2)
  expect(ctx.playSound).toHaveBeenCalledWith('cursor')
})

test('Should write the card on [s] and leave for the home screen on [esc]', () => {
  const ctx = aCtx(aSave({}), { totalMs: 0 }, 0)

  onKey(ctx, { name: 's' })

  expect(ctx.exportCard).toHaveBeenCalledTimes(1)
  expect(ctx.setMode, 'sharing keeps you here').not.toHaveBeenCalled()

  onKey(ctx, { name: 'escape' })

  expect(ctx.setMode).toHaveBeenCalledTimes(1)
  expect(ctx.setMode).toHaveBeenCalledWith('home')
  expect(ctx.homeSelection, 'and the home cursor goes back to the start').toBe(
    0,
  )
})
