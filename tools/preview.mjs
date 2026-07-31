// Renders a screen to stdout without taking over the terminal.
//
// The companion is a full-screen application, which makes it awkward to inspect
// while building it. This drives the same view functions against a synthetic save
// and prints one frame.
//
//   node tools/preview.mjs                    every screen at 100x34
//   node tools/preview.mjs battle 120 44      one screen at a given size
//   NO_COLOR=1 node tools/preview.mjs dex     silhouettes instead of colour

import { createApp } from '../src/app.mjs'
import { createBattle } from '../src/battle.mjs'
import { DEFAULT_CONFIG } from '../src/config.mjs'
import { createPokemon } from '../src/pokemon.mjs'
import { makeRng } from '../src/rng.mjs'
import { addPokemon, createSave, markCaught, markSeen } from '../src/state.mjs'
import { bold, dim } from '../src/ui/ansi.mjs'

const [requested, colsArg, rowsArg] = process.argv.slice(2)
const cols = Number(colsArg) || 100
const rows = Number(rowsArg) || 34

/** A save part-way through a playthrough, so screens have something to show. */
function sampleSave() {
  const rng = makeRng(31337)
  const save = createSave({ trainer: 'Sergio', starterId: 4, rng })

  save.money = 5400
  save.bag = { 'poke-ball': 7, 'great-ball': 2, potion: 3, 'thunder-stone': 1 }

  // Built at the level we want rather than fed experience: bumping exp alone
  // would leave it with a level 5 moveset.
  save.party[0] = createPokemon(4, 12, rng)
  addPokemon(save, createPokemon(25, 12, rng))
  addPokemon(save, createPokemon(16, 9, rng))
  save.party[2].hp = Math.floor(save.party[2].stats.hp * 0.3)
  save.party[2].status = 'poison'

  for (const id of [10, 13, 19, 21, 41, 43, 74, 129, 133]) markSeen(save, id)
  return save
}

function makeApp(save) {
  const screen = {
    size: () => ({ cols, rows }),
    render: () => {},
    repaint: () => {},
    stop: () => {},
    onKey: () => {},
    onResize: () => {},
  }
  return createApp({ screen, save, config: { ...DEFAULT_CONFIG } })
}

function show(title, app) {
  process.stdout.write(`\n${bold(`── ${title} `)}${dim('─'.repeat(Math.max(0, cols - title.length - 4)))}\n`)
  const module = MODULES[app.mode]
  const { lines, overlays } = module.draw(app, { cols, rows })
  process.stdout.write(lines.join('\n') + '\n')

  // Overlays carry absolute positions in a full-screen frame. Here the frame is
  // just printed into the scrollback, so each one is replayed relative to the
  // bottom of it: save the cursor, go up and across, draw, come back.
  for (const overlay of overlays) {
    const up = lines.length - overlay.row + 1
    if (up < 1) continue
    process.stdout.write(`\x1b7\x1b[${up}A\r\x1b[${overlay.col - 1}C${overlay.sequence}\x1b8`)
  }
}

const MODULES = {
  starter: await import('../src/ui/views/starter.mjs'),
  home: await import('../src/ui/views/home.mjs'),
  battle: await import('../src/ui/views/battle.mjs'),
  dex: await import('../src/ui/views/dex.mjs'),
  team: await import('../src/ui/views/team.mjs'),
  shop: await import('../src/ui/views/shop.mjs'),
  options: await import('../src/ui/views/options.mjs'),
  update: await import('../src/ui/views/update.mjs'),
}

/**
 * An update part-way through, built by hand rather than started.
 *
 * The real one shells out to `claude plugin update`, which is not something a
 * preview should do to somebody's install.
 */
function updateRun({ state = 'running', at = 1, to = null } = {}) {
  const labels = [
    ['refreshing the marketplace', 'refreshed the marketplace'],
    ['fetching the new version', 'fetched the new version'],
    ['checking the command, status line and sprites', 'the command, status line and sprites are up to date'],
  ]
  return {
    kind: 'plugin',
    state,
    from: '0.5.0',
    to,
    steps: labels.map(([label, done], index) => ({
      id: String(index),
      label,
      done,
      status: state === 'done' ? 'ok' : index < at ? 'ok' : index === at ? 'running' : 'pending',
      detail: null,
    })),
  }
}

const scenes = {
  'starter-name': () => {
    const app = makeApp(null)
    app.mode = 'starter'
    app.setup = { step: 'name', name: 'Sergio', selection: 1, blink: true }
    return app
  },
  starter: () => {
    const app = makeApp(null)
    app.mode = 'starter'
    app.setup = { step: 'starter', name: 'Sergio', selection: 1, blink: true }
    return app
  },
  'home-quiet': () => {
    const app = makeApp(sampleSave())
    app.mode = 'home'
    return app
  },
  'home-working': () => {
    const app = makeApp(sampleSave())
    app.mode = 'home'
    app.activity = { state: 'working', tool: 'Bash', since: Date.now() - 74_000, sessions: 1 }
    // Part way across the field, so the walker is not against the edge.
    // CLAUDEMON_WALK_STEP steps through the walk a frame at a time.
    app.scene.step = Number(process.env.CLAUDEMON_WALK_STEP ?? 14)
    return app
  },
  'home-needed': () => {
    const app = makeApp(sampleSave())
    app.mode = 'home'
    app.activity = { state: 'waiting', tool: 'Bash', since: Date.now() - 9_000, sessions: 1 }
    return app
  },
  home: () => {
    const app = makeApp(sampleSave())
    app.mode = 'home'
    app.activity = { state: 'working', tool: 'Edit', since: Date.now() - 213_000, sessions: 2 }
    app.encounter = {
      species: 25, name: 'Pikachu', level: 11, seed: 1, expiresAt: Date.now() + 22_000,
    }
    return app
  },
  battle: () => {
    const app = makeApp(sampleSave())
    app.mode = 'battle'
    const wild = createPokemon(43, 12, makeRng(9))
    wild.hp = Math.floor(wild.stats.hp * 0.55)
    const state = createBattle({ playerMon: app.save.party[0], wildMon: wild, seed: 5 })
    app.battle = {
      state,
      menu: 'main', selection: 0, message: null, events: [],
      hp: { player: state.player.mon.hp, foe: state.foe.mon.hp },
      hpTarget: { player: state.player.mon.hp, foe: state.foe.mon.hp },
      effect: null,
      ball: null,
      postSteps: null, learnStep: null, bagItems: [],
    }
    return app
  },
  // The other half of the ball mark: the plain `battle` scene meets an Oddish the
  // sample save has only ever seen, so put the two side by side to check that the
  // mark is what changed and not the layout under it.
  'battle-caught': () => {
    const app = scenes.battle()
    markCaught(app.save, app.battle.state.foe.mon.species)
    return app
  },
  'battle-fight': () => {
    const app = scenes.battle()
    app.battle.menu = 'fight'
    app.battle.selection = 2
    return app
  },
  'battle-message': () => {
    const app = scenes.battle()
    app.battle.message = "It's super effective!"
    app.battle.events = [{ type: 'message', text: 'The wild ODDISH fainted!' }]
    return app
  },
  'battle-hit': () => {
    const app = scenes.battle()
    app.battle.message = 'CHARMANDER used Ember!'
    app.battle.menu = null
    // Mid-drain, which is what the frame timer produces between two beats.
    app.battle.effect = { side: 'foe', frame: Number(process.env.CLAUDEMON_HIT_FRAME ?? 2) }
    app.battle.hpTarget.foe = Math.floor(app.battle.hp.foe / 2)
    app.battle.hp.foe = Math.floor(app.battle.hp.foe * 0.8)
    return app
  },
  'battle-ball': () => {
    const app = scenes.battle()
    app.battle.message = 'You threw a Poké Ball!'
    app.battle.menu = null
    // A throw that shakes three times and fails, which is the longest one there
    // is. CLAUDEMON_BALL_FRAME steps through it a frame at a time.
    app.battle.ball = {
      shakes: 3,
      caught: false,
      frame: Number(process.env.CLAUDEMON_BALL_FRAME ?? 12),
      done: false,
    }
    return app
  },
  dex: () => {
    const app = makeApp(sampleSave())
    app.mode = 'dex'
    app.dexSelection = 24
    return app
  },
  team: () => {
    const app = makeApp(sampleSave())
    app.mode = 'team'
    app.teamSelection = 1
    return app
  },
  shop: () => {
    const app = makeApp(sampleSave())
    app.mode = 'shop'
    app.shopSelection = 2
    return app
  },
  options: () => {
    const app = makeApp(sampleSave())
    app.mode = 'options'
    return app
  },
  'home-update': () => {
    const app = makeApp(sampleSave())
    app.mode = 'home'
    app.activity = { state: 'idle', tool: null, since: Date.now() - 40_000, sessions: 1 }
    app.updateNotice = { kind: 'available', version: '0.6.0' }
    return app
  },
  update: () => {
    const app = makeApp(sampleSave())
    app.mode = 'update'
    app.update = updateRun({ at: Number(process.env.CLAUDEMON_UPDATE_STEP ?? 1) })
    app.updateFrame = Number(process.env.CLAUDEMON_SPIN_FRAME ?? 0)
    return app
  },
  'update-done': () => {
    const app = makeApp(sampleSave())
    app.mode = 'update'
    app.update = updateRun({ state: 'done', to: '0.6.0' })
    return app
  },
  'update-failed': () => {
    const app = makeApp(sampleSave())
    app.mode = 'update'
    const run = updateRun({ at: 1 })
    run.state = 'failed'
    run.steps[1].status = 'failed'
    run.steps[1].detail = 'no `claude` command found — is Claude Code on your PATH?'
    app.update = run
    return app
  },
}

const names = requested ? [requested] : Object.keys(scenes)
for (const name of names) {
  const build = scenes[name]
  if (!build) {
    process.stderr.write(`unknown screen "${name}". try: ${Object.keys(scenes).join(', ')}\n`)
    process.exit(1)
  }
  show(name, build())
}
process.stdout.write('\n')
