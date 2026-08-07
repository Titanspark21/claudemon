import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { GYMS, TRAINER_CLASSES } from '../src/constants.mjs'
import { gymRoster } from '../src/gym.mjs'
import {
  SPRITES_DIR,
  TRAINER_SPRITES_DIR,
  spriteFile,
  trainerSpriteFile,
} from '../src/paths.mjs'
import { pool } from './pool.mjs'
import { progress } from './progress.mjs'
import {
  CONCURRENCY,
  KANTO,
  SPRITE_BASE_URL,
  SPRITE_MAX_ATTEMPTS,
  SPRITE_RETRY_BACKOFF_MS,
  TRAINER_SPRITE_BASE_URL,
} from './constants.mjs'

const SIDES = [
  { name: 'front', url: (id) => `${SPRITE_BASE_URL}/${id}.png` },
  { name: 'back', url: (id) => `${SPRITE_BASE_URL}/back/${id}.png` },
]

const pokemonJobs = (ids) => {
  return ids.flatMap((id) =>
    SIDES.map((side) => ({
      label: `${side.name}/${id}.png`,
      url: side.url(id),
      destination: spriteFile(side.name, id, 'png'),
    })),
  )
}

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
    url: `${TRAINER_SPRITE_BASE_URL}/${name}.png`,
    destination: trainerSpriteFile(name),
  }))
}

const download = async (url, destination) => {
  if (existsSync(destination) && statSync(destination).size > 0) return 'cached'

  for (let attempt = 1; attempt <= SPRITE_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url)

      if (!response.ok) {
        if (response.status === 404) return 'missing'

        throw new Error(`HTTP ${response.status}`)
      }

      writeFileSync(destination, Buffer.from(await response.arrayBuffer()))

      return 'fetched'
    } catch (error) {
      if (attempt === SPRITE_MAX_ATTEMPTS) throw error

      await new Promise((resolve) =>
        setTimeout(resolve, SPRITE_RETRY_BACKOFF_MS * attempt),
      )
    }
  }

  throw new Error(`${url}: gave up after ${SPRITE_MAX_ATTEMPTS} attempts`)
}

const main = async () => {
  const requested = process.argv.slice(2).map(Number).filter(Number.isInteger)
  const ids =
    requested.length > 0
      ? requested
      : Array.from({ length: KANTO }, (_, i) => i + 1)

  for (const side of SIDES)
    mkdirSync(join(SPRITES_DIR, side.name), { recursive: true })

  mkdirSync(TRAINER_SPRITES_DIR, { recursive: true })

  const jobs = [...pokemonJobs(ids), ...trainerJobs()]

  const counts = { fetched: 0, cached: 0, missing: 0 }
  let done = 0

  await pool(
    jobs,
    async (job) => {
      try {
        counts[await download(job.url, job.destination)]++
      } catch (error) {
        process.stderr.write(`\n  ${job.label} failed: ${error.message}\n`)
      }

      progress('sprites', ++done, jobs.length)
    },
    CONCURRENCY,
  )

  console.log(
    `  ${counts.fetched} downloaded, ${counts.cached} already present, ${counts.missing} not available`,
  )
  console.log(`  into ${SPRITES_DIR}`)
}

await main()
