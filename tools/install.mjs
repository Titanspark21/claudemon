// The whole install, in one command. Reversible: pass --uninstall to undo it.
//
//   node tools/install.mjs [--uninstall]
//
// Four things need doing, and none of them can be done by the plugin itself:
//
//   1. A `claudemon` command on your PATH. The plugin's bin/ directory is only
//      exposed inside Claude Code's Bash tool, not in the terminal tab you play in.
//   2. The statusLine setting. A plugin's own settings.json only supports the
//      `agent` and `subagentStatusLine` keys, so this has to be written into the
//      user settings — wrapping whatever status line was already configured.
//   3. Registering and installing the plugin, which is what runs the hooks that
//      make Pokemon appear. Done here by shelling out to `claude plugin`.
//   4. The sprites. The dataset ships with the repo; the artwork does not.
//
// Every step is idempotent, so running this again is how you repair a half-finished
// install rather than something to avoid.

import { execFileSync } from 'node:child_process'
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync,
  unlinkSync, writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG_FILE, HOME, SPRITES_DIR } from '../src/paths.mjs'
import { loadConfig } from '../src/config.mjs'
import { isDataReady } from '../src/data.mjs'
import { LAUNCHERS, writeLauncher } from '../src/shim.mjs'
import { VERSION } from '../src/version.mjs'
import { bold, dim, brightGreen, brightRed, brightYellow } from '../src/ui/ansi.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const settingsPath = join(homedir(), '.claude', 'settings.json')

/** Both launchers, and the reason they are launchers, live in src/shim.mjs. */
const [commandLauncher, statusLineLauncher] = LAUNCHERS
const binTarget = commandLauncher.path
const statusLineCommand = `"${statusLineLauncher.path}"`

const uninstalling = process.argv.includes('--uninstall')

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function step(text) {
  console.log(`  ${brightGreen('✔')} ${text}`)
}

function note(text) {
  console.log(`  ${brightYellow('•')} ${text}`)
}

function fail(text) {
  console.log(`  ${brightRed('✘')} ${text}`)
}

/**
 * Runs a command for its exit status, keeping its output unless it fails.
 *
 * Every caller here is a step the install can survive losing — a missing `claude`
 * binary or an already-registered marketplace must not take the rest down with it —
 * so this reports rather than throws.
 *
 * Always with a timeout. An installer that hangs waiting on a subprocess nobody can
 * see is worse than one that gives up and prints the command to run by hand.
 */
function run(command, args, { stdio = 'pipe', timeout = 60_000 } = {}) {
  try {
    const stdout = execFileSync(command, args, { stdio, timeout, encoding: 'utf8' })
    return { ok: true, output: stdout ?? '' }
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    return {
      ok: false,
      output,
      missing: error.code === 'ENOENT',
      timedOut: error.signal === 'SIGTERM',
    }
  }
}

/** Puts the `claudemon` command on PATH, and the status line's shim in place. */
function installCommand() {
  chmodSync(join(projectRoot, 'bin', 'claudemon'), 0o755)
  chmodSync(join(projectRoot, 'scripts', 'run.sh'), 0o755)

  // An older install left a symlink here. Replacing it is the upgrade.
  if (exists(binTarget)) unlinkSync(binTarget)

  for (const launcher of LAUNCHERS) writeLauncher({ ...launcher, root: projectRoot })
  step(`installed ${bold('claudemon')} at ${dim(binTarget)}`)
}

/** Whether a path exists, including a symlink whose target does not. */
function exists(path) {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

function removeCommand() {
  let removed = false
  for (const { path } of LAUNCHERS) {
    if (!exists(path)) continue
    unlinkSync(path)
    removed = true
  }
  if (removed) step(`removed ${dim(binTarget)}`)
  else note('no claudemon command was installed')
}

/**
 * Points statusLine at our wrapper, remembering the previous command so it keeps
 * being rendered above ours.
 */
function installStatusLine() {
  const settings = readJson(settingsPath, {})
  const previous = settings.statusLine?.command ?? null

  if (previous === statusLineCommand) {
    step('status line already wrapped')
    return
  }

  // An install predating the shim points straight at a versioned plugin directory.
  // Move it across, and leave wrappedStatusLine alone: what it already remembers is
  // the status line we wrapped back then, and that is still the one to restore.
  if (previous?.includes('claudemon')) {
    settings.statusLine = { ...settings.statusLine, type: 'command', command: statusLineCommand }
    writeJson(settingsPath, settings)
    step('moved the status line onto a shim, so upgrades cannot break it')
    return
  }

  if (existsSync(settingsPath)) {
    copyFileSync(settingsPath, `${settingsPath}.claudemon-backup`)
    step(`backed up settings to ${dim(`${settingsPath}.claudemon-backup`)}`)
  }

  // Read it the same way the game does, so the installer cannot disagree with
  // the reader about what a config file means.
  const config = loadConfig()
  config.wrappedStatusLine = previous
  mkdirSync(HOME, { recursive: true })
  writeJson(CONFIG_FILE, config)

  settings.statusLine = { ...settings.statusLine, type: 'command', command: statusLineCommand }
  writeJson(settingsPath, settings)

  step(previous ? `wrapped your status line ${dim(`(${previous})`)}` : 'installed the status line')
}

/**
 * Warns if the linked command is not actually reachable, with the line to fix it.
 *
 * Checked against PATH rather than by running `claudemon`: this process has a PATH
 * inherited from the shell that will run it later, and launching the game to see if
 * it launches would take over the terminal.
 */
function checkPath() {
  const dir = dirname(binTarget)
  if ((process.env.PATH ?? '').split(delimiter).includes(dir)) return true

  const rc = process.env.SHELL?.includes('bash') ? '~/.bashrc' : '~/.zshrc'
  note(`${dim(dir)} is not on your PATH, so the command will not be found yet`)
  console.log(`      Add it:  ${bold(`echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${rc}`)}`)
  return false
}

/**
 * Whether Claude Code reports our plugin as installed.
 *
 * The listing is the only thing worth believing here. `plugin install` on something
 * already installed and `marketplace add` on something already registered both fail,
 * and neither is a problem — so the exit codes cannot be read as success or failure,
 * only the end state can.
 */
function pluginInstalled() {
  const listed = run('claude', ['plugin', 'list'], { timeout: 30_000 })
  if (listed.missing) return 'no-claude'
  return listed.ok && listed.output.includes('claudemon@claudemon')
}

/** Registers this repo as a marketplace and installs the plugin from it. */
function installPlugin() {
  const before = pluginInstalled()

  if (before === 'no-claude') {
    fail('no `claude` command found, so the plugin could not be installed')
    console.log(`      Install Claude Code, then run this again — or do it by hand:`)
    console.log(`      ${bold(`claude plugin marketplace add ${projectRoot}`)}`)
    console.log(`      ${bold('claude plugin install claudemon@claudemon')}`)
    return false
  }

  if (before === true) {
    step('plugin already installed')
    return true
  }

  run('claude', ['plugin', 'marketplace', 'add', projectRoot])
  run('claude', ['plugin', 'install', 'claudemon@claudemon'])

  if (pluginInstalled() !== true) {
    fail('could not install the plugin, so nothing will appear in the grass')
    console.log(`      Try by hand:  ${bold(`claude plugin marketplace add ${projectRoot}`)}`)
    console.log(`                    ${bold('claude plugin install claudemon@claudemon')}`)
    return false
  }

  step(`installed the plugin ${dim('(claudemon@claudemon)')}`)
  return true
}

/** Downloads the sprites, unless they are already there. */
function fetchSprites() {
  const front = join(SPRITES_DIR, 'front')
  if (existsSync(join(front, '1.png')) && existsSync(join(front, '151.png'))) {
    step('sprites already downloaded')
    return true
  }

  const fetched = run(process.execPath, [join(projectRoot, 'tools', 'fetch-sprites.mjs')], {
    stdio: 'inherit',
    timeout: 180_000,
  })
  if (!fetched.ok) {
    fail('the sprites did not download — the game runs, but Pokemon will not be drawn')
    console.log(`      Try again: ${bold('node tools/fetch-sprites.mjs')}`)
    return false
  }

  step('downloaded the sprites')
  return true
}

function uninstallStatusLine() {
  const settings = readJson(settingsPath, {})
  if (!settings.statusLine?.command?.includes('claudemon')) {
    note('status line was not ours, leaving it alone')
    return
  }

  const config = readJson(CONFIG_FILE, {})
  if (config.wrappedStatusLine) {
    settings.statusLine = { type: 'command', command: config.wrappedStatusLine }
    step(`restored your status line ${dim(`(${config.wrappedStatusLine})`)}`)
  } else {
    delete settings.statusLine
    step('removed the status line setting')
  }
  writeJson(settingsPath, settings)
}

const label = VERSION ? `claudemon ${dim(`v${VERSION}`)}` : 'claudemon'
console.log(`\n${bold(uninstalling ? 'Removing' : 'Installing')} ${label}\n`)

if (uninstalling) {
  removeCommand()
  uninstallStatusLine()
  console.log(`\n  Your save in ${dim(HOME)} was left untouched.`)
  console.log(`  Also run: ${bold('claude plugin uninstall claudemon@claudemon')}\n`)
} else {
  installCommand()
  installStatusLine()

  const dataOk = isDataReady()
  if (dataOk) step('dataset ready')
  else fail(`the dataset is missing — run ${bold('node tools/fetch-data.mjs')}`)

  const spritesOk = fetchSprites()
  const pluginOk = installPlugin()
  const pathOk = checkPath()

  const ready = dataOk && spritesOk && pluginOk && pathOk

  if (ready) {
    console.log(`\n${bold('Done.')} Two things left, both one-offs:\n`)
  } else {
    console.log(`\n${bold('Nearly there')} — sort out the ${brightYellow('•')} and ${brightRed('✘')} above, then:\n`)
  }

  console.log(`  1. Restart Claude Code, so the hooks and the status line load.`)
  console.log(`  2. In a second terminal tab, run  ${bold('claudemon')}`)
  console.log(`\n  ${dim(`Undo all of it with: node tools/install.mjs --uninstall`)}\n`)

  if (!ready) process.exitCode = 1
}
