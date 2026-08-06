export const pool = async (items, worker, limit) => {
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
