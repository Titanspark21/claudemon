import { GYM_SEED_STRIDE, GYM_STATUSES } from './constants.mjs'
import { progressionData } from './data.mjs'

export const gyms = () => progressionData().gyms

export const gymById = (id) => gyms().find((gym) => gym.id === id)

export const gymIndex = (id) => gyms().findIndex((gym) => gym.id === id)

export const gymRoster = (gym) => [...gym.trainers, gym.leader]

export const opponentLevelRange = (opponent) => {
  const levels = opponent.team.map((entry) => entry.level)

  return { min: Math.min(...levels), max: Math.max(...levels) }
}

export const gymLevelRange = (gym) => {
  const ranges = gymRoster(gym).map(opponentLevelRange)

  return {
    min: Math.min(...ranges.map((range) => range.min)),
    max: Math.max(...ranges.map((range) => range.max)),
  }
}

export const createGymRun = ({ gym, seed, save }) => {
  return { id: gym.id, index: 0, seed, snapshot: structuredClone(save) }
}

export const rollbackGymRun = (run) => run.snapshot

export const gymOf = (run) => gymById(run.id)

export const currentOpponent = (run) => gymRoster(gymOf(run))[run.index]

const opponentsLeft = (run) => gymRoster(gymOf(run)).length - run.index

export const isLeaderNext = (run) => opponentsLeft(run) === 1

export const isGymCleared = (run) => opponentsLeft(run) <= 0

export const opponentStatus = (run, index) => {
  if (index < run.index) return GYM_STATUSES.beaten
  if (index === run.index) return GYM_STATUSES.next

  return GYM_STATUSES.pending
}

export const advanceGymRun = (run) => {
  run.index++

  return run
}

export const gymBattleSeed = (run) => {
  return (run.seed + run.index * GYM_SEED_STRIDE) >>> 0
}
