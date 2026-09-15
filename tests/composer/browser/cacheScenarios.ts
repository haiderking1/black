import type { ModelInfo } from '../../../contracts/providers'
import { writeModelCache } from '../../../frontend/composer/models/cache'
import { readSettings, writeSettings } from '../../../frontend/settings/settingsStore'
import type { harness } from './entry'

const model: ModelInfo = { id: 'persisted-model', ownedBy: 'fixture', created: 1, thinkingKind: 'effort', thinkingLevels: ['high', 'max'] }
export function prepareCacheRestart() {
  writeSettings(localStorage, { ...readSettings(localStorage), selectedModelId: model.id, thinkingLevel: 'high' })
  writeModelCache('opencode-go', [model])
}

export function verifyCacheRestart(fixture: typeof harness): string {
  fixture.mount()
  const picker = document.querySelector<HTMLButtonElement>('button[aria-label="Choose a model"]')
  const thinking = document.querySelector<HTMLButtonElement>('button[aria-label="Thinking level"]')
  if (!picker || picker.disabled || !picker.textContent?.includes(model.id)) throw new Error('Cached model was not usable on the first render after page reload')
  if (!thinking || thinking.disabled || !thinking.textContent?.includes('High')) throw new Error('Cached thinking levels were not available on the first render after page reload')
  if (readSettings(localStorage).thinkingLevel !== 'high') throw new Error('Cached startup changed the saved preference')
  fixture.mountSettings()
  if (!document.querySelector<HTMLInputElement>('input[value=standard]')?.checked) throw new Error('Workflow did not survive a full page reload')
  return 'models, thinking levels, and workflow survive a full page reload before RPC connects'
}
