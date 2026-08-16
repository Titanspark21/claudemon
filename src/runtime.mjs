import { tradeDatasetCompatible, tradeDataset } from './data.mjs'
import { APP_ROOT, VERSION } from './version.mjs'

export const runtimeIdentity = () => {
  return {
    root: APP_ROOT,
    version: VERSION,
    dataset: tradeDataset(),
  }
}

export const runtimeIdentityMatches = (incoming) => {
  if (!incoming) return false
  if (incoming.root !== APP_ROOT) return false
  if (incoming.version !== VERSION) return false

  return tradeDatasetCompatible(incoming.dataset)
}

export const runtimeReinstallInstruction = () => {
  return `Run: node "${APP_ROOT}/tools/install.mjs"`
}
