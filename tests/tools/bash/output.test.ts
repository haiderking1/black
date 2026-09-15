import { expect, test } from 'bun:test'
import { readFile, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { BashOutput, BASH_MAX_BYTES } from '../../../backend/tools/bash/output'

test('keeps split UTF-8 chunks intact', () => {
  const output = new BashOutput()
  const bytes = Buffer.from('hello 🌍')
  for (const byte of bytes) output.append(Buffer.from([byte]))
  expect(output.finish()).toEqual({ content: 'hello 🌍' })
})

test('bounds the tail and preserves complete overflow in a private file', async () => {
  const output = new BashOutput()
  const text = '🌍 sample line\n'.repeat(10000)
  const bytes = Buffer.from(text)
  for (let offset = 0; offset < bytes.length; offset += 377) output.append(bytes.subarray(offset, offset + 377))
  const result = output.finish()
  try {
    expect(result.fullOutputPath).toBeDefined()
    expect(await readFile(result.fullOutputPath!, 'utf8')).toBe(text)
    expect((await stat(result.fullOutputPath!)).mode & 0o777).toBe(0o600)
    expect(Buffer.byteLength(result.content)).toBeLessThanOrEqual(BASH_MAX_BYTES)
    expect(result.content.split('\n').length).toBeLessThanOrEqual(2000)
    expect(result.content).not.toContain('�')
    expect(() => output.append(Buffer.from('late'))).toThrow('closed')
  } finally { if (result.fullOutputPath) await rm(dirname(result.fullOutputPath), { recursive: true, force: true }) }
})
