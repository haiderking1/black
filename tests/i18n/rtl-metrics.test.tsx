import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ar } from '../../frontend/i18n/catalog/ar'
import { LanguageProvider } from '../../frontend/language'
import { ModelPanel } from '../../frontend/composer/ModelPanel'

const indexCss = readFileSync(new URL('../../frontend/index.css', import.meta.url), 'utf8')
const pickersCss = readFileSync(new URL('../../frontend/composer/pickers.css', import.meta.url), 'utf8')
const routeCss = readFileSync(
  new URL('../../frontend/composer/routing/routePicker.css', import.meta.url),
  'utf8',
)

describe('arabic chrome metrics', () => {
  it('keeps descenders in the search copy rather than rewriting around them', () => {
    expect(ar['model.search']).toContain('ج')
    expect(ar['route.search']).toContain('ي')
  })

  it('gives RTL inputs a line box tall enough for Noto descenders', () => {
    expect(indexCss).toContain("html[dir='rtl'] input")
    expect(indexCss).toContain('padding-block: 3px')
    expect(indexCss).toMatch(/html\[dir='rtl'\] input,\s*html\[dir='rtl'\] textarea \{[\s\S]*line-height: 1\.75/)
  })

  it('opens the model and host search fields instead of clipping placeholders', () => {
    expect(pickersCss).toMatch(/\.model-search-input \{[\s\S]*line-height: 1\.75/)
    expect(pickersCss).toMatch(/\.model-search-input \{[\s\S]*padding-block: 3px/)
    expect(routeCss).toMatch(/\.route-search-input \{[\s\S]*line-height: 1\.75/)
    expect(routeCss).toMatch(/\.route-search-input \{[\s\S]*appearance: none/)
  })

  it('renders the Arabic model search placeholder with jeem intact', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="ar">
        <ModelPanel
          models={[]}
          selectedModelId={null}
          providerId="opencode-go"
          providerName="OpenCode"
          onSelect={() => undefined}
          close={() => undefined}
        />
      </LanguageProvider>,
    )
    expect(html).toContain('ابحث في النماذج...')
    expect(html).toContain('model-search-input')
  })
})
