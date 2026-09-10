import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadEntriesFromFile,
  MAX_SESSION_HEADER_SCAN_BYTES,
  parseSessionEntries,
  readSessionHeader,
  SessionHeaderScanLimitError,
} from '../backend/sessions/parse'

function fresh(): string {
  return mkdtempSync(join(tmpdir(), 'black-parse-'))
}

const HEADER = '{"type":"session","id":"abc","timestamp":"2025-01-01T00:00:00Z","cwd":"/tmp"}'
const MESSAGE = '{"type":"message","id":"1","parentId":null,"timestamp":"2025-01-01T00:00:01Z","message":{"role":"user","content":"hi","timestamp":1}}'

describe('loadEntriesFromFile', () => {
  it('returns empty array for non-existent file', () => {
    expect(loadEntriesFromFile(join(fresh(), 'nonexistent.jsonl'))).toEqual([])
  })

  it('returns empty array for empty file', () => {
    const dir = fresh()
    const file = join(dir, 'empty.jsonl')
    writeFileSync(file, '')
    expect(loadEntriesFromFile(file)).toEqual([])
  })

  it('returns empty array for file without valid session header', () => {
    const dir = fresh()
    const file = join(dir, 'no-header.jsonl')
    writeFileSync(file, '{"type":"message","id":"1"}\n')
    expect(loadEntriesFromFile(file)).toEqual([])
  })

  it('returns empty array for malformed JSON', () => {
    const dir = fresh()
    const file = join(dir, 'malformed.jsonl')
    writeFileSync(file, 'not json\n')
    expect(loadEntriesFromFile(file)).toEqual([])
  })

  it('loads a valid session file', () => {
    const dir = fresh()
    const file = join(dir, 'valid.jsonl')
    writeFileSync(file, HEADER + '\n' + MESSAGE + '\n')
    const entries = loadEntriesFromFile(file)
    expect(entries).toHaveLength(2)
    expect(entries[0]!.type).toBe('session')
    expect(entries[1]!.type).toBe('message')
  })

  it('skips malformed lines but keeps valid ones', () => {
    const dir = fresh()
    const file = join(dir, 'mixed.jsonl')
    writeFileSync(file, HEADER + '\nnot valid json\n' + MESSAGE + '\n')
    expect(loadEntriesFromFile(file)).toHaveLength(2)
  })

  it('adds a newline after an unterminated valid record', () => {
    const dir = fresh()
    const file = join(dir, 'unterminated.jsonl')
    const content = HEADER + '\n' + MESSAGE
    writeFileSync(file, content)

    expect(loadEntriesFromFile(file)).toHaveLength(2)
    expect(readFileSync(file, 'utf8')).toBe(content + '\n')
  })

  it('adds a newline after an unterminated malformed final fragment', () => {
    const dir = fresh()
    const file = join(dir, 'malformed-tail.jsonl')
    const content = HEADER + '\n{"type":"message"'
    writeFileSync(file, content)

    expect(loadEntriesFromFile(file)).toHaveLength(1)
    expect(readFileSync(file, 'utf8')).toBe(content + '\n')
  })

  it('does not modify an unterminated non-session file', () => {
    const dir = fresh()
    const file = join(dir, 'invalid.jsonl')
    const content = '{"type":"message","id":"1"}'
    writeFileSync(file, content)

    expect(loadEntriesFromFile(file)).toEqual([])
    expect(readFileSync(file, 'utf8')).toBe(content)
  })

  it('parses records spanning many read chunks', () => {
    const dir = fresh()
    const file = join(dir, 'big.jsonl')
    const bigId = 'a'.repeat(8192)
    writeFileSync(
      file,
      JSON.stringify({ type: 'session', version: 3, id: bigId, timestamp: '2025-01-01T00:00:00Z', cwd: '/tmp' }) + '\n',
    )
    const entries = loadEntriesFromFile(file)
    expect(entries).toHaveLength(1)
    expect((entries[0] as { id: string }).id).toBe(bigId)
  })
})

describe('readSessionHeader', () => {
  it('reads the first line as the header', () => {
    const dir = fresh()
    const file = join(dir, 'header.jsonl')
    writeFileSync(file, HEADER + '\n' + MESSAGE + '\n')
    expect(readSessionHeader(file)!.id).toBe('abc')
  })

  it('skips leading blank and malformed lines', () => {
    const dir = fresh()
    const file = join(dir, 'prefix.jsonl')
    writeFileSync(file, '\n  \nnot json\n' + HEADER + '\n')
    expect(readSessionHeader(file)!.id).toBe('abc')
  })

  it('returns null when the first parseable entry is not a header', () => {
    const dir = fresh()
    const file = join(dir, 'noheader.jsonl')
    writeFileSync(file, MESSAGE + '\n')
    expect(readSessionHeader(file)).toBeNull()
  })

  it('returns null for an empty file', () => {
    const dir = fresh()
    const file = join(dir, 'empty.jsonl')
    writeFileSync(file, '')
    expect(readSessionHeader(file)).toBeNull()
  })

  it('allows a final header without a newline terminator', () => {
    const dir = fresh()
    const file = join(dir, 'final.jsonl')
    writeFileSync(file, HEADER)
    expect(readSessionHeader(file)!.id).toBe('abc')
  })

  it('raises the scan limit error past 1 MiB without a header', () => {
    const dir = fresh()
    const file = join(dir, 'oversized.jsonl')
    writeFileSync(file, 'x'.repeat(MAX_SESSION_HEADER_SCAN_BYTES + 1))
    expect(() => readSessionHeader(file)).toThrow(SessionHeaderScanLimitError)
  })

  it('accepts a header that ends exactly at the scan limit', () => {
    const dir = fresh()
    const file = join(dir, 'exact.jsonl')
    const padding = 'x'.repeat(MAX_SESSION_HEADER_SCAN_BYTES - HEADER.length - 1)
    writeFileSync(file, padding + '\n' + HEADER)
    expect(readSessionHeader(file)!.id).toBe('abc')
  })
})

describe('parseSessionEntries', () => {
  it('parses a multiline string, skipping blank and malformed lines', () => {
    const entries = parseSessionEntries('\n' + HEADER + '\n\nbad line\n' + MESSAGE + '\n')
    expect(entries).toHaveLength(2)
  })

  it('returns an empty list for garbage input', () => {
    expect(parseSessionEntries('')).toEqual([])
    expect(parseSessionEntries('nope')).toEqual([])
  })
})
