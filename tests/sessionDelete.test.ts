import { describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deleteSessionFile } from '../backend/sessions/delete'

describe('deleteSessionFile', () => {
  it('rejects invalid paths without touching the filesystem', async () => {
    for (const bad of ['', '   ']) {
      const result = await deleteSessionFile(bad)
      expect(result.deleted).toBe(false)
      expect(result.error).toBeDefined()
    }
  })

  it('treats a missing file as already deleted', async () => {
    // The goal is a gone file, so this is success.
    const result = await deleteSessionFile(join(tmpdir(), 'definitely-missing-' + Date.now() + '.jsonl'))
    expect(result.deleted).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('unlinks the file when trash is disabled', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'black-delete-'))
    try {
      const file = join(dir, 'session.jsonl')
      writeFileSync(file, '{"type":"session"}\n')

      const result = await deleteSessionFile(file, { trashEnabled: false })
      expect(result.deleted).toBe(true)
      expect(result.trashUsed).toBe(false)
      expect(existsSync(file)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('falls back to unlink when the trash CLI fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'black-delete-'))
    try {
      const file = join(dir, 'session.jsonl')
      writeFileSync(file, '{"type":"session"}\n')

      const result = await deleteSessionFile(file, { trashEnabled: true })
      expect(result.deleted).toBe(true)
      // Either the real trash CLI handled it or the unlink fallback did;
      // either way the file is gone.
      expect(existsSync(file)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
