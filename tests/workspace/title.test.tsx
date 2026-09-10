import { expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkspaceTitle } from '../../frontend/workspace/WorkspaceTitle'

test('shows project and current session without an icon', () => {
  const html = renderToStaticMarkup(<WorkspaceTitle projectName="see" sessionTitle="Fix Timer Overlay Position" />)
  expect(html).toContain('see / Fix Timer Overlay Position')
  expect(html).toContain('workspace-title-separator')
  expect(html).not.toContain('<svg')
  expect(html).not.toContain('Black')
})

test('omits the separator when no session is selected', () => {
  const html = renderToStaticMarkup(<WorkspaceTitle projectName="project" />)
  expect(html).toContain('project')
  expect(html).not.toContain('workspace-title-separator')
})

test('handles empty workspace and escapes user titles', () => {
  expect(renderToStaticMarkup(<WorkspaceTitle />)).toContain('Workspace')
  const html = renderToStaticMarkup(<WorkspaceTitle projectName="<project>" sessionTitle="<script>" />)
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
})
