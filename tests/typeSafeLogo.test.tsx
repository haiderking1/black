import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { TypeSafeLogo } from '../frontend/providers/TypeSafeLogo'

describe('TypeSafe logo', () => {
  it('keeps the official console mark paths and fills', () => {
    const html = renderToStaticMarkup(<TypeSafeLogo size={24} />)
    expect(html).toContain('viewBox="0 0 256 256"')
    expect(html).toContain('aria-label="TypeSafe"')
    expect(html).toContain('fill="#95b4d6"')
    expect(html).toContain('fill="#5d76a2"')
    expect(html).toContain('fill="#7da75b"')
    expect(html).toContain('fill="#b6e88e"')
    expect(html).toContain('fill="#0d0d0d"')
    expect(html).toContain('M127.99,71.48l-32.59,18.79v37.73')
  })
})
