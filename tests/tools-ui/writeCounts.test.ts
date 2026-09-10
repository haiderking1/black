import { expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeTool } from '../../backend/tools/write'

it('reports actual written lines, excluding the trailing newline sentinel', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'black-write-counts-'))
  try {
    for (const [content, lines] of [['', 0], ['one', 1], ['one\n', 1], ['one\n\n', 2], ['one\r\ntwo\r\n', 2]] as const) {
      const result = await writeTool.run({ path: 'file.ts', content }, { cwd })
      expect(result.details).toEqual({ path: join(cwd, 'file.ts'), lines })
      expect(await readFile(join(cwd, 'file.ts'), 'utf8')).toBe(content)
    }
    await expect(writeTool.run({ path: '.', content: 'no' }, { cwd })).rejects.toThrow()
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})
