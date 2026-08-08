export const POKEAPI_URL = 'https://pokeapi.co/api/v2'

export const CONCURRENCY = 8

export const KANTO = 151

export const VERSION_GROUP = 'red-blue'

export const OUTPUTS = [
  'pokedex.json',
  'moves.json',
  'types.json',
  'growth.json',
]

export const MIN_REQUEST_INTERVAL_MS = 150

export const MAX_ATTEMPTS = 5

export const THROTTLE_BACKOFF_MS = 2000

export const RETRY_BACKOFF_MS = 300

export const STAT_KEYS = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'spAttack',
  'special-defense': 'spDefense',
  speed: 'speed',
}

export const DATASET_READY_HEADING =
  '\nThe claudemon dataset is already built\n'

export const DATASET_BUILDING_HEADING = '\nBuilding the claudemon dataset\n'

export const SPRITE_BASE_URL =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white'

export const TRAINER_SPRITE_BASE_URL =
  'https://play.pokemonshowdown.com/sprites/trainers'

export const SPRITE_SIDES = ['front', 'back']

export const SPRITE_MAX_ATTEMPTS = 3

export const SPRITE_RETRY_BACKOFF_MS = 250

export const SPECIAL_DAMAGE_MOVES = new Set([
  'counter',
  'dragon-rage',
  'fissure',
  'guillotine',
  'horn-drill',
  'low-kick',
  'night-shade',
  'psywave',
  'seismic-toss',
  'sonic-boom',
  'super-fang',
])

export const DAMAGE_CLASSES = ['physical', 'special', 'status']

export const FAILURE_LIST_LIMIT = 40

export const BAR_WIDTH = 24

export const LABEL_WIDTH = 14

export const BAR_FILLED = '█'

export const BAR_EMPTY = '░'

export const PROBE_SPRITE_ID = 25

export const PROBE_RULE_WIDTH = 52

export const PROBE_LABEL_WIDTH = 16

export const GRADIENT_STEPS = 48

export const QUADRANT_SAMPLE = '  ▘ ▝ ▖ ▗ ▚ ▞ ▛ ▜ ▙ ▟'

export const PROBE_MESSAGES = {
  title: 'claudemon terminal probe',
  unset: '(unset)',
  truecolor: '1. Truecolor — should be one smooth gradient, no banding',
  quadrants:
    '2. Quadrant glyphs — should be ten solid corner shapes, not boxes',
  blockElements:
    '  These are Block Elements, so every monospace font has them.',
  oldFont: '  If any came out as a box, your font is older than Unicode 1.1.',
  spritesMissing: 'Sprites missing',
  native: '3. A sprite at native resolution — as good as it gets',
  fitted: '4. The same sprite at the size this window actually allows',
  tallerWindow: '  A taller window gets you closer to test 3.',
  heightBinds:
    'Height is what binds, not width: a canvas costs half as many rows as',
  tallerTab: 'columns, so a taller tab is what buys a sharper Pokemon.',
}

export const PREVIEW_COLS = 100

export const PREVIEW_ROWS = 34

export const PREVIEW_WORKED_MS = 41 * 60 * 60_000

export const PREVIEW_EARNED_AT = '2026-08-04T09:00:00.000Z'

export const PREVIEW_UPDATE_STEPS = [
  ['refreshing the marketplace', 'refreshed the marketplace'],
  ['fetching the new version', 'fetched the new version'],
  [
    'checking the command, status line and sprites',
    'the command, status line and sprites are up to date',
  ],
]
