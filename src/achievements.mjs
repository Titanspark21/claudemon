import { ACHIEVEMENTS } from './constants.mjs'
import { progressionData, speciesIdentity } from './data.mjs'
import { allPokemon } from './helpers.mjs'
import { formCompletion, nationalCompletion } from './league.mjs'
import { levelOf } from './pokemon.mjs'
import { workedHours } from './worked.mjs'

const highestLevel = (save) => {
  return allPokemon(save).reduce((best, mon) => {
    return Math.max(best, levelOf(mon))
  }, 0)
}

const kantoCaught = (save) => {
  const caught = new Set()
  const kantoIds = new Set(progressionData().metadata.kantoSpeciesIds)

  for (const id of save.dex.caught ?? []) {
    try {
      const identity = speciesIdentity(id)
      if (identity.formKey === null && kantoIds.has(identity.id))
        caught.add(identity.id)
    } catch {}
  }

  return caught.size
}

export const achievementDefinitions = () => {
  const national = nationalCompletion({ dex: { caught: [] } })
  const forms = formCompletion({ dex: { caught: [] } })

  return [
    ...ACHIEVEMENTS.map((achievement) =>
      achievement.id === 'dex-151'
        ? { ...achievement, goal: progressionData().metadata.kantoDexTotal }
        : achievement,
    ),
    {
      id: 'dex-national',
      label: 'National complete',
      hint: 'Catch every base species in the Generation VII National Pokédex.',
      metric: 'nationalCaught',
      goal: national.total,
    },
    {
      id: 'forms-complete',
      label: 'Every form',
      hint: 'Catch every collectible alternate form in the dataset.',
      metric: 'formCaught',
      goal: forms.total,
    },
    {
      id: 'league-champion',
      label: 'Champion',
      hint: 'Defeat the Elite Four and the Champion in one run.',
      metric: 'championships',
      goal: 1,
    },
  ]
}

export const achievementProgress = (save, worked) => {
  const national = nationalCompletion(save)
  const forms = formCompletion(save)

  return {
    caught: national.caught,
    kantoCaught: kantoCaught(save),
    nationalCaught: national.caught,
    formCaught: forms.caught,
    shiny: save.dex.shiny.length,
    badges: save.badges.length,
    wins: save.stats.wins,
    streak: save.stats.streak,
    level: highestLevel(save),
    hours: workedHours(worked),
    championships: save.league?.championships ?? 0,
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

  for (const achievement of achievementDefinitions()) {
    if (earnedAt(save, achievement.id)) continue
    if (progress[achievement.metric] < achievement.goal) continue

    save.achievements.push({ id: achievement.id, earnedAt: stamp })
    earned.push(achievement.id)
  }

  return earned
}

export const achievementEntries = (save, worked) => {
  const progress = achievementProgress(save, worked)

  return achievementDefinitions().map((achievement) => ({
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
