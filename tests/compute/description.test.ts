import { expect, it } from 'bun:test'
import { computeTool } from '../../backend/tools/compute/tool/adapter'
import { makeComputeToolDefinition } from '../../backend/tools/compute/tool/definition'

it('exposes expression syntax rules in the model-facing description and code field', () => {
  const description = computeTool.description
  const schema: unknown = makeComputeToolDefinition().parameters.properties.code
  if (!schema || typeof schema !== 'object' || !('description' in schema) || typeof schema.description !== 'string') {
    throw new Error('compute code schema must expose a description')
  }
  const code = schema.description
  for (const text of [description, code]) {
    expect(text).toContain('arrow function expression')
    expect(text).toContain('semicolon after')
    expect(text).toContain('Semicolons inside')
    expect(text).toContain('Markdown fences')
    expect(text).toContain('TypeScript')
  }
  expect(description).toContain('invokes it for you')
})

it('distinguishes compilation failures from errors after side effects', () => {
  const description = computeTool.description
  expect(description).toContain('fix the actual cause before retrying')
  expect(description).toContain('If the plan fails to compile, none of it ran')
  expect(description).toContain('even when the error is named SyntaxError')
  expect(description).toContain('completed-call trace and current state')
})
