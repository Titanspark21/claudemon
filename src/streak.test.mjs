import { expect, test } from 'vitest'
import { advanceStreak } from './streak.mjs'

const at = (year, month, day, hour) => {
  return new Date(year, month - 1, day, hour).getTime()
}

test('Should open the streak at one the first time anybody plays', () => {
  const now = at(2026, 8, 8, 10)

  expect(advanceStreak({ streak: 0, lastPlayedAt: null }, now)).toEqual({
    streak: 1,
    lastPlayedAt: new Date(now).toISOString(),
  })
})

test('Should leave the streak and the day alone when you play again the same day', () => {
  const morning = new Date(at(2026, 8, 8, 9)).toISOString()

  expect(
    advanceStreak({ streak: 4, lastPlayedAt: morning }, at(2026, 8, 8, 23)),
  ).toEqual({ streak: 4, lastPlayedAt: morning })
})

test('Should add a day to the streak when you come back the next one', () => {
  const yesterday = new Date(at(2026, 8, 7, 23)).toISOString()
  const now = at(2026, 8, 8, 1)

  expect(advanceStreak({ streak: 4, lastPlayedAt: yesterday }, now)).toEqual({
    streak: 5,
    lastPlayedAt: new Date(now).toISOString(),
  })
})

test('Should start the streak over when a whole day went by without playing', () => {
  const now = at(2026, 8, 8, 10)

  expect(
    advanceStreak(
      { streak: 9, lastPlayedAt: new Date(at(2026, 8, 6, 20)).toISOString() },
      now,
    ),
  ).toEqual({ streak: 1, lastPlayedAt: new Date(now).toISOString() })
})

test('Should treat a date it cannot read as never having played', () => {
  const now = at(2026, 8, 8, 10)

  expect(advanceStreak({ streak: 9, lastPlayedAt: 'whenever' }, now)).toEqual({
    streak: 1,
    lastPlayedAt: new Date(now).toISOString(),
  })
})
