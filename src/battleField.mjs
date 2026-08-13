import { FIELD_KINDS } from './constants.mjs'

export const createBattleField = () => ({
  weather: null,
  terrain: null,
})

export const normalizeBattleField = (field) => ({
  weather: field?.weather ?? null,
  terrain: field?.terrain ?? null,
})

export const replaceFieldEffect = (field, kind, value) => {
  if (!FIELD_KINDS.has(kind)) throw new Error(`Unknown field effect: ${kind}`)

  field[kind] = value ? { ...value } : null

  return field
}

const tickFieldEffect = (field, kind, events) => {
  const active = field[kind]

  if (!active) return

  active.turns--

  if (active.turns > 0) return

  events.push({ type: 'field-end', kind, key: active.key })
  replaceFieldEffect(field, kind, null)
}

export const tickFieldDurations = (field, events) => {
  tickFieldEffect(field, 'weather', events)
  tickFieldEffect(field, 'terrain', events)
}

const handleFieldDuration = ({ field, events }) => {
  tickFieldDurations(field, events)
}

export const fieldDurationHandler = {
  side: 'field',
  sourceType: 'field',
  key: 'field-duration',
  phase: 'endTurn',
  priority: -1000,
  handler: handleFieldDuration,
}
