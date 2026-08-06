import { KEY_SEQUENCES } from './constants.mjs'

export const parseKey = (chunk) => {
  const sequence = chunk.toString('utf8')
  const name = KEY_SEQUENCES.get(sequence)

  if (name) return { name }

  return { name: sequence, char: sequence }
}
