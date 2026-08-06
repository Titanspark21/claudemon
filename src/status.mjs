import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { HEARTBEAT_STALE_MS } from './constants.mjs'
import { HOME, STATUS_FILE } from './paths.mjs'
import {
  transformRequestWriteStatus,
  transformResponseStatus,
} from './transformers.mjs'

const readStatusFile = () => {
  try {
    return JSON.parse(readFileSync(STATUS_FILE, 'utf8'))
  } catch {
    return null
  }
}

export const readStatus = () => transformResponseStatus(readStatusFile())

export const writeStatus = ({ lead, balls, money, caught }) => {
  try {
    mkdirSync(HOME, { recursive: true })

    const payload = JSON.stringify(
      transformRequestWriteStatus({
        lead,
        balls,
        money,
        caught,
        heartbeat: Date.now(),
      }),
    )
    const tmp = `${STATUS_FILE}.${process.pid}.tmp`

    writeFileSync(tmp, payload)
    renameSync(tmp, STATUS_FILE)
  } catch {}
}

export const companionIsLive = (status) => {
  if (!status?.heartbeat) return false

  return Date.now() - status.heartbeat < HEARTBEAT_STALE_MS
}
