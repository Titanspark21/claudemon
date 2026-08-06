import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { LOG_FILE } from './paths.mjs'

function append(line) {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true })
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`)
  } catch {}
}

export function logError(where, error) {
  append(`${where} ${error?.stack || error}`)
}

export function logNote(where, message) {
  append(`${where} ${message}`)
}
