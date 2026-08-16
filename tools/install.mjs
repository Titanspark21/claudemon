import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOME, PLUGIN_CACHE } from '../src/paths.mjs'
import { commandInvocation, commandMissing } from '../src/command.mjs'
import { INSTALL_FAILURE_MARK } from '../src/constants.mjs'
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

const fail = (text) =>
  console.log(`  ${brightRed(INSTALL_FAILURE_MARK)} ${text}`)

const run = (command, args, stdio = 'pipe', timeout = 60_000) => {
  const invocation = commandInvocation(command, args)

  try {
    const stdout = execFileSync(invocation.command, invocation.args, {
      stdio,
      timeout,
      encoding: 'utf8',
      shell: invocation.shell,
    })

    return { ok: true, output: stdout ?? '' }
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()

    return {
      ok: false,
      output,
      missing: commandMissing(error, output),
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

const installCommand = (root) => {
  chmodSync(join(root, 'bin', 'claudemon'), 0o755)
  chmodSync(join(root, 'scripts', 'run.sh'), 0o755)

  if (exists(binTarget)) unlinkSync(binTarget)

  for (const launcher of LAUNCHERS)
    writeLauncher({
      path: launcher.path,
      target: launcher.target,
      args: launcher.args,
      root,
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

const pluginFilesMatch = (sourceRoot, installedRoot) => {
  const files = [
    '.claude-plugin/plugin.json',
    'hooks/hooks.json',
    'scripts/on-activity.mjs',
  ]

  try {
    return files.every((path) => {
      return (
        readFileSync(join(sourceRoot, path), 'utf8') ===
        readFileSync(join(installedRoot, path), 'utf8')
      )
    })
  } catch {
    return false
  }
}

const pluginListed = (runCommand) => {
  const listed = runCommand('claude', ['plugin', 'list'], 'pipe', 30_000)

  if (listed.missing) return 'no-claude'

  return listed.ok && listed.output.includes('claudemon@claudemon')
}

export const refreshPlugin = ({ runCommand, root, cache, version }) => {
  const before = pluginListed(runCommand)

  if (before === 'no-claude') return { ok: false, reason: 'no-claude' }

  runCommand('claude', ['plugin', 'marketplace', 'remove', 'claudemon'])

  const installedRoot = join(cache, version)

  rmSync(installedRoot, { recursive: true, force: true })

  const marketplace = runCommand('claude', [
    'plugin',
    'marketplace',
    'add',
    root,
  ])

  if (!marketplace.ok) return { ok: false, reason: 'marketplace' }

  const installed = runCommand('claude', [
    'plugin',
    'install',
    'claudemon@claudemon',
  ])

  if (!installed.ok) return { ok: false, reason: 'install' }
  if (pluginListed(runCommand) !== true) return { ok: false, reason: 'install' }
  if (!pluginFilesMatch(root, installedRoot))
    return { ok: false, reason: 'root' }

  return { ok: true, root: installedRoot }
}

const installPlugin = () => {
  const result = refreshPlugin({
    runCommand: run,
    root: projectRoot,
    cache: PLUGIN_CACHE,
    version: VERSION,
  })

  if (result.reason === 'no-claude') {
    fail('no `claude` command found, so the plugin could not be installed')
    console.log(
      `      Install Claude Code, then run this again — or do it by hand:`,
    )
    console.log(`      ${bold(`claude plugin marketplace add ${projectRoot}`)}`)
    console.log(`      ${bold('claude plugin install claudemon@claudemon')}`)

    return null
  }

  if (!result.ok) {
    fail('could not refresh this checkout as the installed claudemon plugin')
    console.log(
      `      Try by hand:  ${bold('claude plugin marketplace remove claudemon')}`,
    )
    console.log(
      `                    ${bold(`claude plugin marketplace add ${projectRoot}`)}`,
    )
    console.log(
      `                    ${bold('claude plugin install claudemon@claudemon')}`,
    )

    return null
  }

  step(`installed this checkout at ${dim(result.root)}`)

  return result.root
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

const main = () => {
  const label = VERSION ? `claudemon ${dim(`v${VERSION}`)}` : 'claudemon'
  const action = uninstalling
    ? 'Removing'
    : verifying
      ? 'Checking'
      : 'Installing'

  console.log(`\n${bold(action)} ${label}\n`)

  if (verifying) {
    const ready = generatedArtifactsReady()

    if (ready) step('generated data and sprite manifest are complete')
    else fail('generated data or sprite manifest is incomplete')

    if (!ready) process.exitCode = 1

    return
  }

  if (uninstalling) {
    removeCommand()
    uninstallStatusLine()
    console.log(`\n  Your save in ${dim(HOME)} was left untouched.`)
    console.log(
      `  Also run: ${bold('claude plugin uninstall claudemon@claudemon')}\n`,
    )

    return
  }

  const dataOk = generatedArtifactsReady()

  if (dataOk) step('generated data and sprite manifest ready')
  else
    fail(
      `the generated data is incomplete — run ${bold('node tools/fetch-data.mjs')}`,
    )

  const spritesOk = dataOk ? fetchSprites() : false
  const pluginRoot = installPlugin()

  if (pluginRoot) {
    installCommand(pluginRoot)
    installStatusLine()
  }

  const pathOk = pluginRoot ? checkPath() : false
  const ready = dataOk && spritesOk && Boolean(pluginRoot) && pathOk

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

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main()
