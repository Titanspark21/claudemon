import { writeFileSync } from 'node:fs'
import { bundledDataFile } from '../src/paths.mjs'
import {
  generateSpeciesIdentityManifest,
  loadSpeciesIdentitySource,
} from './speciesIdentity.mjs'

const manifest = generateSpeciesIdentityManifest(loadSpeciesIdentitySource())

writeFileSync(
  bundledDataFile('form-ids.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
)

console.log(`Wrote ${manifest.records.length} species identities`)
