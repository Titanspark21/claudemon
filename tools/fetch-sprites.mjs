import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { GYMS, TRAINER_CLASSES } from '../src/constants.mjs'
import { gymRoster } from '../src/gym.mjs'
import {
  SPRITES_DIR,
  TRAINER_SPRITES_DIR,
  bundledDataFile,
  eggSpriteFile,
  spriteAssetFile,
  trainerSpriteFile,
} from '../src/paths.mjs'
import { pool } from './pool.mjs'
import { progress } from './progress.mjs'
import {
  CONCURRENCY,
  EGG_SPRITE_NAME,
  SPRITE_BASE_URL,
  SPRITE_MAX_ATTEMPTS,
  SPRITE_RETRY_BACKOFF_MS,
  TRAINER_SPRITE_BASE_URL,
} from './constants.mjs'
import {
  buildSpriteManifest,
  isPng,
  validateSpriteManifest,
} from './spriteManifest.mjs'

const spriteDestination = (asset) => spriteAssetFile(asset)

const pokemonJobs = (records, requested) => {
  const manifest = buildSpriteManifest(records)

  if (!validateSpriteManifest(manifest, records))
    throw new Error('generated sprite manifest is incomplete')

  const selected =
    requested.length === 0
      ? manifest.assets
      : manifest.assets.filter((asset) => requested.includes(asset.id))

  return selected.map((asset) => ({
    label: `${asset.sourceKey}/${asset.side}${asset.shiny ? '/shiny' : ''}`,
    candidates: asset.candidates,
    destination: spriteDestination(asset),
    fallback: asset.fallback,
    required: false,
  }))
}

const eggJob = () => ({
  label: 'front/egg.png',
  candidates: [`${SPRITE_BASE_URL}/${EGG_SPRITE_NAME}`],
  destination: eggSpriteFile(),
  required: true,
})

const trainerSpriteNames = () => {
  const fromClasses = TRAINER_CLASSES.flatMap((entry) => entry.sprites)
  const fromGyms = GYMS.flatMap((gym) =>
    gymRoster(gym).map((opponent) => opponent.sprite),
  )

  return [...new Set([...fromClasses, ...fromGyms])]
}

const trainerJobs = () => {
  return trainerSpriteNames().map((name) => ({
    label: `trainers/${name}.png`,
    candidates: [`${TRAINER_SPRITE_BASE_URL}/${name}.png`],
    destination: trainerSpriteFile(name),
    required: true,
  }))
}

const validCachedPng = (destination) => {
  if (!existsSync(destination) || statSync(destination).size === 0) return false

  try {
    return isPng(readFileSync(destination))
  } catch {
    return false
  }
}

const fetchPng = async (url) => {
  for (let attempt = 1; attempt <= SPRITE_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url)

      if (response.status === 404) return { status: 'missing' }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const bytes = Buffer.from(await response.arrayBuffer())
      if (!isPng(bytes)) throw new Error('response is not a PNG')

      return { status: 'fetched', bytes }
    } catch (error) {
      if (attempt === SPRITE_MAX_ATTEMPTS)
        return { status: 'failed', error: error.message }

      await new Promise((resolve) =>
        setTimeout(resolve, SPRITE_RETRY_BACKOFF_MS * attempt),
      )
    }
  }

  return { status: 'failed', error: 'retry loop ended unexpectedly' }
}

const download = async (job) => {
  if (validCachedPng(job.destination)) return { status: 'cached' }
  if (existsSync(job.destination)) unlinkSync(job.destination)

  const failures = []

  for (const url of job.candidates) {
    const result = await fetchPng(url)

    if (result.status === 'fetched') {
      writeFileSync(job.destination, result.bytes)
      return { status: 'fetched' }
    }

    if (result.status === 'failed') failures.push(`${url}: ${result.error}`)
  }

  if (failures.length > 0)
    return { status: 'unresolved', detail: failures.join('; ') }

  if (job.required)
    return { status: 'unresolved', detail: 'required sprite is not available' }

  return { status: 'unavailable', detail: `approved fallback: ${job.fallback}` }
}

const main = async () => {
  const requested = process.argv.slice(2).map(Number).filter(Number.isInteger)
  const identities = JSON.parse(
    readFileSync(bundledDataFile('form-ids.json'), 'utf8'),
  ).records

  for (const side of ['front', 'back'])
    mkdirSync(join(SPRITES_DIR, side, 'shiny'), { recursive: true })

  mkdirSync(TRAINER_SPRITES_DIR, { recursive: true })

  const jobs = [
    ...pokemonJobs(identities, requested),
    eggJob(),
    ...trainerJobs(),
  ]
  const counts = { fetched: 0, cached: 0, unavailable: 0, unresolved: 0 }
  const unresolved = []
  let done = 0

  await pool(
    jobs,
    async (job) => {
      const result = await download(job)
      counts[result.status]++

      if (result.status === 'unresolved')
        unresolved.push(`${job.label}: ${result.detail}`)

      progress('sprites', ++done, jobs.length)
    },
    CONCURRENCY,
  )

  console.log(
    `  ${counts.fetched} downloaded, ${counts.cached} already present, ${counts.unavailable} using approved fallback, ${counts.unresolved} unresolved`,
  )
  console.log(`  into ${SPRITES_DIR}`)

  if (unresolved.length > 0) {
    process.stderr.write('\nUnresolved sprite assets:\n')
    for (const failure of unresolved) process.stderr.write(`  - ${failure}\n`)
    process.exitCode = 1
  }
}

await main()
