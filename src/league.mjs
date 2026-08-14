import { loadData, progressionData, speciesIdentity } from './data.mjs'
import { gyms } from './gym.mjs'

export const LEAGUE_SEED_STRIDE = 131

export const leagueOpponents = () => {
  const league = progressionData().league
  return [...league.eliteFour, league.champion]
}

export const leagueUnlocked = (save) => {
  const earned = new Set(save?.badges ?? [])
  return gyms().every((gym) => earned.has(gym.id))
}

export const startLeague = (save, seed) => {
  if (!leagueUnlocked(save)) throw new Error('all eight badges are required')

  return {
    index: 0,
    seed: seed >>> 0,
    snapshot: structuredClone(save),
    lost: false,
    completed: false,
  }
}

export const currentLeagueOpponent = (run) => leagueOpponents()[run.index]

export const leagueBattleSeed = (run) => {
  return (run.seed + run.index * LEAGUE_SEED_STRIDE) >>> 0
}

export const advanceLeague = (run, battleResult) => {
  const outcome = battleResult?.outcome ?? battleResult

  if (outcome !== 'win') {
    run.lost = true
    return run
  }

  run.index++
  run.completed = run.index >= leagueOpponents().length
  return run
}

export const rollbackLeagueRun = (run) => structuredClone(run.snapshot)

const baseCaughtIds = (save) => {
  const ids = new Set()

  for (const id of save?.dex?.caught ?? []) {
    try {
      const identity = speciesIdentity(id)
      if (identity.formKey === null) ids.add(identity.id)
    } catch {}
  }

  return ids
}

export const nationalCompletion = (save) => {
  return {
    caught: baseCaughtIds(save).size,
    total: progressionData().metadata.nationalDexTotal,
  }
}

export const formCompletion = (save, dataset = loadData()) => {
  const collectibleForms = dataset.speciesIdentities.records.filter(
    (record) =>
      record.formKey !== null && record.collectible && !record.battleOnly,
  )
  const valid = new Set(collectibleForms.map((record) => record.id))
  const caught = new Set(
    (save?.dex?.caught ?? []).filter((id) => valid.has(id)),
  )

  return { caught: caught.size, total: collectibleForms.length }
}
