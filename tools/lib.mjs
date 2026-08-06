export async function pool(items, worker, limit) {
  let cursor = 0
  const results = new Array(items.length)

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await worker(items[index], index)
      }
    }),
  )
  return results
}

const BAR_WIDTH = 24

export function progress(label, done, total) {
  const filled = total > 0 ? Math.round((done / total) * BAR_WIDTH) : BAR_WIDTH
  process.stdout.write(
    `\r  ${label.padEnd(14)} ${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)} ${done}/${total}`,
  )
  if (done >= total) process.stdout.write('\n')
}

export async function pass(label, items, worker, limit) {
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
