import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { ModelInfo } from '../../../contracts/providers'
import { Composer, type ComposerSubmitOptions } from '../../../frontend/composer/Composer'
import { useSettings } from '../../../frontend/settings/useSettings'
import { GeneralSettings } from '../../../frontend/settings/GeneralSettings'
import '../../../frontend/settings/settings.css'
import { workflowScenarios } from './workflowScenarios'
import { clearResourceCache, writeCached } from '../../../frontend/rpc/resourceCache'
import '../../../frontend/index.css'
import { scenarios } from './scenarios'
import { prepareCacheRestart, verifyCacheRestart } from './cacheScenarios'
import { providerBrowsingScenarios, verifyProviderSelectionReload } from './providerBrowsingScenarios'

let root: Root | undefined
let sent: ComposerSubmitOptions | undefined
let pickedModel: string | undefined
function Fixture() {
  const { settings, updateSetting } = useSettings()
  return <Composer model={settings.selectedModelId} thinkingLevel={settings.thinkingLevel}
    providerId={settings.selectedProviderId ?? 'opencode-go'}
    providers={[{ id: 'opencode-go', name: 'OpenCode' }, { id: 'openai-codex', name: 'Codex' }]}
    onSelectModel={(id, providerId) => {
      updateSetting('selectedProviderId', providerId)
      updateSetting('selectedModelId', id)
    }}
    onPickModel={id => { pickedModel = id }}
    onSelectThinkingLevel={value => updateSetting('thinkingLevel', value)}
    onSendMessage={(_, options) => { sent = options }} />
}

function SettingsFixture() {
  const { settings, updateSetting, resetSettings } = useSettings()
  return <div style={{ padding: 24, maxWidth: 800 }}><GeneralSettings settings={settings} onChange={updateSetting} onReset={resetSettings} /></div>
}

export const harness = {
  mountSettings() {
    if (root) flushSync(() => root!.unmount())
    root = createRoot(document.getElementById('root')!)
    flushSync(() => root!.render(<SettingsFixture />))
  },
  mount(models?: readonly ModelInfo[], otherCatalogs: Record<string, readonly ModelInfo[]> = {}) {
    if (root) flushSync(() => root!.unmount())
    clearResourceCache()
    if (models) writeCached('providers.listModels:opencode-go', models)
    for (const [providerId, catalog] of Object.entries(otherCatalogs)) writeCached('providers.listModels:' + providerId, catalog)
    sent = undefined
    pickedModel = undefined
    root = createRoot(document.getElementById('root')!)
    flushSync(() => root!.render(<Fixture />))
  },
  sent: () => sent,
  pickedModel: () => pickedModel,
}
Object.assign(window, { composerHarness: { scenarios: async () => [...await scenarios(harness), ...await providerBrowsingScenarios(harness), ...await workflowScenarios(harness)], prepareCacheRestart, verifyCacheRestart: () => verifyCacheRestart(harness), providerBrowsing: () => providerBrowsingScenarios(harness), verifyProviderSelectionReload: () => verifyProviderSelectionReload(harness) } })
