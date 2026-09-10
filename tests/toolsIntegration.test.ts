import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { editTool } from '../backend/tools/edit'
import { readTool } from '../backend/tools/read'
import { toolByName, toolDefinitions } from '../backend/tools/registry'
import { writeTool } from '../backend/tools/write'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'black-tools-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const cwd = () => ({ cwd: dir })

describe('read tool', () => {
  it('reads a file', async () => {
    await writeFile(join(dir, 'a.ts'), 'const a = 1\nconst b = 2', 'utf-8')
    const result = await readTool.run({ path: 'a.ts' }, cwd())
    expect(result.content).toBe('const a = 1\nconst b = 2')
  })

  it('reads with an offset, which is one indexed', async () => {
    await writeFile(join(dir, 'a.ts'), 'one\ntwo\nthree', 'utf-8')
    const result = await readTool.run({ path: 'a.ts', offset: 2 }, cwd())
    expect(result.content).toBe('two\nthree')
  })

  it('reads with a limit and says how much is left', async () => {
    await writeFile(join(dir, 'a.ts'), 'one\ntwo\nthree\nfour', 'utf-8')
    const result = await readTool.run({ path: 'a.ts', limit: 2 }, cwd())
    expect(result.content).toContain('one\ntwo')
    expect(result.content).toContain('2 more lines')
    expect(result.content).toContain('offset=3')
  })

  it('says nothing extra when a limit lands exactly on the end', async () => {
    await writeFile(join(dir, 'a.ts'), 'one\ntwo', 'utf-8')
    const result = await readTool.run({ path: 'a.ts', limit: 2 }, cwd())
    expect(result.content).toBe('one\ntwo')
  })

  it('pages through a large file with a usable next offset', async () => {
    const lines = Array.from({ length: 3000 }, (_, index) => 'line ' + String(index))
    await writeFile(join(dir, 'big.txt'), lines.join('\n'), 'utf-8')

    const first = await readTool.run({ path: 'big.txt' }, cwd())
    expect(first.content).toContain('[Showing lines 1-2000 of 3000.')
    expect(first.content).toContain('Use offset=2001 to continue.')
    expect(first.content.startsWith('line 0')).toBe(true)

    // The offset it suggested must actually return the rest.
    const second = await readTool.run({ path: 'big.txt', offset: 2001 }, cwd())
    expect(second.content.startsWith('line 2000')).toBe(true)
    expect(second.content).toContain('line 2999')
  })

  it('reports an empty file rather than an empty result', async () => {
    await writeFile(join(dir, 'empty.txt'), '', 'utf-8')
    const result = await readTool.run({ path: 'empty.txt' }, cwd())
    expect(result.content).toBe('File is empty.')
  })

  it('says when an offset is past the end instead of returning nothing', async () => {
    await writeFile(join(dir, 'a.ts'), 'one\ntwo', 'utf-8')
    const result = await readTool.run({ path: 'a.ts', offset: 99 }, cwd())
    expect(result.content).toContain('past the end')
    expect(result.content).toContain('2 lines')
  })

  it('names a missing file as missing', async () => {
    await expect(readTool.run({ path: 'nope.ts' }, cwd())).rejects.toThrow(/No such file/)
  })

  it('says a directory is a directory rather than a file', async () => {
    await mkdir(join(dir, 'sub'))
    await expect(readTool.run({ path: 'sub' }, cwd())).rejects.toThrow(/directory/)
  })

  it('refuses an offset below one', async () => {
    await expect(readTool.run({ path: 'a.ts', offset: 0 }, cwd())).rejects.toThrow(/offset must be 1 or greater/)
  })

  it('refuses a missing path argument', async () => {
    await expect(readTool.run({}, cwd())).rejects.toThrow(/path is required/)
  })

  it('refuses a non-numeric offset rather than coercing it', async () => {
    await expect(readTool.run({ path: 'a.ts', offset: '2' }, cwd())).rejects.toThrow(/must be a number/)
  })

  it('notes an image instead of returning its bytes as text', async () => {
    await writeFile(join(dir, 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const result = await readTool.run({ path: 'shot.png' }, cwd())
    expect(result.content).toContain('image/png')
    expect(result.content).toContain('cannot be returned')
  })

  it('reads utf-8 content without mangling it', async () => {
    const text = 'const 中 = "\u00e9"'
    await writeFile(join(dir, 'u.ts'), text, 'utf-8')
    expect((await readTool.run({ path: 'u.ts' }, cwd())).content).toBe(text)
  })
})

describe('write tool', () => {
  it('creates a file and its parent directories', async () => {
    await writeTool.run({ path: 'a/b/c/deep.ts', content: 'x' }, cwd())
    expect(await readFile(join(dir, 'a/b/c/deep.ts'), 'utf-8')).toBe('x')
  })

  it('overwrites an existing file completely', async () => {
    await writeFile(join(dir, 'a.ts'), 'old content', 'utf-8')
    await writeTool.run({ path: 'a.ts', content: 'new' }, cwd())
    expect(await readFile(join(dir, 'a.ts'), 'utf-8')).toBe('new')
  })

  it('writes an empty file', async () => {
    await writeTool.run({ path: 'empty.ts', content: '' }, cwd())
    expect(await readFile(join(dir, 'empty.ts'), 'utf-8')).toBe('')
  })

  it('reports how many lines it wrote', async () => {
    const result = await writeTool.run({ path: 'a.ts', content: 'a\nb\nc' }, cwd())
    expect(result.content).toContain('3 lines')
  })

  it('refuses to write into a path that is really a file', async () => {
    await writeFile(join(dir, 'blocker'), 'x', 'utf-8')
    await expect(writeTool.run({ path: 'blocker/child.ts', content: 'x' }, cwd())).rejects.toThrow(/not a directory/)
  })

  it('writes at an absolute path', async () => {
    const target = join(dir, 'abs.ts')
    await writeTool.run({ path: target, content: 'x' }, cwd())
    expect(await readFile(target, 'utf-8')).toBe('x')
  })

  it('refuses a missing content argument', async () => {
    await expect(writeTool.run({ path: 'a.ts' }, cwd())).rejects.toThrow(/content is required/)
  })

  it('stops when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      writeTool.run({ path: 'a.ts', content: 'x' }, { cwd: dir, signal: controller.signal })
    ).rejects.toThrow(/aborted/)
  })
})

describe('edit tool', () => {
  const setup = async (content: string, name = 'a.ts'): Promise<string> => {
    await writeFile(join(dir, name), content, 'utf-8')
    return name
  }

  it('makes a single replacement', async () => {
    const name = await setup('const a = 1')
    const result = await editTool.run({ path: name, edits: [{ oldText: 'a = 1', newText: 'a = 2' }] }, cwd())
    expect(await readFile(join(dir, name), 'utf-8')).toBe('const a = 2')
    expect(result.content).toContain('Applied 1 edit')
  })

  it('makes several replacements in one call', async () => {
    const name = await setup('one\ntwo\nthree')
    await editTool.run(
      {
        path: name,
        edits: [
          { oldText: 'one', newText: 'ONE' },
          { oldText: 'three', newText: 'THREE' }
        ]
      },
      cwd()
    )
    expect(await readFile(join(dir, name), 'utf-8')).toBe('ONE\ntwo\nTHREE')
  })

  it('preserves crlf line endings', async () => {
    const name = await setup('one\r\ntwo\r\n')
    await editTool.run({ path: name, edits: [{ oldText: 'two', newText: 'TWO' }] }, cwd())
    // Rewriting these as lf would make the diff touch every line.
    expect(await readFile(join(dir, name), 'utf-8')).toBe('one\r\nTWO\r\n')
  })

  it('preserves a byte order mark', async () => {
    const name = await setup('\uFEFFconst a = 1')
    await editTool.run({ path: name, edits: [{ oldText: 'a = 1', newText: 'a = 2' }] }, cwd())
    expect(await readFile(join(dir, name), 'utf-8')).toBe('\uFEFFconst a = 2')
  })

  it('leaves the rest of a crlf file untouched when only one line changes', async () => {
    const name = await setup('a\r\nb\r\nc\r\n')
    await editTool.run({ path: name, edits: [{ oldText: 'b', newText: 'B' }] }, cwd())
    expect(await readFile(join(dir, name), 'utf-8')).toBe('a\r\nB\r\nc\r\n')
  })

  it('matches through a smart quote without rewriting the file around it', async () => {
    const name = await setup("// don't touch\nconst a = 1 // it's here")
    await editTool.run(
      { path: name, edits: [{ oldText: 'const a = 1 // it\u2019s here', newText: 'const a = 2' }] },
      cwd()
    )
    const content = await readFile(join(dir, name), 'utf-8')
    expect(content).toContain("// don't touch")
    expect(content).toContain('const a = 2')
  })

  it('refuses an occurrence that is not unique', async () => {
    const name = await setup('const a = 1\nconst a = 1')
    await expect(editTool.run({ path: name, edits: [{ oldText: 'const a = 1', newText: 'x' }] }, cwd())).rejects.toThrow(
      /2 occurrences/
    )
  })

  it('does not write anything when an edit fails', async () => {
    const name = await setup('const a = 1')
    await expect(
      editTool.run(
        {
          path: name,
          edits: [
            { oldText: 'const a = 1', newText: 'const a = 2' },
            { oldText: 'not present', newText: 'x' }
          ]
        },
        cwd()
      )
    ).rejects.toThrow(/Could not find edits\[1\]/)
    // A partial apply would be worse than no apply.
    expect(await readFile(join(dir, name), 'utf-8')).toBe('const a = 1')
  })

  it('refuses a file that does not exist and points at write', async () => {
    await expect(editTool.run({ path: 'nope.ts', edits: [{ oldText: 'a', newText: 'b' }] }, cwd())).rejects.toThrow(
      /use write to create it/
    )
  })

  it('accepts edits sent as a json string', async () => {
    // Some models stringify the array. It means the same thing.
    const name = await setup('const a = 1')
    await editTool.run({ path: name, edits: JSON.stringify([{ oldText: 'a = 1', newText: 'a = 2' }]) }, cwd())
    expect(await readFile(join(dir, name), 'utf-8')).toBe('const a = 2')
  })

  it('accepts a single edit object instead of a one element array', async () => {
    const name = await setup('const a = 1')
    await editTool.run({ path: name, edits: { oldText: 'a = 1', newText: 'a = 2' } }, cwd())
    expect(await readFile(join(dir, name), 'utf-8')).toBe('const a = 2')
  })

  it('accepts oldText and newText at the top level', async () => {
    const name = await setup('const a = 1')
    await editTool.run({ path: name, oldText: 'a = 1', newText: 'a = 2' }, cwd())
    expect(await readFile(join(dir, name), 'utf-8')).toBe('const a = 2')
  })

  it('refuses an edits value that is invalid json', async () => {
    const name = await setup('x')
    await expect(editTool.run({ path: name, edits: '{not json' }, cwd())).rejects.toThrow(/not valid JSON/)
  })

  it('refuses an empty edit list', async () => {
    const name = await setup('x')
    await expect(editTool.run({ path: name, edits: [] }, cwd())).rejects.toThrow(/at least one replacement/)
  })

  it('reports the first changed line and returns a diff', async () => {
    const name = await setup('a\nb\nc\nd')
    const result = await editTool.run({ path: name, edits: [{ oldText: 'c', newText: 'C' }] }, cwd())
    expect(result.details?.firstChangedLine).toBe(3)
    expect(String(result.details?.diff)).toContain('C')
    expect(String(result.details?.patch)).toContain('+C')
  })

  it('returns a diff that does not paste a huge file for a tiny change', async () => {
    const lines = Array.from({ length: 400 }, (_, index) => 'line ' + String(index))
    const name = await setup(lines.join('\n'))
    const result = await editTool.run({ path: name, edits: [{ oldText: 'line 200', newText: 'CHANGED' }] }, cwd())
    const diff = String(result.details?.diff)
    expect(diff).toContain('CHANGED')
    expect(diff).toContain('...')
    expect(diff.split('\n').length).toBeLessThan(40)
  })

  it('survives a read edit read round trip', async () => {
    const name = await setup('const a = 1\nconst b = 2')
    const before = await readTool.run({ path: name }, cwd())
    expect(before.content).toContain('const a = 1')

    await editTool.run({ path: name, edits: [{ oldText: 'const b = 2', newText: 'const b = 3' }] }, cwd())

    const after = await readTool.run({ path: name }, cwd())
    expect(after.content).toBe('const a = 1\nconst b = 3')
  })

  it('can edit a file it just wrote', async () => {
    await writeTool.run({ path: 'new.ts', content: 'export const x = 1' }, cwd())
    await editTool.run({ path: 'new.ts', edits: [{ oldText: 'x = 1', newText: 'x = 2' }] }, cwd())
    expect(await readFile(join(dir, 'new.ts'), 'utf-8')).toBe('export const x = 2')
  })
})

describe('tool registry', () => {
  it('exposes exactly the three tools, and no shell', () => {
    const names = toolDefinitions().map((definition) => definition.function.name)
    expect(names).toEqual(['read', 'write', 'edit'])
  })

  it('resolves a tool by name', () => {
    expect(toolByName('edit')?.name).toBe('edit')
    expect(toolByName('bash')).toBeUndefined()
  })

  it('gives every definition a usable schema', () => {
    for (const definition of toolDefinitions()) {
      expect(definition.type).toBe('function')
      expect(definition.function.description.length).toBeGreaterThan(40)
      expect(definition.function.parameters).toBeDefined()
    }
  })
})
