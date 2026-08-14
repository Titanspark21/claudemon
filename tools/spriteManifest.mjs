const SHOWDOWN_SPRITE_BASE_URL = 'https://play.pokemonshowdown.com/sprites'
const POKEAPI_GEN5_BASE_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white'

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

export const SPRITE_SIDES = ['front', 'back']

const showdownDirectory = (side, shiny) => {
  if (side === 'front') return shiny ? 'gen5-shiny' : 'gen5'
  if (side === 'back') return shiny ? 'gen5-back-shiny' : 'gen5-back'

  throw new Error(`invalid sprite side: ${side}`)
}

const pokeApiDirectory = (side, shiny) => {
  const parts = []

  if (side === 'back') parts.push('back')
  else if (side !== 'front') throw new Error(`invalid sprite side: ${side}`)

  if (shiny) parts.push('shiny')

  return parts.length === 0 ? '' : `${parts.join('/')}/`
}

const formBaseSourceKey = (record) => {
  if (record.formKey === null || record.formKey === undefined)
    return record.sourceKey
  if (record.baseSourceKey) return record.baseSourceKey

  if (record.sourceKey.endsWith(record.formKey)) {
    const base = record.sourceKey.slice(0, -record.formKey.length)
    if (base) return base
  }

  throw new Error(`cannot derive sprite base slug for ${record.sourceKey}`)
}

export const showdownSpriteSlug = (record) => {
  if (record.formKey === null || record.formKey === undefined)
    return record.sourceKey

  return `${formBaseSourceKey(record)}-${record.formKey}`
}

export const spriteStorageKey = (record) => {
  if (!Number.isInteger(record.id) || record.id <= 0)
    throw new Error(`invalid sprite identity: ${record.id}`)

  return String(record.id)
}

export const spriteCandidates = (record, side, shiny = false) => {
  const slug = showdownSpriteSlug(record)
  const urls = [
    `${SHOWDOWN_SPRITE_BASE_URL}/${showdownDirectory(side, shiny)}/${slug}.png`,
  ]

  const isNationalBase =
    (record.formKey === null || record.formKey === undefined) &&
    record.id === record.dexNumber

  if (isNationalBase) {
    urls.push(
      `${POKEAPI_GEN5_BASE_URL}/${pokeApiDirectory(side, shiny)}${record.dexNumber}.png`,
    )
  }

  return [...new Set(urls.map((url) => new URL(url).href))]
}

const withBaseSourceKey = (record, byId) => {
  if (record.formKey === null || record.formKey === undefined) return record

  const base = byId.get(record.baseSpecies)
  if (!base)
    throw new Error(
      `missing base species ${record.baseSpecies} for ${record.sourceKey}`,
    )

  return { ...record, baseSourceKey: base.sourceKey }
}

export const buildSpriteManifest = (speciesRecords) => {
  const byId = new Map(speciesRecords.map((record) => [record.id, record]))
  const records = speciesRecords.map((record) =>
    withBaseSourceKey(record, byId),
  )
  const assets = []

  for (const record of records) {
    const storageKey = spriteStorageKey(record)

    for (const side of SPRITE_SIDES) {
      for (const shiny of [false, true]) {
        assets.push({
          id: record.id,
          sourceKey: record.sourceKey,
          storageKey,
          side,
          shiny,
          candidates: spriteCandidates(record, side, shiny),
          fallback: shiny ? 'ordinary' : 'unavailable-sprite',
        })
      }
    }
  }

  return { version: 1, records: speciesRecords.length, assets }
}

export const isPng = (value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)

  return (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  )
}
