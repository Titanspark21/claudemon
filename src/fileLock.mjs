import * as fs from 'node:fs'
import { dirname } from 'node:path'
import {
  FILE_LOCK_RETRY_MS,
  FILE_LOCK_STALE_MS,
  FILE_LOCK_TIMEOUT_MS,
} from './constants.mjs'

const lockPathFor = (path) => `${path}.lock`

const waitForRetry = () => {
  const until = Date.now() + FILE_LOCK_RETRY_MS

  while (Date.now() < until) {
    if (Date.now() >= until) return
  }
}

const lockIsStale = (path, now) => {
  try {
    return now - fs.statSync(path).mtimeMs >= FILE_LOCK_STALE_MS
  } catch {
    return false
  }
}

const removeStaleLock = (path, now) => {
  if (!lockIsStale(path, now)) return false

  try {
    fs.unlinkSync(path)
    return true
  } catch {
    return false
  }
}

const acquireLock = (path) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < FILE_LOCK_TIMEOUT_MS) {
    try {
      return fs.openSync(path, 'wx')
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error

      if (!removeStaleLock(path, Date.now())) waitForRetry()
    }
  }

  throw new Error(`Timed out waiting for file lock: ${path}`)
}

const readJsonFile = (path) => {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const readJsonSource = (path) => {
  try {
    const source = fs.readFileSync(path, 'utf8')

    return { source, value: JSON.parse(source) }
  } catch {
    return null
  }
}

const atomicReplace = (path, payload) => {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`

  try {
    fs.writeFileSync(tmp, payload)
    fs.renameSync(tmp, path)
  } catch (error) {
    try {
      fs.unlinkSync(tmp)
    } catch {}

    throw error
  }
}

const createBackupOnce = (path, source) => {
  try {
    fs.writeFileSync(path, source, { flag: 'wx' })
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }
}

export const migrateJsonFile = ({
  path,
  backupPath,
  migrate,
  transformRequest = (value) => value,
  needsMigration,
}) => {
  fs.mkdirSync(dirname(path), { recursive: true })

  const lockPath = lockPathFor(path)
  const lock = acquireLock(lockPath)

  try {
    const read = readJsonSource(path)

    if (!read) return null

    const next = migrate(read.value)

    if (!needsMigration(read.value)) return next

    const payload = JSON.stringify(transformRequest(next))
    const validated = migrate(JSON.parse(payload))
    const validatedPayload = JSON.stringify(transformRequest(validated))

    if (validatedPayload !== payload) {
      throw new Error(`Migration did not normalize idempotently: ${path}`)
    }

    if (backupPath) createBackupOnce(backupPath, read.source)
    atomicReplace(path, payload)

    return next
  } finally {
    fs.closeSync(lock)

    try {
      fs.unlinkSync(lockPath)
    } catch {}
  }
}

export const updateJsonFile = ({
  path,
  incoming,
  transformResponse,
  transformRequest,
  merge,
}) => {
  fs.mkdirSync(dirname(path), { recursive: true })

  const lockPath = lockPathFor(path)
  const lock = acquireLock(lockPath)
  let next

  try {
    const current = transformResponse(readJsonFile(path))

    next = merge(current, incoming)
    atomicReplace(path, JSON.stringify(transformRequest(next)))
  } finally {
    fs.closeSync(lock)

    try {
      fs.unlinkSync(lockPath)
    } catch {}
  }

  return next
}
