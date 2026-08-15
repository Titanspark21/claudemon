import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOME } from '../src/paths.mjs'
import { loadConfig, saveConfig } from '../src/config.mjs'
import { isDataReady, loadData } from '../src/data.mjs'
import { LAUNCHERS, writeLauncher } from '../src/shim.mjs'
import { VERSION } from '../src/version.mjs'
import {
  bold,
  dim,
  brightGreen,
  brightRed,
  brightYellow,
} from '../src/ui/ansi.mjs'
import {
  buildSpriteManifest,
  validateSpriteManifest,
} from './spriteManifest.mjs'
import {
  transformRequestWriteSettings,
  transformResponseSettings,
} from './transformers.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const settingsPath = join(homedir(), '.claude', 'settings.json')

const [commandLauncher, statusLineLauncher] = LAUNCHERS
const binTarget = commandLauncher.path
const statusLineCommand = `"${statusLineLauncher.path}"`

const uninstalling = process.argv.includes('--uninstall')
const verifying = process.argv.includes('--verify')

const readSettingsDocument = () => {
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8'))
  } catch {
    return {}
  }
}

const writeSettingsDocument = (document) => {
  mkdirSync(dirname(settingsPath), { recursive: true })
  writeFileSync(settingsPath, `${JSON.stringify(document, null, 2)}\n`)
}

const writeStatusLineCommand = (document, command) => {
  const { statusLine } = transformRequestWriteSettings({
    statusLine: { type: 'command', command },
  })

  writeSettingsDocument({ ...document, statusLine })
}

const step = (text) => console.log(`  ${brightGreen('✔')} ${text}`)

const note = (text) => console.log(`  ${brightYellow('•')} ${text}`)

const fail = (text) => console.log(`  ${brightRed('✘')} ${text}`)

const run = (command, args, stdio = 'pipe', timeout = 60_000) => {
  try {
    const stdout = execFileSync(command, args, {
      stdio,
      timeout,
      encoding: 'utf8',
    })

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

const exists = (path) => {
  try {
    lstatSync(path)

    return true
  } catch {
    return false
  }
}

const generatedArtifactsReady = () => {
  try {
    if (!isDataReady()) return false

    const dataset = loadData()
    const records = dataset.speciesIdentities.records
    const manifest = buildSpriteManifest(records)

    return validateSpriteManifest(manifest, records)
  } catch {
    return false
  }
}

const installCommand = () => {
  chmodSync(join(projectRoot, 'bin', 'claudemon'), 0o755)
  chmodSync(join(projectRoot, 'scripts', 'run.sh'), 0o755)

  if (exists(binTarget)) unlinkSync(binTarget)

  for (const launcher of LAUNCHERS)
    writeLauncher({
      path: launcher.path,
      target: launcher.target,
      args: launcher.args,
      root: projectRoot,
    })

  step(`installed ${bold('claudemon')} at ${dim(binTarget)}`)
}

const removeCommand = () => {
  let removed = false

  for (const { path } of LAUNCHERS) {
    if (!exists(path)) continue

    unlinkSync(path)
    removed = true
  }

  if (removed) step(`removed ${dim(binTarget)}`)
  else note('no claudemon command was installed')
}

const installStatusLine = () => {
  const document = readSettingsDocument()
  const settings = transformResponseSettings(document)
  const previous = settings.statusLine?.command ?? null

  if (previous === statusLineCommand) {
    step('status line already wrapped')
    return
  }

  if (previous?.includes('claudemon')) {
    writeStatusLineCommand(document, statusLineCommand)
    step('moved the status line onto a shim, so upgrades cannot break it')

    return
  }

  if (existsSync(settingsPath)) {
    copyFileSync(settingsPath, `${settingsPath}.claudemon-backup`)
    step(`backed up settings to ${dim(`${settingsPath}.claudemon-backup`)}`)
  }

  saveConfig({ wrappedStatusLine: previous })
  writeStatusLineCommand(document, statusLineCommand)

  step(
    previous
      ? `wrapped your status line ${dim(`(${previous})`)}`
      : 'installed the status line',
  )
}

const checkPath = () => {
  const dir = dirname(binTarget)

  if (process.env.PATH?.split(delimiter).includes(dir)) return true

  const rc = process.env.SHELL?.includes('bash') ? '~/.bashrc' : '~/.zshrc'

  note(`${dim(dir)} is not on your PATH, so the command will not be found yet`)
  console.log(
    `      Add it:  ${bold(`echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${rc}`)}`,
  )

  return false
}

const pluginInstalled = () => {
  const listed = run('claude', ['plugin', 'list'], 'pipe', 30_000)

  if (listed.missing) return 'no-claude'

  return listed.ok && listed.output.includes('claudemon@claudemon')
}

const installPlugin = () => {
  const before = pluginInstalled()

  if (before === 'no-claude') {
    fail('no `claude` command found, so the plugin could not be installed')
    console.log(
      `      Install Claude Code, then run this again — or do it by hand:`,
    )
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
    console.log(
      `      Try by hand:  ${bold(`claude plugin marketplace add ${projectRoot}`)}`,
    )
    console.log(
      `                    ${bold('claude plugin install claudemon@claudemon')}`,
    )

    return false
  }

  step(`installed the plugin ${dim('(claudemon@claudemon)')}`)

  return true
}

const fetchSprites = () => {
  const fetched = run(
    process.execPath,
    [join(projectRoot, 'tools', 'fetch-sprites.mjs')],
    'inherit',
    180_000,
  )

  if (!fetched.ok) {
    fail(
      'the sprites did not download — the game runs, but Pokemon will not be drawn',
    )
    console.log(`      Try again: ${bold('node tools/fetch-sprites.mjs')}`)

    return false
  }

  step('verified and downloaded sprite coverage')

  return true
}

const uninstallStatusLine = () => {
  const document = readSettingsDocument()
  const settings = transformResponseSettings(document)

  if (!settings.statusLine?.command?.includes('claudemon')) {
    note('status line was not ours, leaving it alone')

    return
  }

  const wrapped = loadConfig().wrappedStatusLine

  if (wrapped) {
    writeStatusLineCommand(document, wrapped)
    step(`restored your status line ${dim(`(${wrapped})`)}`)

    return
  }

  delete document.statusLine

  writeSettingsDocument(document)
  step('removed the status line setting')
}

const label = VERSION ? `claudemon ${dim(`v${VERSION}`)}` : 'claudemon'
const action = uninstalling ? 'Removing' : verifying ? 'Checking' : 'Installing'
console.log(`\n${bold(action)} ${label}\n`)

if (verifying) {
  const ready = generatedArtifactsReady()

  if (ready) step('generated data and sprite manifest are complete')
  else fail('generated data or sprite manifest is incomplete')

  if (!ready) process.exitCode = 1
} else if (uninstalling) {
  removeCommand()
  uninstallStatusLine()
  console.log(`\n  Your save in ${dim(HOME)} was left untouched.`)
  console.log(
    `  Also run: ${bold('claude plugin uninstall claudemon@claudemon')}\n`,
  )
} else {
  installCommand()
  installStatusLine()

  const dataOk = generatedArtifactsReady()

  if (dataOk) step('generated data and sprite manifest ready')
  else
    fail(
      `the generated data is incomplete — run ${bold('node tools/fetch-data.mjs')}`,
    )

  const spritesOk = dataOk ? fetchSprites() : false
  const pluginOk = installPlugin()
  const pathOk = checkPath()

  const ready = dataOk && spritesOk && pluginOk && pathOk

  if (ready) {
    console.log(`\n${bold('Done.')} Two things left, both one-offs:\n`)
  } else {
    console.log(
      `\n${bold('Nearly there')} — sort out the ${brightYellow('•')} and ${brightRed('✘')} above, then:\n`,
    )
  }

  console.log(
    `  1. Restart Claude Code, so the hooks and the status line load.`,
  )
  console.log(`  2. In a second terminal tab, run  ${bold('claudemon')}`)
  console.log(
    `\n  ${dim(`Undo all of it with: node tools/install.mjs --uninstall`)}\n`,
  )

  if (!ready) process.exitCode = 1
}
