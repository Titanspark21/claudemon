export const createBattleField = () => ({
  weather: null,
  terrain: null,
})

export const normalizeBattleField = (field) => ({
  weather: field?.weather ?? null,
  terrain: field?.terrain ?? null,
})

export const replaceFieldEffect = (field, kind, value) => {
  if (kind !== 'weather' && kind !== 'terrain')
    throw new Error(`Unknown field effect: ${kind}`)

  field[kind] = value ? { ...value } : null

  return field
}
