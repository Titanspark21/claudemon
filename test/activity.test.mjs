// What Claude Code is doing, and the hooks that report it.
//
// The regression that matters most here is the dullest one: the hook reads a
// field out of a payload it does not control, and when that field is wrong it
// fails silently — no error, no log, just a game where nothing ever appears. So
// the hook scripts are run as real processes against real payloads.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sandbox = mkdtempSync(join(tmpdir(), 'claudemon-activity-'))
process.env.CLAUDEMON_HOME = sandbox

const {
  STALE_MS, beginTurn, endSession, endTurn, noteTool, noteWaiting,
  pruneSessions, readActivity, readSessions, summariseActivity, writeActivity,
} = await import('../src/activity.mjs')
const { DEFAULT_CONFIG } = await import('../src/config.mjs')
const { stepsFromPrompt, stepsWhileWorking } = await import('../src/encounter.mjs')
const { activityRow } = await import('../src/ui/views/home.mjs')

/**
 * Runs a hook the way Claude Code does: a real process, JSON on stdin, in its
 * own directory so one test cannot see another's sessions.
 */
function runHook(script, payload, { home = mkdtempSync(join(tmpdir(), 'claudemon-hook-')), config } = {}) {
  if (config) writeFileSync(join(home, 'config.json'), JSON.stringify(config))

  const stdout = execFileSync(process.execPath, [join(root, 'scripts', script)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDEMON_HOME: home },
  })
  return { home, stdout }
}

/**
 * The hook's own directory, read straight off disk. Going through the modules
 * would read this process's sandbox instead: paths.mjs resolves CLAUDEMON_HOME
 * once, at import.
 */
function queueIn(home) {
  try {
    return readFileSync(join(home, 'queue.jsonl'), 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

function sessionIn(home, id) {
  try {
    return JSON.parse(readFileSync(join(home, 'sessions', `${id}.json`), 'utf8'))
  } catch {
    return null
  }
}

// --- the hook payload ---------------------------------------------------------

test('a submitted prompt walks through the grass', () => {
  // encounterChance 1 makes the roll certain, so this tests the wiring and not
  // the dice.
  const { home } = runHook('on-prompt.mjs', {
    session_id: 'aaa',
    cwd: '/tmp',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'x'.repeat(120),
  }, { config: { encounterChance: 1 } })

  const queued = queueIn(home)
  assert.equal(queued.length, 1, 'three steps, but only ever one Pokemon in the grass')
  assert.ok(queued[0].name && queued[0].level >= 2, 'and it is a real one')
  assert.equal(queued[0].session, 'aaa')
  assert.ok(!Number.isNaN(Date.parse(queued[0].at)), 'stamped, so it can time out')
})

test('a prompt does not stack a second Pokemon behind the first', () => {
  const { home } = runHook('on-prompt.mjs', {
    session_id: 'aaa2',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'x'.repeat(400),
  }, { config: { encounterChance: 1 } })

  const first = queueIn(home)
  assert.equal(first.length, 1)

  for (let prompt = 0; prompt < 5; prompt++) {
    runHook('on-prompt.mjs', {
      session_id: 'aaa2',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'x'.repeat(400),
    }, { home })
  }

  assert.deepEqual(queueIn(home), first, 'five more prompts changed nothing')
})

test('an encounter nobody faced is replaced once it has timed out', () => {
  const { home } = runHook('on-prompt.mjs', {
    session_id: 'aaa3',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'x'.repeat(120),
  }, { config: { encounterChance: 1, encounterTtlSeconds: 30 } })

  const [stale] = queueIn(home)
  assert.ok(stale)

  // Backdate it past its window: the grass is empty again as far as anyone reading
  // this file is concerned.
  writeFileSync(
    join(home, 'queue.jsonl'),
    `${JSON.stringify({ ...stale, at: new Date(Date.now() - 31_000).toISOString() })}\n`,
  )

  runHook('on-prompt.mjs', {
    session_id: 'aaa3',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'x'.repeat(120),
  }, { home })

  const queued = queueIn(home)
  assert.equal(queued.length, 1, 'the stale entry is replaced, not queued behind')
  assert.notEqual(queued[0].at, stale.at, 'and it is a fresh encounter')
})

test('submitting a prompt marks the session as working', () => {
  const { home } = runHook('on-prompt.mjs', {
    session_id: 'bbb',
    cwd: '/tmp',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'hello',
  }, { config: { encounterChance: 0 } })

  const session = sessionIn(home, 'bbb')
  assert.equal(session.state, 'working')
  assert.equal(session.tool, null)
})

test('an empty prompt still starts the turn but walks nowhere', () => {
  const { home } = runHook('on-prompt.mjs', {
    session_id: 'ccc',
    hook_event_name: 'UserPromptSubmit',
    prompt: '   ',
  }, { config: { encounterChance: 1 } })

  assert.equal(queueIn(home).length, 0)
  assert.equal(sessionIn(home, 'ccc').state, 'working')
})

test('the hook says nothing on stdout, whatever happens', () => {
  // Anything printed here is injected into the model's context on every prompt.
  const { stdout } = runHook('on-prompt.mjs', {
    session_id: 'ddd',
    hook_event_name: 'UserPromptSubmit',
    prompt: 'x'.repeat(400),
  }, { config: { encounterChance: 1 } })

  assert.equal(stdout, '')
})

test('a payload the hook cannot make sense of is survivable', () => {
  for (const payload of [{}, { session_id: 'eee' }, { prompt: 42 }]) {
    assert.doesNotThrow(() => runHook('on-prompt.mjs', payload))
  }
})

// --- the activity hook --------------------------------------------------------

test('a tool call records what Claude is running', () => {
  const { home } = runHook('on-activity.mjs', {
    session_id: 'fff',
    cwd: '/tmp',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
  })

  const session = sessionIn(home, 'fff')
  assert.equal(session.state, 'working')
  assert.equal(session.tool, 'Bash')
})

test('a notification means Claude is stuck waiting on you', () => {
  const { home } = runHook('on-activity.mjs', {
    session_id: 'ggg',
    hook_event_name: 'Notification',
    message: 'Claude needs your permission to use Bash',
  })

  const session = sessionIn(home, 'ggg')
  assert.equal(session.state, 'waiting')
  assert.match(session.message, /permission/)
})

test('stopping ends the turn', () => {
  const { home } = runHook('on-activity.mjs', { session_id: 'hhh', hook_event_name: 'Stop' })
  assert.equal(sessionIn(home, 'hhh').state, 'idle')
})

test('ending a session takes its file with it', () => {
  const { home } = runHook('on-activity.mjs', {
    session_id: 'iii',
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
  })
  assert.ok(sessionIn(home, 'iii'))

  runHook('on-activity.mjs', { session_id: 'iii', hook_event_name: 'SessionEnd' }, { home })
  assert.equal(sessionIn(home, 'iii'), null)
})

test('time spent working walks you through the grass', () => {
  const { home } = runHook('on-activity.mjs', {
    session_id: 'jjj',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
  }, { config: { encounterChance: 1, workStepSeconds: 20 } })

  assert.equal(queueIn(home).length, 0, 'no time has passed yet')

  // Backdate the clock by two minutes: six steps at twenty seconds each.
  const session = sessionIn(home, 'jjj')
  writeFileSync(
    join(home, 'sessions', 'jjj.json'),
    JSON.stringify({ ...session, since: session.since - 120_000, lastStepAt: session.lastStepAt - 120_000 }),
  )

  runHook('on-activity.mjs', { session_id: 'jjj', hook_event_name: 'Stop' }, { home })

  const queued = queueIn(home)
  assert.equal(queued.length, 1, 'two minutes of waiting turns up one Pokemon, not six')
  assert.ok(queued[0].name, 'and it is a real one')
  assert.equal(sessionIn(home, 'jjj').state, 'idle')
})

test('a long turn does not bank a queue of battles for later', () => {
  const { home } = runHook('on-activity.mjs', {
    session_id: 'mmm',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
  }, { config: { encounterChance: 1, workStepSeconds: 20 } })

  // Ten tool calls, each after two minutes of work. The clock keeps moving, but the
  // grass only ever holds the one Pokemon.
  for (let call = 0; call < 10; call++) {
    const session = sessionIn(home, 'mmm')
    writeFileSync(
      join(home, 'sessions', 'mmm.json'),
      JSON.stringify({ ...session, since: session.since - 120_000, lastStepAt: session.lastStepAt - 120_000 }),
    )
    runHook('on-activity.mjs', { session_id: 'mmm', hook_event_name: 'PreToolUse', tool_name: 'Read' }, { home })
  }

  assert.equal(queueIn(home).length, 1)
})

test('time spent stopped is not cashed in by the next tool call', () => {
  const { home } = runHook('on-activity.mjs', {
    session_id: 'lll',
    hook_event_name: 'Notification',
    message: 'permission?',
  }, { config: { encounterChance: 1, workStepSeconds: 20 } })

  // Half an hour sat on a permission prompt is not half an hour of waiting for
  // Claude, and must not pay out the moment the tool is approved.
  const session = sessionIn(home, 'lll')
  writeFileSync(
    join(home, 'sessions', 'lll.json'),
    JSON.stringify({ ...session, since: session.since - 1_800_000, lastStepAt: session.lastStepAt - 1_800_000 }),
  )

  runHook('on-activity.mjs', { session_id: 'lll', hook_event_name: 'PreToolUse', tool_name: 'Bash' }, { home })
  assert.equal(queueIn(home).length, 0)

  runHook('on-activity.mjs', { session_id: 'lll', hook_event_name: 'Stop' }, { home })
  assert.equal(queueIn(home).length, 0, 'the clock restarted with the tool call')
})

test('an idle session does not walk anywhere', () => {
  const { home } = runHook('on-activity.mjs', {
    session_id: 'kkk',
    hook_event_name: 'Stop',
  }, { config: { encounterChance: 1, workStepSeconds: 20 } })

  runHook('on-activity.mjs', { session_id: 'kkk', hook_event_name: 'Stop' }, { home })
  assert.equal(queueIn(home).length, 0)
})

// --- steps --------------------------------------------------------------------

test('a prompt is always at least one step and never more than the cap', () => {
  assert.equal(stepsFromPrompt(1, DEFAULT_CONFIG), 1)
  assert.equal(stepsFromPrompt(40, DEFAULT_CONFIG), 1)
  assert.equal(stepsFromPrompt(41, DEFAULT_CONFIG), 2)
  assert.equal(stepsFromPrompt(100_000, DEFAULT_CONFIG), DEFAULT_CONFIG.maxSteps)
})

test('working time only pays out whole steps, and banks the rest', () => {
  const config = { ...DEFAULT_CONFIG, workStepSeconds: 20 }

  assert.deepEqual(stepsWhileWorking(19_000, config), { steps: 0, taken: 0 })
  assert.deepEqual(stepsWhileWorking(20_000, config), { steps: 1, taken: 20_000 })

  // The point of `taken`: a steady stream of quick tool calls must accumulate
  // rather than losing the remainder each time.
  assert.deepEqual(stepsWhileWorking(35_000, config), { steps: 1, taken: 20_000 })
})

test('working time past the cap is dropped rather than banked', () => {
  const config = { ...DEFAULT_CONFIG, workStepSeconds: 20, maxSteps: 8 }
  const { steps, taken } = stepsWhileWorking(60 * 60_000, config)

  assert.equal(steps, 8)
  assert.equal(taken, 60 * 60_000, 'the whole hour is spent, not banked into a swarm')
})

test('turning workStepSeconds off stops the clock walking', () => {
  assert.deepEqual(stepsWhileWorking(10 * 60_000, { ...DEFAULT_CONFIG, workStepSeconds: 0 }), {
    steps: 0, taken: 0,
  })
})

// --- reading it back ----------------------------------------------------------

test('a session that says nothing for long enough is assumed dead', () => {
  const now = Date.now()
  const sessions = [{ session: 'a', state: 'working', at: now - STALE_MS - 1, since: now }]

  assert.equal(summariseActivity(sessions, now).state, 'unknown')
})

test('nothing reporting is unknown, not idle', () => {
  assert.deepEqual(summariseActivity([]), { state: 'unknown', tool: null, since: null, sessions: 0 })
})

test('needing you outranks working, and working outranks idle', () => {
  const now = Date.now()
  const idle = { session: 'a', state: 'idle', at: now - 300, since: now - 300 }
  const working = { session: 'b', state: 'working', at: now - 200, since: now - 9_000, tool: 'Bash' }
  const waiting = { session: 'c', state: 'waiting', at: now - 100, since: now - 1_000 }

  assert.equal(summariseActivity([idle], now).state, 'idle')
  assert.equal(summariseActivity([idle, working], now).state, 'working')
  assert.equal(summariseActivity([idle, working, waiting], now).state, 'waiting')
})

test('the summary describes the session that is actually moving', () => {
  const now = Date.now()
  const stale = { session: 'a', state: 'working', at: now - 60_000, since: now - 60_000, tool: 'Read' }
  const fresh = { session: 'b', state: 'working', at: now - 500, since: now - 4_000, tool: 'Bash' }

  const summary = summariseActivity([stale, fresh], now)
  assert.equal(summary.tool, 'Bash')
  assert.equal(summary.sessions, 2)
})

test('transitions keep the clock running across a turn but reset it between turns', () => {
  const first = beginTurn('trans', '/tmp')
  const tool = noteTool('trans', '/tmp', 'Grep')

  assert.equal(tool.since, first.since, 'a tool call is the same turn, still ticking')

  const done = endTurn('trans', '/tmp')
  assert.ok(done.since >= first.since, 'stopping starts a new clock')
  assert.equal(done.state, 'idle')

  const waiting = noteWaiting('trans', '/tmp', 'permission')
  assert.equal(waiting.state, 'waiting')
  assert.equal(readActivity('trans').state, 'waiting')

  endSession('trans')
  assert.equal(readActivity('trans'), null)
})

test('sessions are read back freshest first, and the ancient ones are pruned', () => {
  const now = Date.now()
  writeActivity({ v: 1, session: 'old', state: 'idle', at: now - 3 * 24 * 60 * 60_000, since: now })
  writeActivity({ v: 1, session: 'recent', state: 'working', at: now - 1_000, since: now - 1_000 })
  writeActivity({ v: 1, session: 'newest', state: 'working', at: now, since: now })

  const live = readSessions(now)
  assert.deepEqual(live.map((entry) => entry.session), ['newest', 'recent'], 'the old one is already stale')

  assert.equal(pruneSessions(now), 1, 'and gets deleted')
  assert.equal(readActivity('old'), null)

  for (const id of ['recent', 'newest']) endSession(id)
})

// --- what it looks like -------------------------------------------------------

test('the activity row says nothing when nothing is reporting', () => {
  assert.equal(activityRow({ state: 'unknown', tool: null, since: null, sessions: 0 }), '')
  assert.equal(activityRow(null), '')
})

test('the activity row names the tool and how long it has been at it', () => {
  const now = Date.now()
  const row = activityRow({ state: 'working', tool: 'Bash', since: now - 74_000, sessions: 1 }, now)

  assert.match(row, /Claude is working/)
  assert.match(row, /Bash/)
  assert.match(row, /1m14s/)
})

test('the activity row shouts when Claude is blocked on you', () => {
  const now = Date.now()
  assert.match(activityRow({ state: 'waiting', tool: null, since: now, sessions: 1 }, now), /needs you/)
  assert.match(activityRow({ state: 'idle', tool: null, since: now, sessions: 1 }, now), /idle/)
})

test('a second busy tab is counted, not hidden', () => {
  const now = Date.now()
  assert.match(activityRow({ state: 'working', tool: 'Edit', since: now, sessions: 3 }, now), /\+2/)
})

process.on('exit', () => rmSync(sandbox, { recursive: true, force: true }))
