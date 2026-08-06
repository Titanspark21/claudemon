export const CRIT_CHANCE = 1 / 16
export const HIGH_CRIT_CHANCE = 1 / 8
export const SLEEP_WAKE_CHANCE = 1 / 3
export const THAW_CHANCE = 0.2
export const PARALYSIS_SKIP_CHANCE = 0.25
export const CRIT_MULTIPLIER = 1.5
export const STAB_MULTIPLIER = 1.5
export const STAGE_LIMIT = 6
export const STRUGGLE_RECOIL_FRACTION = 4
export const DAMAGE_VARIANCE = { min: 217, max: 255 }
export const POISON_FRACTIONS = { poison: 8, burn: 16 }
export const FALLBACK_POWER = { 'low-kick': 50 }
export const RUN_ODDS = { max: 0.95, speedFactor: 0.5, perAttempt: 0.15 }
export const FOE_AI_SCORES = { defaultPower: 40, status: 15 }
export const OHKO_MOVES = new Set(['guillotine', 'horn-drill', 'fissure'])

export const UNSUPPORTED_MOVES = new Set([
  'counter',
  'mirror-move',
  'metronome',
  'transform',
])

export const STRUGGLE = {
  move: 'struggle',
  data: {
    name: 'Struggle',
    type: 'normal',
    power: 50,
    accuracy: null,
    pp: 1,
    priority: 0,
    damageClass: 'physical',
    ailment: null,
    statChanges: [],
    critRate: 0,
  },
}

export const STATUS_LABELS = {
  burn: 'was burned',
  poison: 'was poisoned',
  paralysis: 'is paralysed',
  sleep: 'fell asleep',
  freeze: 'was frozen solid',
}

export const STAT_LABELS = {
  attack: 'Attack',
  defense: 'Defense',
  spAttack: 'Sp. Atk',
  spDefense: 'Sp. Def',
  speed: 'Speed',
  accuracy: 'accuracy',
  evasion: 'evasion',
}

export const AILMENT_IMMUNE_TYPES = {
  burn: ['fire'],
  poison: ['poison', 'steel'],
  freeze: ['ice'],
  paralysis: ['electric'],
}

export const TURN_MESSAGES = {
  noPp: 'No PP left for that move!',
  failed: 'But it failed!',
  oneHitKo: "It's a one-hit KO!",
  criticalHit: 'A critical hit!',
  gotAway: 'Got away safely!',
  stuck: "Couldn't get away!",
}

export const CATCH_COMPLAINTS = [
  'Oh no! The Pokemon broke free!',
  'Aargh! Almost had it!',
  'Aargh! Almost had it!',
  'Shoot! It was so close too!',
]

export const EFFECTIVENESS_MESSAGES = {
  immune: "It doesn't affect the foe...",
  superEffective: "It's super effective!",
  notVeryEffective: "It's not very effective...",
}

export const DEFAULT_CATCH_BONUS = 1

export const STATUS_CATCH_BONUS = {
  sleep: 2,
  freeze: 2,
  paralysis: 1.5,
  burn: 1.5,
  poison: 1.5,
}

export const BALLS = {
  'poke-ball': { name: 'Poké Ball', multiplier: 1 },
  'great-ball': { name: 'Great Ball', multiplier: 1.5 },
  'ultra-ball': { name: 'Ultra Ball', multiplier: 2 },
  'master-ball': { name: 'Master Ball', multiplier: 255 },
}

export const MAX_LEVEL = 100
export const MOVE_LIMIT = 4
export const IV_MAX = 31
export const EXP_DIVISOR = 7
export const MONEY_PER_LEVEL = 12
export const MONEY_JITTER_PER_LEVEL = 4

export const STAT_NAMES = [
  'hp',
  'attack',
  'defense',
  'spAttack',
  'spDefense',
  'speed',
]

export const PARTY_ITEM_KINDS = new Set(['heal', 'cure', 'revive', 'stone'])

export const ITEM_MESSAGES = {
  noSuchItem: 'No such item.',
  cannotAfford: "You can't afford that.",
  nothingHappened: 'Nothing happened.',
  faintedNoEffect: 'It had no effect on a fainted Pokémon.',
  noEffect: 'It would have no effect.',
  healthyAgain: 'It became healthy again.',
  revived: 'It was revived!',
}

export const ITEMS = {
  'poke-ball': {
    name: 'Poké Ball',
    kind: 'ball',
    price: 200,
    description: 'A basic ball.',
  },
  'great-ball': {
    name: 'Great Ball',
    kind: 'ball',
    price: 600,
    description: 'Catches better than a Poké Ball.',
  },
  'ultra-ball': {
    name: 'Ultra Ball',
    kind: 'ball',
    price: 1200,
    description: 'A high performance ball.',
  },
  'master-ball': {
    name: 'Master Ball',
    kind: 'ball',
    price: null,
    description: 'Never fails. Cannot be bought.',
  },

  potion: {
    name: 'Potion',
    kind: 'heal',
    heals: 20,
    price: 300,
    description: 'Restores 20 HP.',
  },
  'super-potion': {
    name: 'Super Potion',
    kind: 'heal',
    heals: 50,
    price: 700,
    description: 'Restores 50 HP.',
  },
  'hyper-potion': {
    name: 'Hyper Potion',
    kind: 'heal',
    heals: 200,
    price: 1200,
    description: 'Restores 200 HP.',
  },
  'full-restore': {
    name: 'Full Restore',
    kind: 'heal',
    heals: Infinity,
    cures: true,
    price: 3000,
    description: 'Fully restores HP and status.',
  },
  'full-heal': {
    name: 'Full Heal',
    kind: 'cure',
    price: 600,
    description: 'Cures any status condition.',
  },
  revive: {
    name: 'Revive',
    kind: 'revive',
    price: 1500,
    description: 'Revives a fainted Pokémon to half HP.',
  },

  'fire-stone': {
    name: 'Fire Stone',
    kind: 'stone',
    price: 2100,
    description: 'Evolves certain Pokémon.',
  },
  'water-stone': {
    name: 'Water Stone',
    kind: 'stone',
    price: 2100,
    description: 'Evolves certain Pokémon.',
  },
  'thunder-stone': {
    name: 'Thunder Stone',
    kind: 'stone',
    price: 2100,
    description: 'Evolves certain Pokémon.',
  },
  'leaf-stone': {
    name: 'Leaf Stone',
    kind: 'stone',
    price: 2100,
    description: 'Evolves certain Pokémon.',
  },
  'moon-stone': {
    name: 'Moon Stone',
    kind: 'stone',
    price: 2100,
    description: 'Evolves certain Pokémon.',
  },
}

export const SAVE_VERSION = 1
export const PARTY_LIMIT = 6
export const STARTER_LEVEL = 5
export const STARTING_MONEY = 3000
export const STARTERS = [1, 4, 7]
export const STARTING_BAG = { 'poke-ball': 5, potion: 3 }

export const EMPTY_STATS = {
  battles: 0,
  wins: 0,
  losses: 0,
  caught: 0,
  runs: 0,
}

export const STARTER_CAUGHT_COUNT = 1

export const SPRITE_SCALE_MIN = 0.4
export const SPRITE_SCALE_MAX = 1

export const DEFAULT_CONFIG = {
  encounterChance: 0.12,

  charsPerStep: 40,

  maxSteps: 4,

  workStepSeconds: 20,

  sound: true,

  bell: true,

  updateCheck: true,

  encounterTtlSeconds: 30,

  spriteScale: 1,

  wrappedStatusLine: null,

  probeRows: null,
}

export const STALE_MS = 30 * 60_000
export const PRUNE_MS = 24 * 60 * 60_000
export const WAITING_MESSAGE_LIMIT = 120
export const ACTIVITY_PRIORITY = ['waiting', 'working', 'idle']
export const ACTIVITY_VERSION = 1

export const LEGENDARY_LEVEL_GATE = 40
export const DEFAULT_CAPTURE_RATE = 45
export const STAGE_LEVEL_GATES = { 1: 16, 2: 32 }

export const WILD_LEVEL_SPREAD = {
  min: 2,
  fallbackMax: 5,
  below: 3,
  above: 2,
  ceiling: 100,
}

export const FALLBACK_SPECIES = [
  { id: 16, name: 'Pidgey', weight: 20 },
  { id: 19, name: 'Rattata', weight: 20 },
  { id: 10, name: 'Caterpie', weight: 14 },
  { id: 13, name: 'Weedle', weight: 14 },
  { id: 21, name: 'Spearow', weight: 12 },
  { id: 41, name: 'Zubat', weight: 12 },
  { id: 74, name: 'Geodude', weight: 10 },
  { id: 129, name: 'Magikarp', weight: 10 },
  { id: 43, name: 'Oddish', weight: 8 },
  { id: 69, name: 'Bellsprout', weight: 8 },
  { id: 46, name: 'Paras', weight: 7 },
  { id: 48, name: 'Venonat', weight: 7 },
  { id: 52, name: 'Meowth', weight: 6 },
  { id: 54, name: 'Psyduck', weight: 6 },
  { id: 60, name: 'Poliwag', weight: 6 },
  { id: 27, name: 'Sandshrew', weight: 5 },
  { id: 25, name: 'Pikachu', weight: 3 },
  { id: 133, name: 'Eevee', weight: 2 },
  { id: 143, name: 'Snorlax', weight: 1 },
]

export const SAMPLE_RATE = 22050
export const FADE_MS = 2
export const MIN_GAP_MS = 45
export const MAX_IN_FLIGHT = 3
export const MIN_LOOP_MS = 500
export const INT16_MAX = 32767
export const WAV_HEADER_BYTES = 44
export const WAV_RIFF_OVERHEAD_BYTES = 36
export const WAV_FMT_CHUNK_BYTES = 16
export const WAV_PCM_FORMAT = 1
export const WAV_CHANNELS = 1
export const WAV_BYTES_PER_SAMPLE = 2
export const WAV_BITS_PER_SAMPLE = 16

export const SOUNDS = {
  cursor: { gain: 0.16, notes: [{ hz: 1175, ms: 16 }] },

  select: {
    gain: 0.2,
    notes: [
      { hz: 880, ms: 22 },
      { hz: 1319, ms: 40 },
    ],
  },

  back: {
    gain: 0.16,
    notes: [
      { hz: 659, ms: 20 },
      { hz: 440, ms: 34 },
    ],
  },
}

export const HEARTBEAT_STALE_MS = 15_000

export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
export const FETCH_TIMEOUT_MS = 5000
export const UPDATE_DETAIL_LIMIT = 120

export const DEFAULT_MANIFEST_URL =
  'https://raw.githubusercontent.com/zamarrowski/claudemon/main/.claude-plugin/plugin.json'

export const UPDATE_STEP_TIMEOUTS = {
  pull: 60_000,
  install: 180_000,
  marketplace: 60_000,
  plugin: 120_000,
}

export const UPDATE_STEP_TEXT = {
  clonePull: {
    id: 'pull',
    label: 'pulling the latest commit',
    done: 'pulled the latest commit',
  },
  cloneInstall: {
    id: 'install',
    label: 'reinstalling from the clone',
    done: 'the command, status line and sprites are up to date',
  },
  marketplace: {
    id: 'marketplace',
    label: 'refreshing the marketplace',
    done: 'refreshed the marketplace',
  },
  plugin: {
    id: 'plugin',
    label: 'fetching the new version',
    done: 'fetched the new version',
  },
  pluginInstall: {
    id: 'install',
    label: 'checking the command, status line and sprites',
    done: 'the command, status line and sprites are up to date',
  },
}

export const UPDATE_FAILURE_MESSAGES = {
  noGit: 'no `git` command found',
  noClaude: 'no `claude` command found — is Claude Code on your PATH?',
  timedOut: 'it took too long and was given up on',
  unknown: 'it failed without saying why',
}

export const PNG_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

export const PNG_SIGNATURE_BYTES = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]

export const SHIM_MARKER = "Generated by claudemon's installer"
export const SHIM_APP_PATTERN = /^app="(.+)"$/m

export const MOVE_SLOTS_FULL_LINE = 'but it already knows four moves.'

export const HP_DRAIN_STEPS = 24
export const FRAMES_PER_STEP = 2
export const FRAMES_PER_SPIN = 3
export const BATTLE_ITEM_KINDS = new Set(['heal', 'cure', 'revive'])

export const HOME_NOTICES = {
  working: 'Not while Claude is working — rest when it does.',
  healed: 'Your team is back to full health.',
  wipedOut: 'Your whole team has fainted. Heal before heading out.',
}

export const BOX_MESSAGES = {
  lastOne: 'That is your last Pokémon — somebody has to fight.',
  teamFull: 'Your team is full. Send one to the box first.',
}

export const BAG_MESSAGES = {
  empty: 'Your bag is empty — the shop sells balls, potions and stones.',
  noRoomForMove: 'There was no room for it, so it kept the four it knows.',
}

export const BATTLE_MESSAGES = {
  noPp: 'There is no PP left for that move!',
  joinedTeam: 'It joined your team!',
  wentToBox: 'Your team was full, so it went to the box.',
  blackout: [
    'You have no Pokémon able to fight!',
    'You scurried back to safety...',
  ],
  noRest: 'There is no rest while Claude works — your team stays down.',
  forgetting: '1, 2 and... poof!',
}

export const HEARTBEAT_MS = 5000
export const POLL_MS = 2000
export const UPDATE_POLL_MS = 60_000
export const TICK_MS = 500
export const FRAME_MS = 60
export const DATASET_MISSING_MESSAGE = 'The Pokemon dataset is missing.'
export const DATASET_MISSING_HINT =
  'Run: node tools/fetch-data.mjs  (and node tools/fetch-sprites.mjs)'
