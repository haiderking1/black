import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { LanguageProvider } from '../../frontend/language'
import { SpotlightModal } from '../../frontend/spotlight'
import { DirectoryList } from '../../frontend/spotlight/DirectoryList'

const projects = [
  { id: '1', name: 'black', path: '/home/soka/code/black' },
  { id: '2', name: 'Nexus', path: '/projects/nexus' },
]

const noop = (): void => {}

function render(): string {
  return renderToStaticMarkup(
    <LanguageProvider language="en">
      <SpotlightModal
        isOpen={true}
        onClose={noop}
        projects={projects}
        onSelectProject={noop}
        onAddProject={noop}
        onRemoveProject={noop}
      />
    </LanguageProvider>,
  )
}

describe('SpotlightModal search field', () => {
  it('puts a labelled search field in the project picker', () => {
    const html = render()
    expect(html).toContain('spotlight-input')
    expect(html).toContain('aria-label="Search..."')
    expect(html).toContain('placeholder="Search..."')
    expect(html).toContain('black')
    expect(html).toContain('Nexus')
    expect(html).toContain('Local folder')
  })

  it('renders nothing while closed', () => {
    const html = renderToStaticMarkup(
      <SpotlightModal
        isOpen={false}
        onClose={noop}
        projects={projects}
        onSelectProject={noop}
        onAddProject={noop}
        onRemoveProject={noop}
      />,
    )
    expect(html).toBe('')
  })
})

describe('DirectoryList empty search', () => {
  it('says so when a query matches no folder', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider language="en">
        <DirectoryList
          entries={[]}
          isLoading={false}
          error={null}
          searchTerm="zzz"
          selectedIndex={-1}
          onNavigate={noop}
          onHover={noop}
          onHoverLeave={noop}
        />
      </LanguageProvider>,
    )
    expect(html).toContain('No folders matching &quot;zzz&quot;')
  })
})
