import { readFileSync, writeFileSync } from 'node:fs'
import { bundledDataFile } from '../src/paths.mjs'
import { buildProgressionData } from './progressionData.mjs'

const pokedex = JSON.parse(
  readFileSync(bundledDataFile('pokedex.json'), 'utf8'),
)
const output = buildProgressionData(pokedex)

writeFileSync(bundledDataFile('progression.json'), JSON.stringify(output))
console.log(
  `wrote progression.json: ${output.gyms.length} gyms, ${output.league.eliteFour.length} Elite Four, 1 Champion`,
)
