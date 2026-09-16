import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { remarkNormalizeListItemIndentation } from '../../frontend/markdown/indentation'

function render(markdown: string): string {
  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkNormalizeListItemIndentation]}>
      {markdown}
    </ReactMarkdown>
  )
}

describe('remarkNormalizeListItemIndentation', () => {
  it('renders same-line over-indented list items as list text, not code blocks', () => {
    const html = render(`Steps to follow:
-       const a = 1;
-           const b = 2;
-       return a + b;`)

    expect(html).not.toContain('<pre>')
    expect(html).toContain('<li>const a = 1;</li>')
    expect(html).toContain('<li>const b = 2;</li>')
    expect(html).toContain('<li>return a + b;</li>')
  })

  it('parses inline markdown in recovered list content', () => {
    const html = render(
      '-       **important** [link](https://example.com) with `inline code` and ~~strikethrough~~'
    )

    expect(html).toContain('<strong>important</strong>')
    expect(html).toContain('<a href="https://example.com">link</a>')
    expect(html).toContain('<code>inline code</code>')
    expect(html).toContain('<del>strikethrough</del>')
    expect(html).not.toContain('**important**')
  })

  it('preserves recovered blocks separated by blank lines', () => {
    const html = render(`-       **first paragraph**

        [second paragraph](https://example.com)`)

    expect(html).toContain('<strong>first paragraph</strong>')
    expect(html).toContain('<a href="https://example.com">second paragraph</a>')
  })

  it('preserves genuine fenced code blocks inside list items', () => {
    const html = render(`- Item with code:
  \`\`\`ts
  const value = 42;
  \`\`\``)

    expect(html).toContain('<code class="language-ts">const value = 42;')
  })
})
