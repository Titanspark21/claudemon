import { BAR_EMPTY, BAR_FILLED, BAR_WIDTH, LABEL_WIDTH } from './constants.mjs'
import { pool } from './pool.mjs'

export const progress = (label, done, total) => {
  const filled = total > 0 ? Math.round((done / total) * BAR_WIDTH) : BAR_WIDTH

  process.stdout.write(
    `\r  ${label.padEnd(LABEL_WIDTH)} ${BAR_FILLED.repeat(filled)}${BAR_EMPTY.repeat(BAR_WIDTH - filled)} ${done}/${total}`,
  )

  if (done >= total) process.stdout.write('\n')
}

export const pass = async (label, items, worker, limit) => {
  let done = 0

  progress(label, 0, items.length)

  return pool(
    items,
    async (item, index) => {
      const value = await worker(item, index)

      progress(label, ++done, items.length)

      return value
    },
    limit,
  )
}
