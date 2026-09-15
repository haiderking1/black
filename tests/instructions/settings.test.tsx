import React from 'react'
import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { listInstructions, saveInstruction } from '../../backend/instructions/agents/settings'
import { InstructionEditor } from '../../frontend/settings/instructions/InstructionEditor'

async function fixture(run: (cwd: string, global: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'black-edit-instructions-'))
  const cwd = join(root, 'project'); const global = join(root, 'global')
  try { await mkdir(cwd); await mkdir(global); await run(cwd, global) } finally { await rm(root, { recursive: true, force: true }) }
}

test('lists empty project files and saves selected instructions', async () => {
  await fixture(async (cwd, global) => {
    await writeFile(join(cwd, 'AGENTS.md'), '')
    await writeFile(join(global, 'AGENTS.md'), 'Global')
    const result = await listInstructions(cwd, global)
    expect(result.globalExcluded).toBe(true)
    const file = result.files.find(file => file.path === join(cwd, 'AGENTS.md'))!
    expect(file.content).toBe('')
    const saved = await saveInstruction({ ...file, workingDirectory: cwd, content: 'Use modules' }, global)
    expect(saved.files.find(row => row.path === file.path)?.content).toBe('Use modules')
    expect(await readFile(file.path, 'utf8')).toBe('Use modules')
    expect(await readFile(join(global, 'AGENTS.md'), 'utf8')).toBe('Global')
  })
})

test('rejects stale revisions and paths outside the selected files', async () => {
  await fixture(async (cwd, global) => {
    const path = join(cwd, 'AGENTS.md')
    await writeFile(path, 'Original')
    const file = (await listInstructions(cwd, global)).files.find(file => file.path === path)!
    await writeFile(path, 'External edit')
    await expect(saveInstruction({ ...file, workingDirectory: cwd, content: 'Stale draft' }, global)).rejects.toThrow('changed on disk')
    expect(await readFile(path, 'utf8')).toBe('External edit')
    await expect(saveInstruction({ ...file, workingDirectory: cwd, path: join(cwd, 'other.txt') }, global)).rejects.toThrow('no longer selected')
  })
})

test('global file is editable when no project policy exists', async () => {
  await fixture(async (_cwd, global) => {
    await writeFile(join(global, 'AGENTS.md'), 'Global')
    const result = await listInstructions(undefined, global)
    expect(result.globalExcluded).toBe(false)
    const file = result.files[0]!
    await saveInstruction({ ...file, content: 'Updated global' }, global)
    expect(await readFile(file.path, 'utf8')).toBe('Updated global')
  })
})

test('editor labels the file and renders its text safely', () => {
  const html = renderToStaticMarkup(<InstructionEditor file={{ path: '/project/AGENTS.md', scope: '/project', content: '<script>test</script>', revision: 'rev' }} save={async () => {}} reportDirty={() => {}} />)
  expect(html).toContain('Instructions in /project/AGENTS.md')
  expect(html).toContain('&lt;script&gt;test&lt;/script&gt;')
  expect(html).toContain('Save')
})
