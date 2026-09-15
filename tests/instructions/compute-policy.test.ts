import { expect, test } from 'bun:test'
import { toolDefinitions } from '../../backend/tools/registry'
import { agentPolicy } from '../../backend/instructions/agents/policy'

function description(policy = '') {
  return toolDefinitions(policy).find(tool => tool.function.name === 'compute')!.function.description
}

test('compute has no hardcoded personal rules', () => {
  const text = description()
  expect(text).not.toContain('unslop')
  expect(text).not.toContain('Never produce god files')
  expect(text).not.toContain('Never simplify a task')
  expect(text).not.toContain('machine-enforced')
})

test('injects selected policy without source labels and does not leak between requests', () => {
  const policy = agentPolicy([{ path: '/workspace/AGENTS.md', scope: '/workspace', content: 'Use focused modules.' }], '/workspace')
  const text = description(policy)
  expect(text).toContain('<runtime_policy>')
  expect(text).toContain('Use focused modules.')
  expect(text).not.toContain('/workspace/AGENTS.md')
  expect(description()).not.toContain('Use focused modules.')
  expect(description(agentPolicy([{ path: '/other/AGENTS.md', scope: '/other', content: 'Use tabs.' }], '/other'))).not.toContain('Use focused modules.')
})
