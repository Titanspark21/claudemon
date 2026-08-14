export const BIOME_IDS = [
  'meadow',
  'forest',
  'wetlands',
  'coast',
  'highlands',
  'badlands',
  'frostlands',
  'city-powerworks',
  'mystic-ruins',
]

export const BIOME_NAMES = {
  meadow: 'Meadow',
  forest: 'Forest',
  wetlands: 'Wetlands',
  coast: 'Coast',
  highlands: 'Highlands',
  badlands: 'Badlands',
  frostlands: 'Frostlands',
  'city-powerworks': 'City & Powerworks',
  'mystic-ruins': 'Mystic Ruins',
}

export const BIOME_OVERRIDES = {
  ditto: {
    biomes: ['meadow', 'city-powerworks', 'mystic-ruins'],
    reason: 'generalist',
  },
  unown: { biomes: ['mystic-ruins'], reason: 'specialist' },
  rotom: { biomes: ['city-powerworks', 'mystic-ruins'], reason: 'identity' },
  sandshrewalola: { biomes: ['frostlands'], reason: 'regional form' },
  sandslashalola: { biomes: ['frostlands'], reason: 'regional form' },
  vulpixalola: {
    biomes: ['frostlands', 'mystic-ruins'],
    reason: 'regional form',
  },
  ninetalesalola: {
    biomes: ['frostlands', 'mystic-ruins'],
    reason: 'regional form',
  },
  meowthalola: { biomes: ['city-powerworks'], reason: 'regional form' },
  grimeralola: {
    biomes: ['city-powerworks', 'wetlands'],
    reason: 'regional form',
  },
  exeggutoralola: { biomes: ['coast', 'forest'], reason: 'regional form' },
  articuno: { biomes: ['frostlands', 'highlands'], reason: 'special overlay' },
  zapdos: {
    biomes: ['city-powerworks', 'highlands'],
    reason: 'special overlay',
  },
  moltres: { biomes: ['badlands', 'highlands'], reason: 'special overlay' },
  kyogre: { biomes: ['coast'], reason: 'special overlay' },
  groudon: { biomes: ['badlands'], reason: 'special overlay' },
  rayquaza: {
    biomes: ['highlands', 'mystic-ruins'],
    reason: 'special overlay',
  },
  meltan: { biomes: ['city-powerworks'], reason: 'special overlay' },
  melmetal: { biomes: ['city-powerworks'], reason: 'special overlay' },
}

export const overrideFor = (record, overrides = BIOME_OVERRIDES) =>
  overrides[record.sourceKey] ?? null
