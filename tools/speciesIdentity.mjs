import { Dex, toID } from '@pkmn/dex'
import { loadGenerationSource } from './sourceManifest.mjs'

const NATIONAL_FIRST = 1
const NATIONAL_LAST = 809
const COLLECTIBLE_FIRST = 10001
const BATTLE_ONLY_FIRST = 20001

const byIdentity = (a, b) => a.id - b.id

const toSourceKey = (name) => toID(name)

const plain = (value) => JSON.parse(JSON.stringify(value))

const battleSignature = (record) => {
  return JSON.stringify({
    types: record.types,
    baseStats: record.baseStats,
    abilities: record.abilities,
    weightkg: record.weightkg,
  })
}

const isAlternate = (record) => record.name !== record.baseSpecies

const isBattleOnly = (record) => Boolean(record.battleOnly)

const isCosmeticOnly = (record) => record.num === 25

const isCollectible = (record, base) => {
  if (isBattleOnly(record) || isCosmeticOnly(record)) return false
  if (record.forme === 'Totem' || record.forme?.endsWith('-Totem')) return false

  return (
    battleSignature(record) !== battleSignature(base) ||
    Boolean(record.requiredItem) ||
    Boolean(record.changesFrom)
  )
}

const exclusionReason = (record) => {
  if (record.forme === 'Totem' || record.forme?.endsWith('-Totem'))
    return 'Totem presentation is not a player-owned species identity'
  if (isCosmeticOnly(record))
    return 'This alternate appearance does not create a collectible species identity'

  return 'Appearance differs without changing the Generation VII battle identity'
}

const recordFormKey = (record) => toID(record.forme)

const mapBaseIdentity = (record) => {
  return {
    id: record.num,
    sourceKey: record.id,
    name: record.name,
    dexNumber: record.num,
    baseSpecies: record.num,
    formKey: null,
    collectible: true,
    battleOnly: false,
    persistence: 'national',
  }
}

const mapFormIdentity = (record, id, collectible) => {
  return {
    id,
    sourceKey: record.id,
    name: record.name,
    dexNumber: record.num,
    baseSpecies: record.num,
    formKey: recordFormKey(record),
    collectible,
    battleOnly: !collectible,
    persistence: collectible ? 'form' : 'battle',
  }
}

const mapExclusion = (record) => {
  return {
    sourceKey: record.id,
    name: record.name,
    dexNumber: record.num,
    baseSpecies: record.num,
    formKey: recordFormKey(record),
    classification: 'cosmetic-only',
    reason: exclusionReason(record),
  }
}

const cosmeticExclusions = (baseRecords) => {
  return baseRecords.flatMap((record) => {
    return (record.cosmeticFormes ?? []).map((name) => {
      return {
        sourceKey: toSourceKey(name),
        name,
        dexNumber: record.num,
        baseSpecies: record.num,
        formKey: toID(name.replace(`${record.name}-`, '')),
        classification: 'cosmetic-only',
        reason:
          'Appearance differs without changing the Generation VII battle identity',
      }
    })
  })
}

const baseRecordMap = (records) => {
  return new Map(
    records
      .filter((record) => !isAlternate(record))
      .map((record) => [record.num, record]),
  )
}

const completeBaseRecords = (records) => {
  const byNumber = baseRecordMap(records)
  const dexByNumber = new Map(
    Dex.species
      .all()
      .filter((record) => !isAlternate(record))
      .map((record) => [record.num, record]),
  )

  for (let number = NATIONAL_FIRST; number <= NATIONAL_LAST; number++) {
    if (byNumber.has(number)) continue

    const record = plain(dexByNumber.get(number))

    if (!record || !record.exists || record.num !== number)
      throw new Error(`Missing National species source: ${number}`)

    byNumber.set(number, record)
  }

  return [...byNumber.values()].sort((a, b) => a.num - b.num)
}

const classifyAlternates = (records, bases) => {
  const collectible = []
  const battleOnly = []
  const exclusions = []

  for (const record of records.filter(isAlternate)) {
    const base = bases.get(record.num)

    if (!base) throw new Error(`Missing base record for ${record.name}`)

    if (isCollectible(record, base)) {
      collectible.push(record)
      continue
    }

    if (isBattleOnly(record)) {
      battleOnly.push(record)
      continue
    }

    exclusions.push(mapExclusion(record))
  }

  collectible.sort((a, b) => a.num - b.num || a.id.localeCompare(b.id))
  battleOnly.sort((a, b) => a.num - b.num || a.id.localeCompare(b.id))
  exclusions.sort(
    (a, b) =>
      a.dexNumber - b.dexNumber || a.sourceKey.localeCompare(b.sourceKey),
  )

  return { collectible, battleOnly, exclusions }
}

export const loadSpeciesIdentitySource = () => loadGenerationSource().species

export const generateSpeciesIdentityManifest = (sourceRecords) => {
  const source = sourceRecords.map(plain)
  const baseRecords = completeBaseRecords(source)
  const bases = baseRecordMap(baseRecords)
  const classified = classifyAlternates(source, bases)
  const baseIdentities = baseRecords.map(mapBaseIdentity)
  const collectible = classified.collectible.map((record, index) => {
    const reservedCosmeticSlots = record.num > 25 ? 1 : 0

    return mapFormIdentity(
      record,
      COLLECTIBLE_FIRST + index + reservedCosmeticSlots,
      true,
    )
  })
  const battleOnly = classified.battleOnly.map((record, index) => {
    return mapFormIdentity(record, BATTLE_ONLY_FIRST + index, false)
  })
  const exclusions = [
    ...classified.exclusions,
    ...cosmeticExclusions(baseRecords),
  ].sort(
    (a, b) =>
      a.dexNumber - b.dexNumber || a.sourceKey.localeCompare(b.sourceKey),
  )
  const manifest = {
    version: 1,
    nationalDex: { first: NATIONAL_FIRST, last: NATIONAL_LAST },
    ranges: {
      national: { first: NATIONAL_FIRST, last: NATIONAL_LAST },
      collectible: {
        first: COLLECTIBLE_FIRST,
        last: collectible.at(-1)?.id ?? COLLECTIBLE_FIRST - 1,
      },
      battleOnly: {
        first: BATTLE_ONLY_FIRST,
        last: BATTLE_ONLY_FIRST + battleOnly.length - 1,
      },
    },
    records: [...baseIdentities, ...collectible, ...battleOnly].sort(
      byIdentity,
    ),
    exclusions,
  }

  validateSpeciesIdentityManifest(manifest)

  return manifest
}

const validateRange = (record, range, label) => {
  if (record.id < range.first || record.id > range.last)
    throw new Error(`${label} identity outside reserved range: ${record.id}`)
}

export const validateSpeciesIdentityManifest = (manifest, previous = null) => {
  const ids = new Set()
  const keys = new Set()
  const bySource = new Map()

  if (previous) {
    const currentBySource = new Map(
      manifest.records.map((record) => [record.sourceKey, record]),
    )

    for (const record of previous.records) {
      const current = currentBySource.get(record.sourceKey)

      if (!current || current.id !== record.id)
        throw new Error(`Identity reassigned: ${record.sourceKey}`)
    }
  }

  for (const record of manifest.records) {
    if (ids.has(record.id)) throw new Error(`Identity collision: ${record.id}`)
    if (keys.has(record.sourceKey))
      throw new Error(`Source identity collision: ${record.sourceKey}`)

    ids.add(record.id)
    keys.add(record.sourceKey)
    bySource.set(record.sourceKey, record)

    if (record.formKey === null) {
      validateRange(record, manifest.ranges.national, 'National')
      if (
        record.baseSpecies !== record.id ||
        record.dexNumber !== record.id ||
        !record.collectible ||
        record.battleOnly ||
        record.persistence !== 'national'
      )
        throw new Error(`Invalid base relationship: ${record.sourceKey}`)
      continue
    }

    if (record.collectible === record.battleOnly)
      throw new Error(`Invalid form persistence: ${record.sourceKey}`)
    if (record.persistence !== (record.collectible ? 'form' : 'battle'))
      throw new Error(`Invalid form persistence: ${record.sourceKey}`)

    if (record.collectible)
      validateRange(record, manifest.ranges.collectible, 'Collectible')
    else validateRange(record, manifest.ranges.battleOnly, 'Battle-only')

    const base = manifest.records.find(
      (entry) => entry.id === record.baseSpecies,
    )

    if (!base || base.formKey !== null)
      throw new Error(`Missing base identity: ${record.baseSpecies}`)
    if (record.dexNumber !== base.dexNumber)
      throw new Error(`Invalid form relationship: ${record.sourceKey}`)
  }

  for (
    let number = manifest.nationalDex.first;
    number <= manifest.nationalDex.last;
    number++
  ) {
    const record = manifest.records.find((entry) => entry.id === number)

    if (!record || record.formKey !== null)
      throw new Error(`Missing base identity: ${number}`)
  }

  return manifest
}

export const createSpeciesIdentityIndex = (manifest) => {
  validateSpeciesIdentityManifest(manifest)

  const byId = new Map(manifest.records.map((record) => [record.id, record]))
  const bySource = new Map(
    manifest.records.map((record) => [record.sourceKey, record]),
  )

  const speciesRecord = (id) => {
    const record = byId.get(id)

    if (!record) throw new Error(`No species identity: ${id}`)

    return record
  }

  const sourceRecord = (sourceKey) => {
    const record = bySource.get(sourceKey)

    if (!record) throw new Error(`No source identity: ${sourceKey}`)

    return record
  }

  const baseSpeciesOf = (id) => speciesRecord(speciesRecord(id).baseSpecies)

  const formsOf = (baseSpecies) => {
    return manifest.records.filter((record) => {
      return record.baseSpecies === baseSpecies && record.formKey !== null
    })
  }

  const displayDexNumber = (id) => speciesRecord(id).dexNumber

  const dexEntryFor = (id) => {
    const record = speciesRecord(id)

    if (record.battleOnly)
      throw new Error(`Battle-only forms cannot be persisted: ${id}`)

    return {
      dexNumber: record.dexNumber,
      formId: record.formKey === null ? null : record.id,
    }
  }

  return {
    speciesRecord,
    sourceRecord,
    baseSpeciesOf,
    formsOf,
    displayDexNumber,
    dexEntryFor,
  }
}
