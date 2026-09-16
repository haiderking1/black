import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { LanguageProvider } from '../../frontend/language'
import { Markdown } from '../../frontend/markdown'

function render(source: string, breaks = false): string {
  return renderToStaticMarkup(
    <LanguageProvider language="en">
      <Markdown breaks={breaks}>{source}</Markdown>
    </LanguageProvider>
  )
}

describe('Markdown rendering', () => {
  it('renders GitHub alert callouts with role note and styled structure', () => {
    const html = render('> [!NOTE]\n> Keep in mind that migrations are atomic.')
    expect(html).toContain('role="note"')
    expect(html).toContain('markdown-alert')
    expect(html).toContain('alert-note')
    expect(html).toContain('Note')
    expect(html).toContain('Keep in mind that migrations are atomic.')
  })

  it('renders warning alert callout with appropriate class and label', () => {
    const html = render('> [!WARNING]\n> Destructive action.')
    expect(html).toContain('role="note"')
    expect(html).toContain('alert-warning')
    expect(html).toContain('Warning')
    expect(html).toContain('Destructive action.')
  })

  it('renders code blocks with code card header, language label, and action buttons', () => {
    const html = render('```python\nprint("hello")\n```')
    expect(html).toContain('markdown-code-block')
    expect(html).toContain('data-language="python"')
    expect(html).toContain('markdown-code-language')
    expect(html).toContain('python')
    expect(html).toContain('data-pierre-icon="file-tree-builtin-python"')
    expect(html).toContain('data-icon-token="python"')
    expect(html).toContain('aria-label="Toggle line wrap"')
    expect(html).toContain('aria-label="Copy code"')
    expect(html).toContain('print(&quot;hello&quot;)')
  })

  it('renders programming language icons for rust and sh blocks', () => {
    const rustHtml = render('```rust\nfn main() {}\n```')
    expect(rustHtml).toContain('data-pierre-icon="file-tree-builtin-rust"')
    expect(rustHtml).toContain('data-icon-token="rust"')
    expect(rustHtml).toContain('rust')

    const shHtml = render('```sh\nrustc main.rs\n```')
    expect(shHtml).toContain('data-pierre-icon="file-tree-builtin-bash"')
    expect(shHtml).toContain('data-icon-token="bash"')
    expect(shHtml).toContain('sh')
  })

  it('renders fence title filenames with corresponding language icons', () => {
    const html = render('```rust main.rs\nfn main() {}\n```')
    expect(html).toContain('data-pierre-icon="file-tree-builtin-rust"')
    expect(html).toContain('main.rs')

    const titleAttrHtml = render('```python title="worker.py"\ndef run(): pass\n```')
    expect(titleAttrHtml).toContain('data-pierre-icon="file-tree-builtin-python"')
    expect(titleAttrHtml).toContain('worker.py')
  })

  it('wraps tables in markdown-table-wrapper with responsive table layout', () => {
    const tableMd = `| Name | Role |
| --- | --- |
| Alice | Admin |
| Bob | User |`

    const html = render(tableMd)
    expect(html).toContain('markdown-table-wrapper')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>Name</th>')
    expect(html).toContain('<td>Alice</td>')
    expect(html).toContain('<td>Admin</td>')
  })

  it('renders task list items with checkbox inputs', () => {
    const listMd = `- [x] Finished step
- [ ] Next step`

    const html = render(listMd)
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked=""')
    expect(html).toContain('Finished step')
    expect(html).toContain('Next step')
  })

  it('preserves single line breaks only when breaks=true is set', () => {
    const prose = 'First line\nSecond line'
    const withoutBreaks = render(prose, false)
    const withBreaks = render(prose, true)

    expect(withoutBreaks).not.toContain('<br')
    expect(withBreaks).toContain('<br')
  })
})
