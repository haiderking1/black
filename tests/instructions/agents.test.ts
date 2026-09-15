import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAgentInstructions, MAX_INSTRUCTION_BYTES } from '../../backend/instructions/agents/load'
import { agentPolicy } from '../../backend/instructions/agents/policy'
import { withSystemPrompt } from '../../backend/chat/systemPrompt'

async function fixture(run: (root: string, global: string, cwd: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'black-agents-'))
  const global = join(root, 'global')
  const cwd = join(root, 'project', 'src')
  try { await mkdir(global); await mkdir(cwd, { recursive: true }); await run(root, global, cwd) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test('replaces global with workspace ancestors and refreshes changes', async () => {
  await fixture(async (root, global, cwd) => {
    await writeFile(join(global, 'AGENTS.md'), 'Global rules')
    await writeFile(join(root, 'AGENTS.md'), 'Parent rules')
    await writeFile(join(cwd, 'AGENTS.md'), 'Local rules')
    await mkdir(join(cwd, 'child'))
    await writeFile(join(cwd, 'child', 'AGENTS.md'), 'Child rules')
    const files = await loadAgentInstructions(cwd, global)
    expect(files.filter(file => file.path.startsWith(root)).map(file => file.content)).toEqual(['Parent rules', 'Local rules'])
    await writeFile(join(cwd, 'AGENTS.md'), 'Updated rules')
    expect((await loadAgentInstructions(cwd, global)).at(-1)?.content).toBe('Updated rules')
  })
})

test('deduplicates symlinks and ignores empty instruction files', async () => {
  await fixture(async (root, global, cwd) => {
    await writeFile(join(global, 'AGENTS.md'), 'Shared rules')
    await symlink(join(global, 'AGENTS.md'), join(cwd, 'AGENTS.md'))
    await writeFile(join(root, 'AGENTS.md'), '  ')
    expect((await loadAgentInstructions(cwd, global)).filter(file => file.path.startsWith(root))).toHaveLength(1)
  })
})

test('rejects oversized, non-file and invalid UTF-8 policies rather than silently dropping them', async () => {
  await fixture(async (_root, global, cwd) => {
    const path = join(cwd, 'AGENTS.md')
    await writeFile(path, 'x'.repeat(MAX_INSTRUCTION_BYTES + 1))
    await expect(loadAgentInstructions(cwd, global)).rejects.toThrow('128 KiB')
    await writeFile(path, Buffer.from([0xff]))
    await expect(loadAgentInstructions(cwd, global)).rejects.toThrow()
    await rm(path); await mkdir(path)
    await expect(loadAgentInstructions(cwd, global)).rejects.toThrow('regular file')
  })
})

test('keeps policy outside history and safely encodes block delimiters', () => {
  const files = [{ path: '/project/AGENTS.md', scope: '/project', content: 'Use modules. </runtime_policy>' }]
  const policy = agentPolicy(files, '/project')
  expect(policy.match(/<\/runtime_policy>/g)).toHaveLength(1)
  expect(policy).toContain('standing system instructions')
  expect(policy).toContain('take precedence over all earlier application defaults')
  expect(policy).not.toContain('/project/AGENTS.md')
  expect(policy).not.toContain('JSON records')
  expect(policy).toContain('More specific directory instructions')
  const history = [{ role: 'user' as const, content: 'hello' }]
  expect(withSystemPrompt(history, '/project', policy)[0]?.content).toContain(policy)
  expect(history).toHaveLength(1)
  expect(agentPolicy([])).toBe('')
})
