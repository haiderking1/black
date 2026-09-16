import { expect, test } from 'bun:test'
import * as Schema from 'effect/Schema'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChatCompleteInput } from '../../../contracts/chat'
import { toolDefinitions, toolByName } from '../../../backend/tools/registry'
import { runToolLoop, type ToolLoopOptions } from '../../../backend/chat/toolLoop'
import { withSystemPrompt } from '../../../backend/chat/systemPrompt'
import { parseSettings } from '../../../frontend/settings/settingsStore'
import type { ChatStreamEvent } from '../../../backend/providers/types'

const names = (mode: 'compute' | 'standard') => toolDefinitions('', mode).map(tool => tool.function.name)
test('tool exposure, execution lookup and system instructions agree on the mode', () => {
  expect(names('compute')).toEqual(['compute'])
  expect(names('standard')).toEqual(['bash', 'read', 'write', 'edit', 'glob', 'grep'])
  expect(toolByName('bash')).toBeUndefined()
  expect(toolByName('compute', 'standard')).toBeUndefined()
  const prompt = withSystemPrompt([], '/tmp', 'Standing policy fixture', 'standard')[0]!.content
  expect(prompt).toContain('call bash, read, write, edit, glob, and grep directly')
  expect(prompt).not.toContain('compute is the only')
  expect(prompt).toContain('Standing policy fixture')
  expect(toolDefinitions('private policy', 'standard').some(tool => tool.function.description.includes('private policy'))).toBe(false)
  expect(toolDefinitions('private policy')[0]!.function.description).toContain('private policy')
  expect(toolDefinitions()[0]!.function.description).not.toContain('private policy')
})

test('old settings and RPC callers default to compute while invalid modes are rejected', () => {
  expect(parseSettings({}).workflow).toBe('compute')
  for (const value of [null, {}, 'bash', 'unknown', 1]) expect(parseSettings({ workflow: value }).workflow).toBe('compute')
  expect(parseSettings({ workflow: 'standard' }).workflow).toBe('standard')
  const input = { providerId: 'fixture', model: 'fixture', messages: [] }
  const decode = Schema.decodeUnknownSync(ChatCompleteInput)
  expect(decode(input).workflow).toBeUndefined()
  expect(decode({ ...input, workflow: 'standard' }).workflow).toBe('standard')
  expect(() => decode({ ...input, workflow: 'invalid' })).toThrow()
  expect(decode(input).language).toBeUndefined()
  expect(decode({ ...input, language: 'ar' }).language).toBe('ar')
  expect(() => decode({ ...input, language: 'fr' })).toThrow()
})

test('standard tools execute without compute and keep their turn-local mode', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'black-workflow-test-'))
  try {
    let round = 0
    const calls = [
      ['write', { path: 'nested/file.txt', content: 'before' }],
      ['edit', { path: 'nested/file.txt', edits: [{ oldText: 'before', newText: 'after' }] }],
      ['read', { path: 'nested/file.txt' }],
      ['glob', { pattern: '**/*.txt' }],
      ['grep', { pattern: 'after' }],
      ['bash', { command: 'cat nested/file.txt' }],
      ['compute', { title: 'Must not run', code: 'async () => 42' }],
    ] as const
    const options: ToolLoopOptions = {
      cwd, workflow: 'standard', messages: [],
      stream: async function* () {
        if (round++ === 0) {
          // A preference change cannot change the already-created turn context.
          options.workflow = 'compute'
          yield { type: 'tool_calls', toolCalls: calls.map(([name, args], index) => ({ id: String(index), name, arguments: JSON.stringify(args) })) }
          yield { type: 'done', stopReason: 'stop' }
        } else { yield { type: 'text', text: 'Finished' }; yield { type: 'done', stopReason: 'stop' } }
      },
    }
    const events: ChatStreamEvent[] = []
    for await (const event of runToolLoop(options)) events.push(event)
    const results = events.filter(event => event.type === 'tool_result')
    expect(results).toHaveLength(7)
    expect(results.slice(0, 6).every(event => event.toolIsError === false)).toBe(true)
    expect(results[2]!.toolResult).toContain('after')
    expect(results[3]!.toolResult).toContain('file.txt')
    expect(results[4]!.toolResult).toContain('after')
    expect(results[6]!.toolIsError).toBe(true)
    expect(results[6]!.toolResult).toContain('Available tools: bash, read, write, edit, glob, grep')
    expect(await readFile(join(cwd, 'nested/file.txt'), 'utf8')).toBe('after')
  } finally { await rm(cwd, { recursive: true, force: true }) }
})
