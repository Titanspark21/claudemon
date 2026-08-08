import { DAY_MS } from './constants.mjs'

const startOfDay = (at) => {
  const date = new Date(at)

  date.setHours(0, 0, 0, 0)

  return date.getTime()
}

const daysBetween = (from, to) => {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS)
}

const lastPlayed = (record) => {
  if (!record.lastPlayedAt) return null

  const at = Date.parse(record.lastPlayedAt)

  if (Number.isNaN(at)) return null

  return at
}

export const advanceStreak = (record, now) => {
  const previous = lastPlayed(record)

  if (previous === null)
    return { streak: 1, lastPlayedAt: new Date(now).toISOString() }

  const days = daysBetween(previous, now)

  if (days === 0) {
    return { streak: record.streak, lastPlayedAt: record.lastPlayedAt }
  }

  if (days === 1) {
    return {
      streak: record.streak + 1,
      lastPlayedAt: new Date(now).toISOString(),
    }
  }

  return { streak: 1, lastPlayedAt: new Date(now).toISOString() }
}
