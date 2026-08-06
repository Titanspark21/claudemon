import { expect, test, vi } from 'vitest'
import { pool } from './pool.mjs'

test('Should return results in item order even when workers finish out of order', async () => {
  const completions = []

  const results = await pool(
    [30, 20, 10],
    async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay))

      completions.push(index)

      return `item-${index}`
    },
    3,
  )

  expect(results).toEqual(['item-0', 'item-1', 'item-2'])
  expect(completions).toEqual([2, 1, 0])
})

test('Should pass each item and its index to the worker', async () => {
  const worker = vi.fn(async (item, index) => `${item}${index}`)

  const results = await pool(['a', 'b', 'c'], worker, 1)

  expect(results).toEqual(['a0', 'b1', 'c2'])
  expect(worker).toHaveBeenCalledTimes(3)
  expect(worker).toHaveBeenNthCalledWith(1, 'a', 0)
  expect(worker).toHaveBeenNthCalledWith(2, 'b', 1)
  expect(worker).toHaveBeenNthCalledWith(3, 'c', 2)
})

test('Should run every item once when the limit is greater than the item count', async () => {
  const worker = vi.fn(async (item) => item * 2)

  const results = await pool([1, 2], worker, 10)

  expect(results).toEqual([2, 4])
  expect(worker).toHaveBeenCalledTimes(2)
})

test('Should return an empty array and never call the worker for empty input', async () => {
  const worker = vi.fn()

  const results = await pool([], worker, 4)

  expect(results).toEqual([])
  expect(worker).not.toHaveBeenCalled()
})
