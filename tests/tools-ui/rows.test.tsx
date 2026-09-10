import { describe, expect, it } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { ToolRow } from '../../frontend/tools/ToolRow'
import { FileMark } from '../../frontend/tools/FileMark'
import { PreviewProvider } from '../../frontend/lightbox/PreviewContext'
import { startToolRun, finishToolRun, readToolArguments, type ToolRun } from '../../frontend/chat/toolRun'
import { rowLabel, countDiffLines } from '../../frontend/tools/rowLabel'
import { baseName } from '../../frontend/tools/filePath'
import { DiffView, readLine } from '../../frontend/tools/DiffView'
import { generateDiffString } from '../../backend/tools/diffString'

const render = (run: ToolRun) => renderToStaticMarkup(<PreviewProvider><ToolRow run={run} /></PreviewProvider>)
const edited: ToolRun = { id: '1', name: 'edit', args: '{}', path: '/src/controllers/issue-details.ts', result: 'Edited', diff: '-  1 old\n-  2 old\n+  1 new\n+  2 new' }

describe('reference tool rows', () => {
  it('uses the dedicated compute SVG without changing file icons', () => {
    const html = render({ id: 'compute-1', name: 'compute', args: '{"title":"Check files"}' })
    expect(html).toContain('compute.svg')
    expect(html).toContain('width="16" height="16"')
    expect(html).not.toContain('tool-mark-glyph')
    expect(render(edited)).not.toContain('compute.svg')
  })

  it('renders a muted filename sentence and adjacent counts without directories or badges', () => {
    const html = render(edited)
    expect(html).toContain('tool-mark-glyph')
    expect(html).not.toContain('tool-row-dir')
    expect(html).not.toContain('tool-mark-blue')
    expect(html).toContain('tool-row-verb">Edited</span><span class="tool-row-file">issue-details.ts</span></span><span class="tool-row-count tool-row-count-added">+2</span><span class="tool-row-count tool-row-count-removed">-2')
    expect(html).toContain('title="/src/controllers/issue-details.ts"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('disabled=')
  })

  it('locks flat 24px geometry and keeps counts beside the label', () => {
    const css = readFileSync(new URL('../../frontend/tools/tools.css', import.meta.url), 'utf8')
    expect(css).toContain('min-height: 24px')
    expect(css).toContain('font-size: 13px')
    expect(css.match(/\.tool-row-label \{([^}]+)\}/)?.[1]).toContain('flex: 0 1 auto')
    expect(css).not.toContain('min-width: 4ch')
    expect(css).not.toContain('--mark-tone')
  })

  it('keeps errors visible even when a stale diff exists', () => {
    const html = render({ ...edited, isError: true, result: 'Permission denied' })
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Permission denied')
    expect(html).not.toContain('tool-row-count-added')
  })

  it('keeps images and their preview controls accessible', () => {
    const html = render({ ...edited, name: 'read', diff: undefined, images: [{ mimeType: 'image/png', data: 'AAAA' }] } as ToolRun)
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('data:image/png;base64,AAAA')
    expect(html).toContain('preview-trigger')
  })

  it('keeps output expandable and disables only empty rows', () => {
    expect(render({ ...edited, diff: undefined } as ToolRun)).not.toContain('disabled=')
    expect(render({ id: '2', name: 'read', args: '{}' })).toContain('disabled=')
  })
})

describe('counts and hostile paths', () => {
  it('counts only numbered changes, not patch headers or malformed lines', () => {
    expect(countDiffLines('+++ file\n--- file\n+ nope\n- nope\n+  1 x\n- 10 y\n  11 context')).toEqual({ added: 1, removed: 1 })
  })

  it('uses inclusive read ranges and rejects invalid range arguments', () => {
    expect(rowLabel({ ...edited, name: 'read', diff: undefined, offset: 5, limit: 2 } as ToolRun).note).toBe('lines 5–6')
    for (const value of [0, -1, 1.5, '4', null]) {
      expect(readToolArguments('read', JSON.stringify({ path: 'a', offset: value, limit: value }))).toEqual({ path: 'a' })
    }
  })

  it('reports write sizes only after success, never as net additions', () => {
    for (const [content, lines] of [['', 0], ['a', 1], ['a\n', 1], ['a\n\n', 2], ['a\r\nb\r\n', 2]] as const) {
      const run = startToolRun({ id: 'w', name: 'write', arguments: JSON.stringify({ path: 'a.ts', content }) })
      expect(run.lines).toBe(lines)
      expect(rowLabel(run).note).toBeUndefined()
      expect(rowLabel(finishToolRun(run, 'failed', true, {})).note).toBeUndefined()
      const label = rowLabel(finishToolRun(run, 'ok', false, {}))
      expect(label.note).toBe(lines + ' lines')
      expect(label.added).toBeUndefined()
    }
    expect(readToolArguments('write', '{"path":"a"}').lines).toBeUndefined()
  })

  it('handles prototype keys, separators, missing extensions and malformed arguments', () => {
    for (const path of ['__proto__', 'constructor', 'toString', 'a.__proto__', 'a.constructor', 'a.toString', '', '/', '\\', 'C:\\src\\file.ts', '/a/file.ts/', '.env', '<script>.ts']) {
      expect(() => renderToStaticMarkup(<FileMark path={path} />)).not.toThrow()
      expect(() => rowLabel({ ...edited, path, name: '__proto__' })).not.toThrow()
    }
    expect(baseName('C:\\src\\file.ts')).toBe('file.ts')
    expect(baseName('/a/file.ts/')).toBe('file.ts')
    for (const args of ['{', 'null', '[]', '42', '{"path":{}}']) expect(readToolArguments('read', args)).toEqual({})
  })
})

describe('padded display diffs', () => {
  it('preserves padded numbers, indentation, blank lines, and unparsed text', () => {
    expect(readLine('+  1   const x = 1')).toEqual({ marker: '+', number: '  1', content: '  const x = 1', tone: 'added' })
    expect(readLine('- 20 \told  ').content).toBe('\told  ')
    expect(readLine('   3 ').tone).toBe('context')
    expect(readLine('     ...').content).toBe('     ...')
    expect(readLine('malformed').content).toBe('malformed')
  })

  it('renders actual server output for three-digit files without losing padding', () => {
    const old = Array.from({ length: 120 }, (_, i) => '  line ' + i).join('\n')
    const { diff } = generateDiffString(old, old.replace('  line 0', '    changed'))
    expect(countDiffLines(diff)).toEqual({ added: 1, removed: 1 })
    const html = renderToStaticMarkup(<DiffView diff={diff} />)
    expect(html).toContain('tool-diff-number">  1</span>')
    expect(html).toContain('tool-diff-text">    changed</span>')
    expect(html).toContain('tool-diff-context')
  })
})
