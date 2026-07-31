// The only way a hook can report anything.
//
// Hooks run without a controlling terminal, and stdout is either injected into
// the model's context or shown to the user, so neither is available for a stack
// trace. Everything that goes wrong in a hook lands in ~/.claudemon/claudemon.log
// instead.

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { LOG_FILE } from './paths.mjs'

export function logError(where, error) {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true })
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${where} ${error?.stack || error}\n`)
  } catch {
    // Nothing left to try. Staying silent beats breaking the session.
  }
}
