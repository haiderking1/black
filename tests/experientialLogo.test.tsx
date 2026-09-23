import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ModelPanel } from '../frontend/composer/ModelPanel'
import { LanguageProvider } from '../frontend/language'
import { ExperientialLogo, ProviderLogo } from '../frontend/providers'
import { ProviderRow } from '../frontend/settings/ProviderRow'

describe('Experiential logo', () => {
  it('renders the vendor sign-in mark, not the fallback initial', () => {
    const html = renderToStaticMarkup(<ExperientialLogo size={24} />)
    expect(html).toContain('class="experiential-logo"')
    expect(html).toContain('aria-label="Experiential Labs"')
    expect(html).toContain('viewBox="245 242 1700 1700"')
    expect(html).toContain('M17475 19110 c-294 -50')
    expect(html).toContain('M3907 18396 c-54 -15')
    expect(html).toContain('transform="translate(0,2200) scale(0.1,-0.1)"')
    expect(html).toContain('fill="currentColor"')
    expect(renderToStaticMarkup(<ProviderLogo providerId="experiential" size={24} />)).toContain('class="experiential-logo"')
  })

  it('appears in settings and the composer model rail', () => {
    const settings = renderToStaticMarkup(<LanguageProvider language="en"><ProviderRow
      provider={{ id: 'experiential', name: 'Experiential Labs', baseUrl: 'https://api.experientiallabs.ai/v1',
        enabled: true, authenticated: true, modelCount: 1, authKind: 'api_key', role: 'chat' }}
      onSetApiKey={async () => {}}
      onClearApiKey={async () => {}}
      onSetEnabled={async () => {}}
    /></LanguageProvider>)
    expect(settings).toContain('class="experiential-logo"')
    const composer = renderToStaticMarkup(<LanguageProvider language="en"><ModelPanel
      models={[{ id: 'model', ownedBy: 'example', created: 0 }]}
      selectedModelId="model"
      providerId="experiential"
      providerName="Experiential Labs"
      providers={[{ id: 'experiential', name: 'Experiential Labs' }]}
      onSelect={() => {}}
      close={() => {}}
    /></LanguageProvider>)
    expect(composer).toContain('class="experiential-logo"')
  })
})
