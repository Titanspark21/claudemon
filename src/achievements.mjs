import { ACHIEVEMENTS } from './constants.mjs'
import { allPokemon } from './helpers.mjs'
import { levelOf } from './pokemon.mjs'
import { workedHours } from './worked.mjs'

const highestLevel = (save) => {
  return allPokemon(save).reduce((best, mon) => {
    return Math.max(best, levelOf(mon))
  }, 0)
}

export const achievementProgress = (save, worked) => {
  return {
    caught: save.dex.caught.length,
    shiny: save.dex.shiny.length,
    badges: save.badges.length,
    wins: save.stats.wins,
    streak: save.stats.streak,
    level: highestLevel(save),
    hours: workedHours(worked),
  }
}

const earnedAt = (save, id) => {
  const held = save.achievements.find((entry) => entry.id === id)

  return held ? held.earnedAt : null
}

export const recordAchievements = (save, worked, now = Date.now()) => {
  const progress = achievementProgress(save, worked)
  const stamp = new Date(now).toISOString()
  const earned = []

  for (const achievement of ACHIEVEMENTS) {
    if (earnedAt(save, achievement.id)) continue
    if (progress[achievement.metric] < achievement.goal) continue

    save.achievements.push({ id: achievement.id, earnedAt: stamp })
    earned.push(achievement.id)
  }

  return earned
}

export const achievementEntries = (save, worked) => {
  const progress = achievementProgress(save, worked)

  return ACHIEVEMENTS.map((achievement) => ({
    id: achievement.id,
    label: achievement.label,
    hint: achievement.hint,
    goal: achievement.goal,
    value: progress[achievement.metric],
    earnedAt: earnedAt(save, achievement.id),
  }))
}

export const earnedCount = (entries) => {
  return entries.filter((entry) => entry.earnedAt).length
}
