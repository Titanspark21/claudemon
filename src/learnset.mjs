import { MOVE_LIMIT } from './constants.mjs'
import { move, species } from './data.mjs'

const byLearnOrder = (a, b) => {
  if (a.level !== b.level) return a.level - b.level

  const aIsStatus = move(a.move).damageClass === 'status'
  const bIsStatus = move(b.move).damageClass === 'status'

  if (aIsStatus !== bIsStatus) return aIsStatus ? 1 : -1

  return a.move.localeCompare(b.move)
}

export const movesAtLevel = (speciesId, level) => {
  const learnable = species(speciesId)
    .learnset.filter((entry) => entry.level <= level)
    .sort(byLearnOrder)
    .map((entry) => entry.move)

  return [...new Set(learnable.reverse())].slice(0, MOVE_LIMIT).reverse()
}

export const movesLearnedAt = (speciesId, level) => {
  return species(speciesId)
    .learnset.filter((entry) => entry.level === level)
    .map((entry) => entry.move)
}
