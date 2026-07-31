// The only way a hook can report anything.
//
// Hooks run without a controlling terminal, and stdout is either injected into
// the model's context or shown to the user, so neither is available for a stack
// trace. Everything a hook has to say lands in ~/.claudemon/claudemon.log instead.

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { LOG_FILE } from './paths.mjs'

function append(line) {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true })
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`)
  } catch {
    // Nothing left to try. Staying silent beats breaking the session.
  }
}

export function logError(where, error) {
  append(`${where} ${error?.stack || error}`)
}

/**
 * Something a hook did on its own that somebody might later want to account for.
 *
 * Not an error, so it does not pretend to be one — a hook that quietly rewrites a
 * file should leave a trace saying it did, and this is the only channel there is.
 */
export function logNote(where, message) {
  append(`${where} ${message}`)
}
