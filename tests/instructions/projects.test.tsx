import React from 'react'
import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { InstructionsSettings } from '../../frontend/settings/instructions/InstructionsSettings'

test('shows global and every saved project without loading closed editors', () => {
  const html = renderToStaticMarkup(<InstructionsSettings projects={[
    { id: 'one', name: 'Nexus', path: '/projects/nexus' },
    { id: 'two', name: 'black', path: '/projects/black' },
  ]} />)
  expect(html).toContain('Global')
  expect(html).toContain('Nexus')
  expect(html).toContain('/projects/nexus')
  expect(html).toContain('/projects/black')
  expect(html.match(/<details/g)).toHaveLength(3)
  expect(html).not.toContain('<textarea')
})

test('keeps global available without projects', () => {
  const html = renderToStaticMarkup(<InstructionsSettings projects={[]} />)
  expect(html).toContain('Global')
  expect(html).toContain('Your projects will appear here')
})
