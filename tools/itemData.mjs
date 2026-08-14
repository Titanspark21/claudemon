import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { bundledDataFile } from '../src/paths.mjs'
import { loadGenerationSource } from './sourceManifest.mjs'

const normalize = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

export const itemKey = (name) =>
  String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const HELD_HANDLER_NAMES = new Set([
  'absorbbulb',
  'adamantorb',
  'adrenalineorb',
  'airballoon',
  'assaultvest',
  'berry',
  'berryjuice',
  'bigroot',
  'bindingband',
  'blackbelt',
  'blackglasses',
  'blacksludge',
  'brightpowder',
  'cellbattery',
  'charcoal',
  'choice',
  'damprock',
  'deepseascale',
  'deepseatooth',
  'destinyknot',
  'ejectbutton',
  'electricseed',
  'eviolite',
  'expertbelt',
  'flameorb',
  'floatstone',
  'focusband',
  'focussash',
  'fullincense',
  'grassyseed',
  'gripclaw',
  'griseousorb',
  'hardstone',
  'heatrock',
  'icyrock',
  'ironball',
  'kingsrock',
  'laggingtail',
  'laxincense',
  'leftovers',
  'lifeorb',
  'lightball',
  'lightclay',
  'luckypunch',
  'luminousmoss',
  'lustrousorb',
  'magnet',
  'mega-stone',
  'memory',
  'mentalherb',
  'metalcoat',
  'metalpowder',
  'metronome',
  'miracleseed',
  'mistyseed',
  'muscleband',
  'mysticwater',
  'nevermeltice',
  'normalgem',
  'oddincense',
  'poisonbarb',
  'powerherb',
  'primal-orb',
  'protectivepads',
  'psychicseed',
  'quickclaw',
  'quickpowder',
  'razorclaw',
  'razorfang',
  'redcard',
  'ringtarget',
  'rockincense',
  'rockyhelmet',
  'roseincense',
  'safetygoggles',
  'scopelens',
  'seaincense',
  'sharpbeak',
  'shedshell',
  'shellbell',
  'silkscarf',
  'silverpowder',
  'smoothrock',
  'snowball',
  'softsand',
  'souldew',
  'spelltag',
  'stick',
  'stickybarb',
  'terrainextender',
  'thickclub',
  'toxicorb',
  'twistedspoon',
  'type-plate',
  'waveincense',
  'weaknesspolicy',
  'whiteherb',
  'widelens',
  'wiseglasses',
  'zoomlens',
])

const CONSUMED_HANDLERS = new Set([
  'absorbbulb',
  'adrenalineorb',
  'berry',
  'berryjuice',
  'cellbattery',
  'ejectbutton',
  'electricseed',
  'focussash',
  'grassyseed',
  'luminousmoss',
  'mentalherb',
  'normalgem',
  'powerherb',
  'psychicseed',
  'redcard',
  'snowball',
  'weaknesspolicy',
  'whiteherb',
])

const coverageIndex = (coverage) =>
  new Map(
    Object.entries(coverage.items ?? {}).map(([key, entry]) => [
      normalize(key),
      entry,
    ]),
  )

const boostedType = (source) => {
  if (source.onPlate) return String(source.onPlate).toLowerCase()

  const text = source.shortDesc ?? source.desc ?? ''
  const match = text.match(
    /Holder's ([A-Za-z]+)-type attacks have [0-9.]+x power/i,
  )

  return match ? match[1].toLowerCase() : null
}

const resistedType = (source) => {
  const text = source.shortDesc ?? source.desc ?? ''
  const match = text.match(/supereffective ([A-Za-z]+)-type attack/i)

  return match ? match[1].toLowerCase() : null
}

const berryStatus = (sourceKey) =>
  ({
    cheriberry: 'paralysis',
    chestoberry: 'sleep',
    pechaberry: 'poison',
    rawstberry: 'burn',
    aspearberry: 'freeze',
    persimberry: 'confusion',
    lumberry: 'all',
  })[sourceKey] ?? null

const berryStat = (sourceKey) =>
  ({
    liechiberry: 'attack',
    ganlonberry: 'defense',
    salacberry: 'speed',
    petayaberry: 'spAttack',
    apicotberry: 'spDefense',
  })[sourceKey] ?? null

const terrainSeed = (sourceKey) =>
  ({
    electricseed: { terrain: 'electric', stat: 'defense' },
    grassyseed: { terrain: 'grassy', stat: 'defense' },
    mistyseed: { terrain: 'misty', stat: 'spDefense' },
    psychicseed: { terrain: 'psychic', stat: 'spDefense' },
  })[sourceKey] ?? null

const weatherRock = (sourceKey) =>
  ({
    damprock: 'rain',
    heatrock: 'sun',
    smoothrock: 'sandstorm',
    icyrock: 'hail',
  })[sourceKey] ?? null

const choiceStat = (sourceKey) =>
  ({
    choiceband: 'attack',
    choicespecs: 'spAttack',
    choicescarf: 'speed',
  })[sourceKey] ?? null

export const buildItemRecords = (sourceItems, coverage) => {
  const coverageByKey = coverageIndex(coverage)
  const records = {}

  for (const source of sourceItems) {
    const sourceKey = String(source.id)
    const key = itemKey(source.name)
    const classification = coverageByKey.get(normalize(sourceKey))

    if (!classification)
      throw new Error(`item ${sourceKey} has no coverage classification`)

    const handler = classification.handler ?? null
    const handlerName = handler?.startsWith('item:') ? handler.slice(5) : null
    const held =
      classification.status === 'supported' &&
      HELD_HANDLER_NAMES.has(handlerName)
    const description = source.shortDesc || source.desc || ''

    records[key] = {
      key,
      sourceKey,
      name: source.name,
      generation: source.gen ?? null,
      description,
      status: classification.status,
      handler,
      reason: classification.reason ?? null,
      held,
      consumed:
        held &&
        (Boolean(source.isBerry) ||
          CONSUMED_HANDLERS.has(handlerName) ||
          /single use/i.test(description)),
      berry: Boolean(source.isBerry),
      choice: Boolean(source.isChoice),
      boostType: boostedType(source),
      resistType: resistedType(source),
      cureStatus: berryStatus(sourceKey),
      boostStat: berryStat(sourceKey),
      terrainSeed: terrainSeed(sourceKey),
      weatherRock: weatherRock(sourceKey),
      choiceStat: choiceStat(sourceKey),
      megaStone: source.megaStone ?? null,
      megaEvolves:
        source.megaEvolves ?? Object.keys(source.megaStone ?? {})[0] ?? null,
      plateType: source.onPlate ? String(source.onPlate).toLowerCase() : null,
      driveType: source.onDrive ? String(source.onDrive).toLowerCase() : null,
      memoryType: source.onMemory
        ? String(source.onMemory).toLowerCase()
        : null,
      flingPower: source.fling?.basePower ?? null,
    }
  }

  return records
}

export const loadItemCoverage = () =>
  JSON.parse(readFileSync(bundledDataFile('mechanics-coverage.json'), 'utf8'))

export const generateItemData = () => {
  const source = loadGenerationSource(7)
  const records = buildItemRecords(source.items, loadItemCoverage())

  writeFileSync(bundledDataFile('items.json'), JSON.stringify(records))

  return records
}

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url

if (isMain) {
  const records = generateItemData()
  console.log(
    `Generated ${Object.keys(records).length} Generation VII item records.`,
  )
}
