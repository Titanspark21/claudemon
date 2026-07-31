// Drives the companion through real sequences of keypresses.
//
// The engine tests prove the rules; these prove the wiring. Everything here goes
// through app.handleKey, exactly as a keyboard would, against a throwaway save.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const sandbox = mkdtempSync(join(tmpdir(), 'claudemon-app-'))
const realData = join(process.env.CLAUDEMON_HOME || join(homedir(), '.claudemon'), 'data')
if (existsSync(realData)) symlinkSync(realData, join(sandbox, 'data'))
process.env.CLAUDEMON_HOME = sandbox

const { createApp } = await import('../src/app.mjs')
const { endSession, writeActivity } = await import('../src/activity.mjs')
const { DEFAULT_CONFIG, loadConfig, spriteScale } = await import('../src/config.mjs')
const { isDataReady } = await import('../src/data.mjs')
const { clearEncounter, peekQueue, writeEncounter } = await import('../src/queue.mjs')
const { loadSave } = await import('../src/state.mjs')
const { createPokemon, levelOf, makeMoveSlot } = await import('../src/pokemon.mjs')
const { ballsInBag, countOf } = await import('../src/shop.mjs')
const { HIT_FRAMES } = await import('../src/ui/views/battle.mjs')
const { SETTINGS } = await import('../src/ui/views/options.mjs')
const homeView = await import('../src/ui/views/home.mjs')
const { makeRng } = await import('../src/rng.mjs')
const { VERSION } = await import('../src/version.mjs')

if (!isDataReady()) throw new Error('dataset missing — run: node tools/fetch-data.mjs')

function stubScreen() {
  let frames = 0
  let bells = 0
  return {
    size: () => ({ cols: 100, rows: 34 }),
    render: () => { frames++ },
    repaint: () => {},
    stop: () => {},
    onKey: () => {},
    onResize: () => {},
    bell: () => { bells++ },
    frameCount: () => frames,
    bellCount: () => bells,
  }
}

function newApp(save = null, options = {}) {
  return createApp({
    screen: stubScreen(),
    save,
    config: { ...DEFAULT_CONFIG },
    ...options,
  })
}

const press = (app, name, char) => app.handleKey({ name, char })

/** Puts the OPTION cursor on a setting by key, however many rows down it now is. */
const openSetting = (app, key) => {
  const index = SETTINGS.findIndex((setting) => setting.key === key)
  assert.ok(index >= 0, `no such setting: ${key}`)
  for (let i = 0; i < index; i++) press(app, 'down')
}
const type = (app, text) => {
  for (const char of text) press(app, char, char)
}

/** Dismisses messages until the game wants input again. Bounded, so a stuck
 *  message queue fails the test instead of hanging it. */
function clearMessages(app, limit = 200) {
  let steps = 0
  while (app.mode === 'battle' && app.battle?.message && steps++ < limit) {
    press(app, 'enter')
  }
  assert.ok(steps < limit, 'messages never stopped')
}

// --- First run ---------------------------------------------------------------

test('a first run asks for a name and a starter, then has a save', () => {
  const app = newApp(null)
  assert.equal(app.mode, 'starter')
  assert.equal(app.setup.step, 'name')

  type(app, 'Ash')
  assert.equal(app.setup.name, 'Ash')

  press(app, 'backspace')
  type(app, 'h')
  assert.equal(app.setup.name, 'Ash')

  press(app, 'enter')
  assert.equal(app.setup.step, 'starter')

  // Arrow across to Squirtle and take it.
  press(app, 'right')
  press(app, 'enter')

  assert.equal(app.mode, 'home')
  assert.ok(app.save, 'a save should exist now')
  assert.equal(app.save.trainer.name, 'Ash')
  assert.equal(app.save.party.length, 1)
  assert.equal(app.save.party[0].species, 7, 'Squirtle')
  assert.ok(loadSave(), 'and it should be on disk')
})

test('an empty name is not accepted', () => {
  const app = newApp(null)
  press(app, 'enter')
  assert.equal(app.setup.step, 'name', 'should still be asking')
})

test('arrow keys never end up in the name', () => {
  const app = newApp(null)
  type(app, 'Bo')
  press(app, 'up')
  press(app, 'left')
  assert.equal(app.setup.name, 'Bo')
})

// --- Encounters and battle ---------------------------------------------------

function startedGame(options = {}) {
  const app = newApp(null, options)
  type(app, 'Red')
  press(app, 'enter')
  press(app, 'enter') // Charmander, the middle option
  return app
}

function queueEncounter(app, { species = 16, name = 'Pidgey', level = 3, seed = 99, at } = {}) {
  writeEncounter({ v: 1, species, name, level, seed, ...(at ? { at } : {}) })
  app.pump()
}

/** An encounter stamped as having appeared `seconds` ago. */
function agedEncounter(app, seconds, options = {}) {
  queueEncounter(app, { ...options, at: new Date(Date.now() - seconds * 1000).toISOString() })
}

test('an encounter reaches the home screen and can be entered', () => {
  const app = startedGame()
  queueEncounter(app)

  assert.ok(app.encounter, 'one is in the grass')
  assert.ok(app.save.dex.seen.includes(16), 'meeting one counts as seeing it')

  // FIGHT is first in the menu whenever something is waiting.
  press(app, 'enter')
  assert.equal(app.mode, 'battle')
  assert.ok(app.battle, 'a battle should be running')
  assert.equal(app.encounter, null, 'facing it consumes it')
})

test('facing an encounter empties the slot, so it is never replayed', () => {
  const app = startedGame()
  queueEncounter(app)
  assert.equal(peekQueue().length, 1, 'it stays in the file until you face it')

  press(app, 'enter')
  assert.deepEqual(peekQueue(), [], 'and the slot is free again once you do')
})

// --- One at a time, and not for long -------------------------------------------

test('rereading the slot does not keep meeting the same Pokemon', () => {
  const app = startedGame()
  queueEncounter(app)
  const held = app.encounter

  assert.equal(app.pump(), false, 'nothing has changed')
  assert.equal(app.encounter, held, 'and the same encounter is still on screen')
})

test('an encounter nobody faced disappears once its window closes', () => {
  const app = startedGame()
  agedEncounter(app, 5)
  assert.ok(app.encounter, 'five seconds in, it is still there')

  agedEncounter(app, 31, { seed: 41 })
  assert.equal(app.encounter, null, 'thirty-one seconds in, it has wandered off')
  assert.equal(homeView.menuItems(app)[0].id, 'dex', 'and FIGHT has left the menu')
})

test('an encounter timing out leaves the cursor on the entry it was on', () => {
  const app = startedGame()
  queueEncounter(app)
  assert.equal(app.homeSelection, 0, 'the cursor starts on FIGHT')

  // Over to HEAL, four entries along the six-item menu.
  for (let step = 0; step < 4; step++) press(app, 'right')
  assert.equal(homeView.menuItems(app)[app.homeSelection].id, 'heal')

  clearEncounter()
  app.pump()

  const items = homeView.menuItems(app)
  assert.ok(app.homeSelection < items.length, 'the cursor is still inside the menu')
  assert.equal(items[app.homeSelection].id, 'heal', 'and still on the same entry')

  press(app, 'enter')
  assert.equal(app.mode, 'home', 'there was nothing to fight, so HEAL is what ran')
  assert.match(app.notice, /full health/i)
})

test('a cursor left past the end of the menu cannot fall off it', () => {
  const app = startedGame()
  // Whatever else went wrong, a key must never reach for an entry that is not
  // there: the menu can shrink between two keypresses.
  app.homeSelection = 12
  press(app, 'left')
  assert.ok(app.homeSelection < homeView.menuItems(app).length)
})

test('the countdown says how long is left, and never goes negative', () => {
  const app = startedGame()
  agedEncounter(app, 8)
  assert.match(homeView.countdownRow(app.encounter), /in 2[12]s/)

  assert.match(homeView.countdownRow({ expiresAt: Date.now() - 5_000 }), /in 0s/)
})

test('a battle can be fought to the end and returns you home', () => {
  const app = startedGame()
  // A level 2 Caterpie against a level 5 starter: this should be winnable.
  queueEncounter(app, { species: 10, name: 'Caterpie', level: 2, seed: 7 })

  press(app, 'enter')
  clearMessages(app)

  let guard = 0
  while (app.mode === 'battle' && guard++ < 60) {
    // FIGHT, then the first move.
    if (app.battle.menu === 'main') {
      app.battle.selection = 0
      press(app, 'enter')
    } else if (app.battle.menu === 'fight') {
      app.battle.selection = 0
      press(app, 'enter')
    } else if (app.battle.message) {
      press(app, 'enter')
    } else {
      press(app, 'escape')
    }
  }

  assert.ok(guard < 60, 'the battle should have ended')
  assert.equal(app.mode, 'home')
  assert.equal(app.battle, null)
  assert.equal(app.save.stats.battles, 1)
  assert.ok(loadSave().stats.battles === 1, 'and it should be saved')
})

test('a Master Ball catch adds the Pokemon and closes the battle', () => {
  const app = startedGame()
  app.save.bag['master-ball'] = 1
  queueEncounter(app, { species: 25, name: 'Pikachu', level: 6, seed: 5 })

  press(app, 'enter')
  clearMessages(app)

  // Main menu -> BAG
  app.battle.selection = 1
  press(app, 'enter')
  assert.equal(app.battle.menu, 'bag')

  // Pick the Master Ball out of the list.
  const index = app.battle.bagItems.indexOf('master-ball')
  assert.notEqual(index, -1, 'the Master Ball should be offered')
  app.battle.selection = index
  press(app, 'enter')

  let guard = 0
  while (app.mode === 'battle' && guard++ < 40) press(app, 'enter')

  assert.equal(app.mode, 'home')
  assert.ok(app.save.dex.caught.includes(25), 'Pikachu should be in the Pokedex')
  assert.ok(
    app.save.party.some((mon) => mon.species === 25),
    'and on the team',
  )
})

test('running away ends the battle without a catch', () => {
  const app = startedGame()
  queueEncounter(app, { species: 10, name: 'Caterpie', level: 2, seed: 3 })

  press(app, 'enter')
  clearMessages(app)

  let guard = 0
  while (app.mode === 'battle' && guard++ < 40) {
    if (app.battle.message) press(app, 'enter')
    else {
      app.battle.menu = 'main'
      app.battle.selection = 3 // RUN
      press(app, 'enter')
    }
  }

  assert.equal(app.mode, 'home')
  assert.ok(!app.save.dex.caught.includes(10))
})

test('a Pokemon that was swapped out still earns the experience', () => {
  const app = startedGame()
  const starter = app.save.party[0]
  // Strong enough to end the fight on its first turn, so the win is not in doubt.
  const backup = createPokemon(25, 20, makeRng(1))
  backup.moves = [makeMoveSlot('thunder-shock')]
  app.save.party.push(backup)

  queueEncounter(app, { species: 10, name: 'Caterpie', level: 2, seed: 7 })
  press(app, 'enter')
  clearMessages(app)

  const before = { starter: starter.exp, backup: backup.exp }

  // POKÉMON is the third entry on the main menu, and the backup is second in the party.
  app.battle.selection = 2
  press(app, 'enter')
  assert.equal(app.battle.menu, 'party')
  app.battle.selection = 1
  press(app, 'enter')
  clearMessages(app)

  assert.equal(app.battle.state.player.mon, backup, 'the backup is the one out there now')
  assert.equal(starter.exp, before.starter, 'nothing is paid out mid-battle')

  let guard = 0
  while (app.mode === 'battle' && guard++ < 60) {
    if (app.battle.message) press(app, 'enter')
    else if (app.battle.menu === 'fight') {
      app.battle.selection = 0
      press(app, 'enter')
    } else {
      app.battle.menu = 'main'
      app.battle.selection = 0 // FIGHT
      press(app, 'enter')
    }
  }

  assert.ok(guard < 60, 'the battle should have ended')
  assert.ok(backup.exp > before.backup, 'the one that finished it earns')
  assert.ok(starter.exp > before.starter, 'and so does the one that opened it')
  assert.equal(
    starter.exp - before.starter,
    backup.exp - before.backup,
    'the full amount each, not a share',
  )
})

test('a battle cannot start with a fainted team', () => {
  const app = startedGame()
  for (const mon of app.save.party) mon.hp = 0

  queueEncounter(app)
  press(app, 'enter')

  assert.equal(app.mode, 'home', 'should refuse and stay put')
  assert.ok(app.encounter, 'the encounter is still there, for what is left of its window')
  assert.match(app.notice, /fainted/i)
})

// --- Battle pacing and the hit effect ------------------------------------------

/**
 * A fixed duel: a level 10 Charmander against a level 12 Caterpie on seed 7.
 * Chosen because the player strikes first and neither side faints on the opening
 * turn, so a whole turn's worth of beats is there to step through.
 */
function duel(app) {
  app.save.party[0] = createPokemon(4, 10, makeRng(11))
  queueEncounter(app, { species: 10, name: 'Caterpie', level: 12, seed: 7 })
  press(app, 'enter')
  clearMessages(app)
  return app.battle
}

/** FIGHT is the first option, and its first move is already under the cursor. */
function attack(app) {
  press(app, 'enter')
  press(app, 'enter')
}

test('a turn is played out one blow at a time', () => {
  const app = startedGame()
  const battle = duel(app)

  const foeMax = battle.state.foe.mon.stats.hp
  const playerHp = battle.hp.player
  assert.equal(battle.hp.foe, foeMax, 'nothing has happened yet')

  attack(app)

  // The engine resolved both moves before it returned...
  assert.ok(battle.state.player.mon.hp < playerHp, 'the foe has already hit back, in the state')

  // ...but only the blow the current message describes has reached the bars.
  assert.ok(battle.hpTarget.foe < foeMax, 'the foe is taking the hit being announced')
  assert.equal(battle.hpTarget.player, playerHp, 'and its reply has not been shown yet')

  let guard = 0
  while (battle.hpTarget.player === playerHp && guard++ < 20) press(app, 'enter')

  assert.ok(guard < 20, "the foe's blow should land on a later beat")
  assert.equal(battle.hpTarget.player, battle.state.player.mon.hp)
})

test('taking a hit puts the effect on whoever took it', () => {
  const app = startedGame()
  const battle = duel(app)
  assert.equal(battle.effect, null, 'nothing is being hit yet')

  attack(app)
  assert.deepEqual(battle.effect, { side: 'foe', frame: 0 })

  let guard = 0
  while (battle.effect?.side !== 'player' && guard++ < 20) press(app, 'enter')
  assert.equal(battle.effect?.side, 'player', 'and it moves to you when the foe hits back')
})

test('the hit effect runs out on its own', () => {
  const app = startedGame()
  const battle = duel(app)
  attack(app)

  for (let frame = 0; frame < HIT_FRAMES.length; frame++) {
    assert.ok(battle.effect, `frame ${frame} should still be on screen`)
    app.tickBattle()
  }
  assert.equal(battle.effect, null)
})

test('a bar drains towards where the turn left it', () => {
  const app = startedGame()
  const battle = duel(app)
  attack(app)

  const target = battle.hpTarget.foe
  assert.ok(battle.hp.foe > target, 'it starts from where the bar was')

  let guard = 0
  while (battle.hp.foe !== target && guard++ < 200) app.tickBattle()

  assert.ok(guard < 200, 'it should settle')
  assert.ok(guard > 1, 'and take more than one frame getting there')
  assert.equal(battle.hp.foe, target)
})

test('the bars tell the truth again by the time you choose', () => {
  const app = startedGame()
  const battle = duel(app)
  attack(app)

  let guard = 0
  while (battle.menu !== 'main' && guard++ < 30) press(app, 'enter')

  assert.ok(guard < 30, 'the turn should hand the menu back')
  assert.equal(battle.hp.foe, battle.state.foe.mon.hp)
  assert.equal(battle.hp.player, battle.state.player.mon.hp)
})

test('a potion fills the bar rather than jumping it', () => {
  const app = startedGame()
  const battle = duel(app)
  battle.state.player.mon.hp = 5

  battle.selection = 1 // BAG
  press(app, 'enter')
  assert.equal(battle.menu, 'bag')
  assert.equal(battle.hp.player, 5, 'opening a menu catches the bar up')

  const index = battle.bagItems.indexOf('potion')
  assert.notEqual(index, -1, 'a potion should be offered')
  battle.selection = index
  press(app, 'enter')

  let guard = 0
  while (battle.hpTarget.player === 5 && guard++ < 10) press(app, 'enter')

  assert.ok(guard < 10, 'the heal should reach the bar')
  assert.ok(battle.hpTarget.player > battle.hp.player, 'as something to animate towards')
})

test('the frame timer does nothing outside a battle', () => {
  assert.equal(startedGame().tickBattle(), false)
})

// --- The ball throw ------------------------------------------------------------

/** Puts balls in the bag and throws one, through the menus a player would use. */
function throwBall(app, key, count = 1) {
  app.save.bag[key] = count

  app.battle.selection = 1 // BAG
  press(app, 'enter')
  assert.equal(app.battle.menu, 'bag')

  const index = app.battle.bagItems.indexOf(key)
  assert.notEqual(index, -1, `${key} should be offered`)
  app.battle.selection = index
  press(app, 'enter')
}

/** Runs the frame timer until the throw is over, or fails rather than hanging. */
function playThrow(app) {
  let frames = 0
  while (app.battle?.ball && !app.battle.ball.done && frames++ < 200) app.tickBattle()
  assert.ok(frames < 200, 'the throw should end on its own')
  return frames
}

test('a thrown ball is animated instead of just announced', () => {
  const app = startedGame()
  const battle = duel(app)

  throwBall(app, 'poke-ball')

  assert.match(battle.message, /threw a Poké Ball/i)
  // Seed 7 against a full-health Caterpie: it shakes twice and breaks out.
  assert.deepEqual(battle.ball, { shakes: 2, caught: false, frame: 0, done: false })
})

test('the throw plays out on the frame timer and then reads the result', () => {
  const app = startedGame()
  const battle = duel(app)
  throwBall(app, 'poke-ball')

  const thrown = battle.message
  const frames = playThrow(app)

  assert.ok(frames > 10, 'a throw is worth more than a frame or two')
  assert.equal(battle.ball, null, 'the ball opened and went away')
  assert.match(battle.message, /almost had it/i, 'and the verdict followed on its own')
  assert.notEqual(battle.message, thrown)
})

test('a key gets past the throw rather than being swallowed by it', () => {
  const app = startedGame()
  const battle = duel(app)
  throwBall(app, 'poke-ball')
  const thrown = battle.message

  press(app, 'enter')
  assert.equal(battle.ball, null, 'the first key ends the throw')
  assert.equal(battle.message, thrown, 'without skipping what it was saying')

  press(app, 'enter')
  assert.notEqual(battle.message, thrown, 'and the next one reads on')
})

test('a ball that holds stays shut, and stops costing frames', () => {
  const app = startedGame()
  const battle = duel(app)
  throwBall(app, 'master-ball')

  assert.equal(battle.ball.caught, true, 'a Master Ball never fails')
  playThrow(app)

  assert.ok(battle.ball?.done, 'the ball is still lying there with the Caterpie in it')
  assert.equal(app.tickBattle(), false, 'and there is nothing left to animate')
  assert.match(battle.message, /caught/i)
})

test('a thrown ball is spent, whether it holds or not', () => {
  const app = startedGame()
  duel(app)

  throwBall(app, 'poke-ball', 2)
  assert.equal(countOf(app.save, 'poke-ball'), 1, 'the one in the air is out of the bag')
})

test('the last ball leaves the bag, so a Master Ball is not a Pokedex', () => {
  const app = startedGame()
  duel(app)
  app.save.bag = { potion: 1 }

  throwBall(app, 'master-ball')

  assert.equal(countOf(app.save, 'master-ball'), 0)
  assert.deepEqual(ballsInBag(app.save), [], 'nothing left to throw')
})

test('mashing through a throw still ends the battle', () => {
  const app = startedGame()
  const battle = duel(app)
  throwBall(app, 'master-ball')

  let guard = 0
  while (app.mode === 'battle' && guard++ < 40) press(app, 'enter')

  assert.ok(guard < 40, 'a throw is skippable, not a wall')
  assert.equal(app.mode, 'home')
  assert.ok(app.save.dex.caught.includes(battle.state.foe.mon.species))
})

// --- Claude's activity --------------------------------------------------------

function reportSession(state, extra = {}) {
  const now = Date.now()
  writeActivity({ v: 1, session: 'test-session', state, tool: null, since: now, at: now, ...extra })
}

test('the companion picks up what Claude Code is doing', () => {
  const app = startedGame()
  assert.equal(app.activity.state, 'unknown', 'nothing is reporting yet')

  reportSession('working', { tool: 'Bash' })
  assert.equal(app.refreshActivity(), true, 'the row would read differently now')
  assert.equal(app.activity.state, 'working')
  assert.equal(app.activity.tool, 'Bash')

  assert.equal(app.refreshActivity(), false, 'and nothing changed the second time')
  endSession('test-session')
})

test('the companion rings when Claude hands the keyboard back', () => {
  const app = startedGame()

  reportSession('working', { tool: 'Bash' })
  app.refreshActivity()
  assert.equal(app.screen.bellCount(), 0, 'starting work is not worth a bell')

  reportSession('idle')
  app.refreshActivity()
  assert.equal(app.screen.bellCount(), 1, 'finishing is')

  // Going quiet and staying quiet must not ring again.
  app.refreshActivity()
  assert.equal(app.screen.bellCount(), 1)

  reportSession('working', { tool: 'Edit' })
  app.refreshActivity()
  reportSession('waiting')
  app.refreshActivity()
  assert.equal(app.screen.bellCount(), 2, 'and so is being blocked on you')

  endSession('test-session')
})

test('the bell can be turned off', () => {
  const app = createApp({
    screen: stubScreen(),
    save: null,
    config: { ...DEFAULT_CONFIG, bell: false },
  })

  reportSession('working')
  app.refreshActivity()
  reportSession('idle')
  app.refreshActivity()

  assert.equal(app.screen.bellCount(), 0)
  endSession('test-session')
})

// --- Walking through the grass ------------------------------------------------

/** Runs the frame timer, and reports how many frames moved the walk on. */
function runFrames(app, count) {
  let moved = 0
  for (let frame = 0; frame < count; frame++) {
    if (app.tickScene()) moved++
  }
  return moved
}

test('nobody walks until Claude is working', () => {
  const app = startedGame()
  assert.equal(app.scene.step, 0)

  // Nothing is reporting at all, which is not the same as Claude being idle.
  assert.equal(runFrames(app, 20), 0, 'standing still costs no redraws')
  assert.equal(app.scene.step, 0)

  reportSession('idle')
  app.refreshActivity()
  assert.equal(runFrames(app, 20), 0, 'and an idle session is someone stood in the grass')
  assert.equal(app.scene.step, 0)

  endSession('test-session')
})

test('the walk moves on while Claude works, and stops when it stops', () => {
  const app = startedGame()
  reportSession('working', { tool: 'Bash' })
  app.refreshActivity()

  const moved = runFrames(app, 20)
  assert.ok(moved > 0, 'something should have moved')
  assert.ok(moved < 20, 'but a step is worth more than one frame')
  assert.equal(app.scene.step, moved, 'every frame that moved is a step')

  reportSession('idle')
  app.refreshActivity()
  const stopped = app.scene.step
  runFrames(app, 20)
  assert.equal(app.scene.step, stopped, 'and they stay where they got to')

  endSession('test-session')
})

test('the walk does not run underneath a battle', () => {
  const app = startedGame()
  reportSession('working', { tool: 'Bash' })
  app.refreshActivity()

  queueEncounter(app, { species: 10, name: 'Caterpie', level: 2, seed: 7 })
  press(app, 'enter')
  assert.equal(app.mode, 'battle')

  assert.equal(runFrames(app, 20), 0, 'there is no grass on screen to walk through')
  endSession('test-session')
})

// --- Menus -------------------------------------------------------------------

test('the home menu opens each screen and comes back', () => {
  const app = startedGame()

  for (const mode of ['dex', 'team', 'shop']) {
    app.openHomeSelection(mode)
    assert.equal(app.mode, mode, `${mode} should open`)
    press(app, 'escape')
    assert.equal(app.mode, 'home', `${mode} should close again`)
  }
})

test('healing at home restores the team', () => {
  const app = startedGame()
  app.save.party[0].hp = 1
  app.save.party[0].status = 'poison'

  app.openHomeSelection('heal')

  assert.equal(app.save.party[0].hp, app.save.party[0].stats.hp)
  assert.equal(app.save.party[0].status, null)
})

test('buying in the shop moves money and stock', () => {
  const app = startedGame()
  app.openHomeSelection('shop')
  const before = app.save.money

  app.shopSelection = 0 // Poké Ball
  press(app, 'enter')

  assert.ok(app.save.money < before, 'money should be spent')
  assert.match(app.shopMessage, /Bought/)
})

test('the shop refuses politely when you are broke', () => {
  const app = startedGame()
  app.save.money = 0
  app.openHomeSelection('shop')

  app.shopSelection = 0
  press(app, 'enter')

  assert.equal(app.save.money, 0)
  assert.match(app.shopMessage, /afford/i)
})

test('choosing a team member makes it the lead', () => {
  const app = startedGame()
  app.save.party.push(createPokemon(25, 9, makeRng(1)))

  app.openHomeSelection('team')
  press(app, 'down')
  press(app, 'enter')

  assert.equal(app.save.party[0].species, 25)
})

test('the Pokedex scrolls without falling off either end', () => {
  const app = startedGame()
  app.openHomeSelection('dex')

  press(app, 'up')
  assert.equal(app.dexSelection, 150, 'wraps to the last entry')

  press(app, 'down')
  assert.equal(app.dexSelection, 0, 'and back to the first')

  for (let i = 0; i < 200; i++) press(app, 'down')
  assert.ok(app.dexSelection >= 0 && app.dexSelection < 151)
})

// --- Options -----------------------------------------------------------------

test('the OPTION screen offers nothing that could stop a sprite drawing at all', () => {
  const app = startedGame()
  app.openHomeSelection('options')

  assert.equal(app.mode, 'options')
  // There is one way to draw a sprite now, and it works in every font. A setting
  // that could turn that into inline images or into Unicode 13 glyphs is a setting
  // whose wrong answer is a blank screen or a wall of tofu, which is why neither is
  // on here any more.
  const keys = SETTINGS.map((setting) => setting.key)
  assert.ok(!keys.includes('spriteMode'), 'no choice of renderer')
  assert.ok(!keys.includes('blockGrid'), 'and no choice of grid')
  assert.deepEqual(keys, ['spriteScale', 'bell', 'updateCheck'], 'only what is left')
})

test('SIZE hands room back, and wraps rather than running off the end', () => {
  const app = startedGame()
  app.openHomeSelection('options')

  // Found rather than counted: a new setting on the screen should not break a test
  // about a different one.
  openSetting(app, 'spriteScale')
  press(app, 'right')

  assert.equal(app.config.spriteScale, 0.8)
  assert.equal(app.spriteScale, 0.8, 'the views are drawing at the new size')
  assert.equal(loadConfig().spriteScale, 0.8)

  // Back past the top of the list, which is where a cursor with nowhere to go
  // would otherwise end up on a value that is not in it.
  press(app, 'left')
  press(app, 'left')
  assert.equal(app.spriteScale, 0.5, 'wrapped round to the smallest')
})

test('a setting that cannot be written is not pretended to have stuck', () => {
  const app = startedGame()
  app.openHomeSelection('options')
  openSetting(app, 'spriteScale')
  const before = app.config.spriteScale

  // A directory where the config file goes, so the write cannot land. Same shape
  // of failure as a read-only home, and portable in a way chmod is not.
  const path = join(sandbox, 'config.json')
  const saved = existsSync(path) ? readFileSync(path, 'utf8') : null
  rmSync(path, { force: true })
  mkdirSync(path)

  try {
    press(app, 'right')

    assert.equal(app.config.spriteScale, before, 'the config is left alone')
    assert.equal(app.spriteScale, before, 'and so is the screen it would have changed')
    assert.match(app.optionsMessage, /could not save/i, 'which the screen says out loud')
  } finally {
    rmSync(path, { recursive: true })
    if (saved !== null) writeFileSync(path, saved)
  }
})

test('a hand-edited sprite scale cannot leave a Pokemon too small to see', () => {
  assert.equal(spriteScale({ spriteScale: 0 }), 0.4)
  assert.equal(spriteScale({ spriteScale: -3 }), 0.4)
  assert.equal(spriteScale({ spriteScale: 12 }), 1)
  assert.equal(spriteScale({ spriteScale: 'large' }), DEFAULT_CONFIG.spriteScale)
})

test('OPTION is on the home menu, and opening it does not disturb the others', () => {
  const app = startedGame()
  assert.deepEqual(
    homeView.menuItems(app).map((item) => item.id),
    ['dex', 'team', 'shop', 'heal', 'options', 'quit'],
  )

  // Along to OPTION with the arrow keys, the way a keyboard gets there.
  for (let step = 0; step < 4; step++) press(app, 'right')
  press(app, 'enter')
  assert.equal(app.mode, 'options')

  press(app, 'escape')
  assert.equal(app.mode, 'home')
})

// --- Updating ----------------------------------------------------------------
//
// The real runner shells out to `claude plugin update`. Every test here goes through
// the seam instead, so a test run can never reach for the network or touch an
// installed plugin.

/** A run the test decides the ending of. */
function stubRun() {
  let settle
  const run = {
    state: 'running',
    from: '0.5.0',
    to: null,
    steps: [{ id: 'plugin', label: 'fetching', done: 'fetched', status: 'running', detail: null }],
  }
  run.promise = new Promise((resolve) => { settle = resolve })
  run.finish = (state = 'done', to = '0.6.0') => {
    run.state = state
    run.to = state === 'done' ? to : null
    run.steps[0].status = state === 'done' ? 'ok' : 'failed'
    settle(run)
    // Let the app's own handler on the promise run before the test looks.
    return new Promise((resolve) => setImmediate(resolve))
  }
  return run
}

/** A game whose update runs are the stub's, and the stub it will hand out. */
function gameWithUpdate() {
  const run = stubRun()
  const app = startedGame({ makeUpdateRun: () => run })
  return { app, run }
}

test('[u] does nothing at all unless there is an update to fetch', () => {
  const { app } = gameWithUpdate()

  app.updateNotice = null
  press(app, 'u')
  assert.equal(app.mode, 'home', 'no notice, no screen')

  // A newer copy already on disk is not something to fetch — quitting is the fix,
  // and running an update out of stale code is the stranger of the two.
  app.updateNotice = { kind: 'stale', version: '0.6.0' }
  press(app, 'u')
  assert.equal(app.mode, 'home')
})

test('[u] opens the update screen when a version is on offer', () => {
  const { app } = gameWithUpdate()
  app.updateNotice = { kind: 'available', version: '0.6.0' }

  press(app, 'u')
  assert.equal(app.mode, 'update')
  assert.equal(app.update.state, 'running')
})

test('an update in flight cannot be walked away from', async () => {
  const { app, run } = gameWithUpdate()
  app.updateNotice = { kind: 'available', version: '0.6.0' }
  press(app, 'u')

  for (const key of ['escape', 'q', 'enter', 'left']) press(app, key)
  assert.equal(app.mode, 'update', 'a child process is mid-flight')

  await run.finish()
  press(app, 'escape')
  assert.equal(app.mode, 'home')
  assert.equal(app.update, null, 'and the run is done with')
})

test('a second [u] does not start a second update over the first', () => {
  const { app } = gameWithUpdate()
  app.updateNotice = { kind: 'available', version: '0.6.0' }

  press(app, 'u')
  const first = app.update
  app.startUpdate()
  assert.equal(app.update, first)
})

test('a finished update leaves the home screen asking for a relaunch', async () => {
  const { app, run } = gameWithUpdate()
  app.updateNotice = { kind: 'available', version: '0.6.0' }
  press(app, 'u')

  await run.finish('done', '0.6.0')
  // The notice is reread from the disk, which in a sandbox has no plugin cache at
  // all — so what matters is that it was reread rather than left claiming there is
  // still something to fetch.
  assert.notEqual(app.updateNotice?.kind, 'available')
})

test('the spinner only turns while a step is running', () => {
  const { app, run } = gameWithUpdate()
  app.updateNotice = { kind: 'available', version: '0.6.0' }
  press(app, 'u')

  const before = app.updateFrame
  let moved = false
  for (let frame = 0; frame < 12; frame++) moved = app.tickUpdate() || moved
  assert.ok(moved, 'it turned')
  assert.ok(app.updateFrame > before)

  run.state = 'done'
  const settled = app.updateFrame
  for (let frame = 0; frame < 12; frame++) assert.equal(app.tickUpdate(), false)
  assert.equal(app.updateFrame, settled, 'a settled screen costs no redraw')
})

test('the home screen carries the version, and the notice only when there is one', () => {
  const app = startedGame()
  const size = { cols: 100, rows: 34 }

  app.updateNotice = null
  const quiet = homeView.draw(app, size).lines
  assert.ok(quiet.some((line) => line.includes(`v${VERSION}`)), 'the version is on screen')
  assert.equal(quiet.filter((line) => line.includes('is out')).length, 0)

  app.updateNotice = { kind: 'available', version: '9.9.9' }
  const loud = homeView.draw(app, size).lines
  assert.ok(loud.some((line) => line.includes('9.9.9') && line.includes('[u]')))
})
