import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ProviderRow } from '../../../frontend/settings/ProviderRow'
import '../../../frontend/index.css'
import '../../../frontend/settings/settings.css'
import '../../../frontend/settings/providers.css'
import { scenarios } from './scenarios'

function Fixture() {
  const [provider, setProvider] = useState({
    id: 'opencode-go',
    name: 'OpenCode Go',
    baseUrl: 'https://example.test',
    authenticated: false,
    enabled: true,
    modelCount: null as number | null,
    authKind: 'api_key' as const,
  })
  const [codex, setCodex] = useState({
    id: 'openai-codex',
    name: 'OpenAI Codex',
    baseUrl: 'https://chatgpt.com/backend-api',
    authenticated: false,
    enabled: true,
    modelCount: null as number | null,
    authKind: 'oauth' as const,
  })
  const settleLogin = useRef<((ok: boolean) => void) | undefined>(undefined)

  return (
    <main style={{ padding: 24, maxWidth: 620, margin: 'auto' }}>
      <section aria-label="Providers">
        <div className="settings-provider-list">
          <ProviderRow
            provider={provider}
            onSetApiKey={async (_, key) => {
              if (key === 'reject') throw new Error('Test failure')
              setProvider((current) => ({ ...current, authenticated: true, modelCount: 36 }))
            }}
            onClearApiKey={async () => setProvider((current) => ({ ...current, authenticated: false, modelCount: null }))}
            onSetEnabled={async (_, enabled) => setProvider((current) => ({ ...current, enabled }))}
          />
          <ProviderRow
            provider={codex}
            onSetApiKey={async () => {}}
            onClearApiKey={async () => setCodex((current) => ({ ...current, authenticated: false, modelCount: null }))}
            onSetEnabled={async (_, enabled) => setCodex((current) => ({ ...current, enabled }))}
            onStartOAuth={async () =>
              await new Promise<void>((resolve, reject) => {
                settleLogin.current = (ok) => {
                  if (ok) {
                    setCodex((current) => ({ ...current, authenticated: true, modelCount: 6 }))
                    resolve()
                  } else reject(new Error('Login cancelled'))
                }
              })
            }
            onCancelOAuth={async () => {
              settleLogin.current?.(false)
            }}
            onSubmitOAuthCode={async () => {
              settleLogin.current?.(true)
            }}
          />
        </div>
      </section>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<Fixture />)
Object.assign(window, { providerHarness: { scenarios } })
