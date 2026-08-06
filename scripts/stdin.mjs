import { readFileSync } from 'node:fs'
import { STDIN_TIMEOUT_MS } from './constants.mjs'

const settleStdin = (state, resolve) => {
  if (state.settled) return

  state.settled = true
  clearTimeout(state.timer)
  resolve(state.buffer)
}

export const readStdin = () => {
  return new Promise((resolve) => {
    const state = { buffer: '', settled: false, timer: null }

    const handleChunk = (chunk) => {
      state.buffer += chunk
    }

    const finish = () => settleStdin(state, resolve)

    state.timer = setTimeout(finish, STDIN_TIMEOUT_MS)

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', handleChunk)
    process.stdin.on('end', finish)
    process.stdin.on('error', finish)
  })
}

export const readStdinSync = () => {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}
