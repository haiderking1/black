import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { countOccurrences, fuzzyFindText, normalizeForFuzzyMatch } from '../backend/tools/fuzzyMatch'
import { detectLineEnding, normalizeToLF, restoreLineEndings, splitBom } from '../backend/tools/lineEndings'
import { withFileMutationQueue } from '../backend/tools/mutationQueue'

describe('line endings', () => {
  it('detects the ending actually in use', () => {
    expect(detectLineEnding('a\r\nb\r\n')).toBe('\r\n')
    expect(detectLineEnding('a\nb\n')).toBe('\n')
  })

  it('uses whichever ending appears first', () => {
    expect(detectLineEnding('a\r\nb\nc')).toBe('\r\n')
    expect(detectLineEnding('a\nb\r\nc')).toBe('\n')
  })

  it('defaults to lf for a file with no newline at all', () => {
    expect(detectLineEnding('one line')).toBe('\n')
  })

  it('round trips without changing a crlf file', () => {
    const original = 'a\r\nb\r\n'
    const ending = detectLineEnding(original)
    expect(restoreLineEndings(normalizeToLF(original), ending)).toBe(original)
  })

  it('treats a lone carriage return as a line break', () => {
    // Old Mac line endings. Rare, but they exist and an edit must not leave them.
    expect(normalizeToLF('a\rb')).toBe('a\nb')
  })

  it('does not double convert an already converted string', () => {
    expect(normalizeToLF(normalizeToLF('a\r\nb'))).toBe('a\nb')
  })
})

describe('byte order mark', () => {
  it('splits a mark off the text', () => {
    expect(splitBom('\uFEFFhello')).toEqual({ bom: '\uFEFF', text: 'hello' })
  })

  it('reports no mark when there is none', () => {
    expect(splitBom('hello')).toEqual({ bom: '', text: 'hello' })
  })

  it('only strips a mark at the very start', () => {
    expect(splitBom('he\uFEFFllo')).toEqual({ bom: '', text: 'he\uFEFFllo' })
  })
})

describe('fuzzy matching', () => {
  it('prefers an exact match and reports it as exact', () => {
    const result = fuzzyFindText('const a = 1', 'a = 1')
    expect(result.usedFuzzyMatch).toBe(false)
    expect(result.index).toBe(6)
    expect(result.contentForReplacement).toBe('const a = 1')
  })

  it('matches through a smart quote', () => {
    const result = fuzzyFindText("// it's here", "// it's here".replace("'", '\u2019'))
    expect(result.found).toBe(true)
    expect(result.usedFuzzyMatch).toBe(true)
  })

  it('matches through an em dash', () => {
    expect(fuzzyFindText('// a \u2014 b', '// a - b').found).toBe(true)
  })

  it('matches through trailing whitespace the model dropped', () => {
    expect(fuzzyFindText('let x = 1   \nlet y = 2', 'let x = 1\nlet y = 2').found).toBe(true)
  })

  it('matches through a non-breaking space', () => {
    expect(fuzzyFindText('a\u00A0b', 'a b').found).toBe(true)
  })

  it('reports no match rather than a wrong one', () => {
    const result = fuzzyFindText('const a = 1', 'const b = 2')
    expect(result.found).toBe(false)
    expect(result.index).toBe(-1)
  })

  it('returns offsets into the normalized content when it matched loosely', () => {
    // The caller applies these offsets, so they must be offsets into the string
    // the function says to use, not into the original.
    const content = 'x\u2019y'
    const result = fuzzyFindText(content, "x'y")
    expect(result.usedFuzzyMatch).toBe(true)
    expect(result.contentForReplacement.slice(result.index, result.index + result.matchLength)).toBe("x'y")
  })

  it('leaves content untouched when nothing matched', () => {
    const content = 'abc'
    expect(fuzzyFindText(content, 'zzz').contentForReplacement).toBe(content)
  })

  it('normalization is idempotent', () => {
    const once = normalizeForFuzzyMatch('a\u2014b\u00A0c   ')
    expect(normalizeForFuzzyMatch(once)).toBe(once)
  })
})

describe('countOccurrences', () => {
  it('counts repeats in normalized space', () => {
    expect(countOccurrences('a\na\na', 'a')).toBe(3)
  })

  it('counts a smart quote variant as the same text', () => {
    // Otherwise a duplicate slips past the uniqueness check.
    expect(countOccurrences('x\u2019y and x\'y', "x'y")).toBe(2)
  })

  it('returns zero for text that is not there', () => {
    expect(countOccurrences('abc', 'zz')).toBe(0)
  })

  it('returns zero rather than infinity for an empty needle', () => {
    expect(countOccurrences('abc', '')).toBe(0)
  })
})

describe('file mutation queue', () => {
  let dir: string | undefined

  afterEach(async () => {
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
      dir = undefined
    }
  })

  it('serializes writers to one file so neither result is lost', async () => {
    dir = await mkdtemp(join(tmpdir(), 'black-queue-'))
    const file = join(dir, 'counter.txt')
    await writeFile(file, '0', 'utf-8')

    // Each writer reads, waits, then writes what it read plus itself. Without
    // serialization both read "0" and the file ends up with one of them.
    const bump = async (): Promise<void> => {
      await withFileMutationQueue(file, async () => {
        const current = await readFile(file, 'utf-8')
        await new Promise((resolveWait) => setTimeout(resolveWait, 5))
        await writeFile(file, current + 'x', 'utf-8')
      })
    }

    await Promise.all([bump(), bump(), bump()])
    expect(await readFile(file, 'utf-8')).toBe('0xxx')
  })

  it('treats different spellings of one path as the same file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'black-queue-'))
    const file = join(dir, 'a.txt')
    const spelled = join(dir, '.', 'a.txt')
    await writeFile(file, '', 'utf-8')

    const order: string[] = []
    const writer = (name: string): Promise<void> =>
      withFileMutationQueue(name === 'a' ? file : spelled, async () => {
        order.push(name + ':start')
        await new Promise((resolveWait) => setTimeout(resolveWait, 5))
        order.push(name + ':end')
      })

    await Promise.all([writer('a'), writer('b')])
    // The two must not interleave, so one start and its end are adjacent.
    const [first, second] = order
    expect(first).toBeDefined()
    expect(second).toBe(first?.replace('start', 'end'))
  })

  it('lets unrelated files run in parallel', async () => {
    dir = await mkdtemp(join(tmpdir(), 'black-queue-'))
    const first = join(dir, 'one.txt')
    const second = join(dir, 'two.txt')

    const order: string[] = []
    const writer = (file: string, name: string): Promise<void> =>
      withFileMutationQueue(file, async () => {
        order.push(name + ':start')
        await new Promise((resolveWait) => setTimeout(resolveWait, 10))
        order.push(name + ':end')
      })

    await Promise.all([writer(first, 'one'), writer(second, 'two')])
    expect(order).toEqual(['one:start', 'two:start', 'one:end', 'two:end'])
  })

  it('keeps working after a queued operation throws', async () => {
    dir = await mkdtemp(join(tmpdir(), 'black-queue-'))
    const file = join(dir, 'a.txt')

    await expect(
      withFileMutationQueue(file, async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')

    // A wedged queue would hang here forever.
    const result = await withFileMutationQueue(file, async () => 'fine')
    expect(result).toBe('fine')
  })

  it('does not wedge the queue when resolving the key fails', async () => {
    // A path under a file is impossible to resolve, and that must not poison
    // every later operation.
    dir = await mkdtemp(join(tmpdir(), 'black-queue-'))
    const file = join(dir, 'a.txt')
    await writeFile(file, 'x', 'utf-8')

    await withFileMutationQueue(join(file, 'nested', 'impossible.txt'), async () => 'created').catch(() => undefined)
    expect(await withFileMutationQueue(file, async () => 'fine')).toBe('fine')
  })
})
