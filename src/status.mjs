import { readFileSync } from 'node:fs'
import { HEARTBEAT_STALE_MS } from './constants.mjs'
import { updateJsonFile as updateFile } from './fileLock.mjs'
import { STATUS_FILE } from './paths.mjs'
import { runtimeIdentity } from './runtime.mjs'
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

const mergeStatus = (current, incoming) => {
  if (!current) return incoming
  if (current.visitRevision > incoming.visitRevision) return current
  if (
    current.visitRevision === incoming.visitRevision &&
    current.heartbeat > incoming.heartbeat
  )
    return current

  return incoming
}

const persistStatus = (
  { lead, balls, money, caught, biome = null, visitRevision = 0 },
  heartbeat,
) => {
  const incoming = {
    runtime: runtimeIdentity(),
    lead,
    balls,
    money,
    caught,
    heartbeat,
    biome,
    visitRevision,
  }

  try {
    return updateFile({
      path: STATUS_FILE,
      incoming,
      transformResponse: transformResponseStatus,
      transformRequest: transformRequestWriteStatus,
      merge: mergeStatus,
    })
  } catch {
    return null
  }
}

export const writeStatus = (status) => persistStatus(status, Date.now())

export const writeStatusSnapshot = (status, heartbeat = 0) => {
  return persistStatus(status, heartbeat)
}

export const companionIsLive = (status) => {
  if (!status?.heartbeat) return false

  return Date.now() - status.heartbeat < HEARTBEAT_STALE_MS
}
