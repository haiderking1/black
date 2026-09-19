import { act } from 'react'
import type { ModelInfo } from '../../../contracts/providers'
import { DEFAULT_SETTINGS, readSettings, writeSettings } from '../../../frontend/settings/settingsStore'
import type { harness } from './entry'
import { writeModelCache } from '../../../frontend/composer/models/cache'

export async function providerBrowsingScenarios(fixture: typeof harness): Promise<string[]> {
  const current: ModelInfo = { id: 'current-model', name: 'Current model', ownedBy: 'fixture', created: 1, thinkingKind: 'none' }
  const remembered: ModelInfo = { ...current, id: 'remembered-model', name: 'Remembered model' }
  const chosen: ModelInfo = { ...current, id: 'chosen-model', name: 'Chosen model' }
  writeSettings(localStorage, { ...DEFAULT_SETTINGS, selectedProviderId: 'opencode-go', selectedModelId: current.id })
  await act(async () => { fixture.mount([current], { 'openai-codex': [remembered, chosen] }) })

  const picker = document.querySelector<HTMLButtonElement>('button[aria-label="Choose a model"]')!
  await act(async () => { picker.click() })
  await act(async () => { document.querySelector<HTMLButtonElement>('.model-rail-item[title="Codex"]')!.click() })
  if (!document.querySelector('.model-list')?.textContent?.includes(chosen.name!)) throw new Error('Rail did not display the browsed catalog')
  if (picker.querySelector('.composer-picker-label')?.textContent !== current.name) throw new Error('Browsing replaced the trigger model')
  if (!picker.querySelector('svg[aria-label="OpenCode"]')) throw new Error('Browsing replaced the trigger provider')
  const unchanged = readSettings(localStorage)
  if (unchanged.selectedProviderId !== 'opencode-go' || unchanged.selectedModelId !== current.id) throw new Error('Browsing committed a provider or its remembered model')
  if (document.querySelector('.model-row[aria-selected="true"]')) throw new Error('Browsed provider falsely marks a model selected')

  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  await act(async () => { picker.click() })
  if (document.querySelector('.model-rail-item[title="OpenCode"]')?.getAttribute('aria-pressed') !== 'true') throw new Error('Reopening retained an uncommitted provider')
  await act(async () => { document.querySelector<HTMLButtonElement>('.model-rail-item[title="Codex"]')!.click() })
  const row = [...document.querySelectorAll<HTMLButtonElement>('.model-row')].find(button => button.querySelector('.model-name')?.textContent === chosen.name)
  if (!row) throw new Error('Chosen model missing')
  await act(async () => { row.click() })
  const committed = readSettings(localStorage)
  if (committed.selectedProviderId !== 'openai-codex' || committed.selectedModelId !== chosen.id) throw new Error('Picking a model failed to commit its provider and ID together')
  if (picker.querySelector('.composer-picker-label')?.textContent !== chosen.name || !picker.querySelector('.codex-logo')) throw new Error('Trigger did not reflect the committed selection')
  writeModelCache('openai-codex', [remembered, chosen])
  return ['provider browsing preserves selection; dismissal discards browsing; model pick commits provider and model']
}

export async function verifyProviderSelectionReload(fixture: typeof harness): Promise<string> {
  await act(async () => { fixture.mount() })
  const selected = readSettings(localStorage)
  const picker = document.querySelector<HTMLButtonElement>('button[aria-label="Choose a model"]')!
  if (selected.selectedProviderId !== 'openai-codex' || selected.selectedModelId !== 'chosen-model'
    || picker.querySelector('.composer-picker-label')?.textContent !== 'Chosen model'
    || !picker.querySelector('.codex-logo')) throw new Error('Reload lost the explicitly selected provider/model')
  return 'explicit provider/model selection survives a cold page reload'
}
