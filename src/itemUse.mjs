import { learnEvolutionMoves } from './progression.mjs'
import { useItem } from './shop.mjs'
import { markCaught } from './state.mjs'

export const applyItem = (save, key, mon) => {
  const result = useItem(save, key, mon)

  if (!result.evolvedInto) return result

  markCaught(save, result.evolvedInto)

  return { ...result, steps: learnEvolutionMoves(mon) }
}
