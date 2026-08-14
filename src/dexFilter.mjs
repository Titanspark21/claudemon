export const DEFAULT_DEX_FILTER = Object.freeze({
  query: '',
  generation: null,
  type: null,
  biome: null,
  status: null,
  shiny: false,
  form: null,
})

const GENERATION_END = [151, 251, 386, 493, 649, 721, 809]

const normalizedText = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-US')

const normalizedKey = (value) => normalizedText(value).replace(/[\s_-]+/g, '-')

export const generationForDexNumber = (dexNumber) => {
  const number = Number(dexNumber)

  if (!Number.isInteger(number) || number < 1) return null

  const index = GENERATION_END.findIndex((end) => number <= end)

  return index < 0 ? null : index + 1
}

const matchesQuery = (entry, query) => {
  const raw = String(query ?? '').trim()

  if (!raw) return true

  if (/^\d+$/.test(raw)) {
    const number = Number(raw)

    return entry.id === number || entry.dexNumber === number
  }

  const needle = normalizedText(raw)
  const fields = [entry.name, entry.sourceKey, entry.formKey]

  return fields.some((field) => normalizedText(field).includes(needle))
}

const matchesStatus = (entry, status) => {
  if (!status) return true
  if (status === 'caught') return Boolean(entry.caught)
  if (status === 'seen') return Boolean(entry.seen) && !entry.caught
  if (status === 'unseen') return !entry.seen && !entry.caught

  return true
}

const matchesForm = (entry, form) => {
  if (!form) return true
  if (form === 'base') return entry.formKey == null
  if (form === 'forms' || form === 'form') return entry.formKey != null
  if (form === 'collectible')
    return entry.formKey != null && entry.collectible && !entry.battleOnly
  if (form === 'battle-only') return entry.formKey != null && entry.battleOnly

  return normalizedKey(entry.formKey) === normalizedKey(form)
}

const biomeKeys = (entry) =>
  (entry.biomes ?? []).map((biome) =>
    normalizedKey(
      typeof biome === 'string' ? biome : (biome?.id ?? biome?.biome),
    ),
  )

export const filterDex = (entries, filters = DEFAULT_DEX_FILTER) => {
  const generation =
    filters.generation == null ? null : Number(filters.generation)
  const type = filters.type == null ? null : normalizedKey(filters.type)
  const biome = filters.biome == null ? null : normalizedKey(filters.biome)

  return entries.filter((entry) => {
    if (!matchesQuery(entry, filters.query)) return false
    if (
      generation != null &&
      generationForDexNumber(
        entry.dexNumber ?? entry.baseSpecies ?? entry.id,
      ) !== generation
    )
      return false
    if (
      type &&
      !(entry.types ?? []).some(
        (candidate) => normalizedKey(candidate) === type,
      )
    )
      return false
    if (biome && !biomeKeys(entry).includes(biome)) return false
    if (!matchesStatus(entry, filters.status)) return false
    if (filters.shiny && !entry.shiny) return false
    if (!matchesForm(entry, filters.form)) return false

    return true
  })
}

export const nextDexFilter = (current = DEFAULT_DEX_FILTER, input = {}) => {
  if (input.reset) return { ...DEFAULT_DEX_FILTER }

  const field = input.field

  if (!(field in DEFAULT_DEX_FILTER))
    return { ...DEFAULT_DEX_FILTER, ...current }

  if (Object.hasOwn(input, 'value')) return { ...current, [field]: input.value }

  if (Array.isArray(input.values)) {
    const values = [null, ...input.values]
    const index = values.findIndex((value) => value === current[field])

    return { ...current, [field]: values[(index + 1) % values.length] }
  }

  if (field === 'shiny') return { ...current, shiny: !current.shiny }

  return { ...current }
}

const collectionIds = (value) => {
  if (Array.isArray(value)) return value
  if (value instanceof Set) return [...value]

  return []
}

const formCaughtIds = (save) => [
  ...collectionIds(save?.dex?.forms?.caught),
  ...collectionIds(save?.forms?.caught),
]

export const dexCompletion = (save, dataset) => {
  const base = dataset.filter(
    (entry) =>
      entry.formKey == null && Number(entry.dexNumber ?? entry.id) <= 809,
  )
  const forms = dataset.filter(
    (entry) => entry.formKey != null && entry.collectible && !entry.battleOnly,
  )
  const byId = new Map(dataset.map((entry) => [entry.id, entry]))
  const baseNumbers = new Set(base.map((entry) => entry.dexNumber ?? entry.id))
  const caughtIds = new Set(collectionIds(save?.dex?.caught))
  const nationalCaught = new Set()

  for (const id of caughtIds) {
    const entry = byId.get(id)
    const number = entry?.dexNumber ?? id

    if (baseNumbers.has(number)) nationalCaught.add(number)
  }

  const caughtForms = new Set(formCaughtIds(save))

  for (const id of caughtIds) {
    const entry = byId.get(id)

    if (entry?.formKey != null) caughtForms.add(id)
  }

  const collectibleFormIds = new Set(forms.map((entry) => entry.id))
  let formsCaught = 0

  for (const id of caughtForms) if (collectibleFormIds.has(id)) formsCaught++

  return {
    nationalCaught: nationalCaught.size,
    nationalTotal: baseNumbers.size,
    formsCaught,
    formsTotal: collectibleFormIds.size,
  }
}
