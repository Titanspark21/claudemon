import { existsSync, mkdtempSync, symlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const realDataDir = () => {
  return join(
    process.env.CLAUDEMON_HOME || join(homedir(), '.claudemon'),
    'data',
  )
}

export const useSandboxHome = (prefix) => {
  const realData = realDataDir()
  const sandbox = mkdtempSync(join(tmpdir(), prefix))

  if (existsSync(realData)) symlinkSync(realData, join(sandbox, 'data'))

  process.env.CLAUDEMON_HOME = sandbox

  return sandbox
}
