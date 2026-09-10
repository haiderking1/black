import { describe, expect, it } from 'bun:test'

import { normalizePath, resolveToCwd } from '../backend/tools/paths'
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from '../backend/tools/truncate'

describe('normalizePath', () => {
  it('expands a bare tilde and a home-relative path', () => {
    expect(normalizePath('~', '/home/me')).toBe('/home/me')
    expect(normalizePath('~/notes.txt', '/home/me')).toBe('/home/me/notes.txt')
  })

  it('leaves a tilde that is not a home reference alone', () => {
    // "~backup" is a real filename in some projects and must not become /home/me/backup.
    expect(normalizePath('~backup/x', '/home/me')).toBe('~backup/x')
  })

  it('strips a leading at sign from a pasted path', () => {
    expect(normalizePath('@src/index.ts', '/home/me')).toBe('src/index.ts')
  })

  it('turns exotic spaces into real spaces', () => {
    // A non-breaking space in a path is invisible and makes every lookup fail.
    expect(normalizePath('my\u00A0file\u202Fname.txt', '/home/me')).toBe('my file name.txt')
  })

  it('does not mangle a path containing no specials', () => {
    expect(normalizePath('src/a b/c.ts', '/home/me')).toBe('src/a b/c.ts')
  })
})

describe('resolveToCwd', () => {
  it('resolves a relative path against the working directory', () => {
    expect(resolveToCwd('src/index.ts', '/work/project')).toBe('/work/project/src/index.ts')
  })

  it('leaves an absolute path absolute', () => {
    expect(resolveToCwd('/etc/hosts', '/work/project')).toBe('/etc/hosts')
  })

  it('collapses dot segments rather than passing them through', () => {
    expect(resolveToCwd('./src/../src/a.ts', '/work/project')).toBe('/work/project/src/a.ts')
  })

  it('resolves an empty path to the working directory itself', () => {
    // A model that emits "" meant the project root, not a crash.
    expect(resolveToCwd('', '/work/project')).toBe('/work/project')
  })

  it('cleans the base directory as well as the path', () => {
    // A working directory pasted from a document carries the same invisible
    // characters a path does, and a clean path against a dirty base is a path
    // that does not exist.
    expect(resolveToCwd('a.ts', '/work/my\u00A0project')).toBe('/work/my project/a.ts')
  })

  it('resolves an empty path against a normalized base', () => {
    expect(resolveToCwd('', '/work/my\u00A0project')).toBe('/work/my project')
  })

  it('leaves a posix path under /mnt alone on a non-windows host', () => {
    // The windows drive-letter conversion must not fire here. On linux that
    // path is a real directory, and rewriting it to C: would be nonsense.
    if (process.platform !== 'win32') {
      expect(resolveToCwd('/mnt/c/code/a.ts', '/work')).toBe('/mnt/c/code/a.ts')
    }
  })

  it('turns a file url into a path', () => {
    expect(normalizePath('file:///home/me/a.ts', '/home/me')).toBe('/home/me/a.ts')
  })

  it('leaves a file url it cannot read as written rather than throwing', () => {
    // A host other than localhost is not a path on this platform, and failing
    // the whole call over it would hide what the model actually sent.
    const unreadable = process.platform === 'win32' ? 'file://%' : 'file://example.com/a.ts'
    expect(normalizePath(unreadable, '/home/me')).toBe(unreadable)
  })
})

describe('formatSize', () => {
  it('reports bytes, kilobytes and megabytes', () => {
    expect(formatSize(512)).toBe('512B')
    expect(formatSize(2048)).toBe('2.0KB')
    expect(formatSize(1024 * 1024 * 3)).toBe('3.0MB')
  })

  it('switches unit at the boundary, not past it', () => {
    expect(formatSize(1023)).toBe('1023B')
    expect(formatSize(1024)).toBe('1.0KB')
  })
})

describe('truncateHead', () => {
  it('returns small content untouched', () => {
    const result = truncateHead('a\nb\nc')
    expect(result.truncated).toBe(false)
    expect(result.content).toBe('a\nb\nc')
    expect(result.truncatedBy).toBeNull()
    expect(result.totalLines).toBe(3)
  })

  it('does not count a trailing newline as an extra line', () => {
    expect(truncateHead('a\nb\n').totalLines).toBe(2)
    expect(truncateHead('a\nb').totalLines).toBe(2)
  })

  it('treats empty content as zero lines rather than one', () => {
    const result = truncateHead('')
    expect(result.totalLines).toBe(0)
    expect(result.truncated).toBe(false)
  })

  it('cuts on the line limit and reports which limit it was', () => {
    const content = Array.from({ length: 50 }, (_, index) => 'line ' + String(index)).join('\n')
    const result = truncateHead(content, { maxLines: 10 })
    expect(result.truncated).toBe(true)
    expect(result.truncatedBy).toBe('lines')
    expect(result.outputLines).toBe(10)
    expect(result.content.endsWith('line 9')).toBe(true)
    expect(result.totalLines).toBe(50)
  })

  it('cuts on the byte limit when lines are long', () => {
    const content = Array.from({ length: 20 }, () => 'x'.repeat(100)).join('\n')
    const result = truncateHead(content, { maxLines: 1000, maxBytes: 350 })
    expect(result.truncated).toBe(true)
    expect(result.truncatedBy).toBe('bytes')
    expect(result.outputBytes).toBeLessThanOrEqual(350)
  })

  it('never returns a half line', () => {
    const content = Array.from({ length: 20 }, (_, index) => 'x'.repeat(100) + String(index)).join('\n')
    const result = truncateHead(content, { maxLines: 1000, maxBytes: 350 })
    for (const line of result.content.split('\n')) {
      expect(content.split('\n')).toContain(line)
    }
  })

  it('flags a first line that alone exceeds the byte limit', () => {
    // There is no whole line to keep, so content is empty and the caller is told why.
    const result = truncateHead('y'.repeat(500), { maxLines: 10, maxBytes: 100 })
    expect(result.truncated).toBe(true)
    expect(result.firstLineExceedsLimit).toBe(true)
    expect(result.content).toBe('')
    expect(result.outputLines).toBe(0)
  })

  it('counts the newline between lines against the byte budget', () => {
    // Two 3-byte lines need 7 bytes with the separator, so 6 must not be enough.
    const result = truncateHead('abc\ndef', { maxLines: 10, maxBytes: 6 })
    expect(result.outputLines).toBe(1)
    expect(result.content).toBe('abc')
  })

  it('honours the documented defaults', () => {
    const content = Array.from({ length: DEFAULT_MAX_LINES + 10 }, () => 'x').join('\n')
    expect(truncateHead(content).outputLines).toBe(DEFAULT_MAX_LINES)
    expect(truncateHead('x'.repeat(DEFAULT_MAX_BYTES + 1)).truncated).toBe(true)
  })

  it('measures bytes in utf-8, not characters', () => {
    // Four characters, twelve bytes. A character count would say 4.
    const result = truncateHead('\u4e2d'.repeat(4), { maxLines: 10, maxBytes: 10 })
    expect(result.totalBytes).toBe(12)
    expect(result.truncated).toBe(true)
  })

  it('keeps whole characters when the byte limit lands inside one', () => {
    // Two thirty-byte lines and a forty-five byte budget. The second line does
    // not fit, and the output must be the first line intact rather than thirty
    // bytes cut somewhere inside a character.
    const line = '\u4e2d'.repeat(10)
    const result = truncateHead(line + '\n' + line, { maxLines: 10, maxBytes: 45 })
    expect(result.truncatedBy).toBe('bytes')
    expect(result.outputLines).toBe(1)
    expect(result.content).toBe(line)
    expect(Buffer.byteLength(result.content, 'utf-8')).toBe(30)
  })

  it('refuses when a single line is larger than the whole byte budget', () => {
    const result = truncateHead('\u4e2d'.repeat(10), { maxLines: 10, maxBytes: 20 })
    expect(result.truncated).toBe(true)
    expect(result.firstLineExceedsLimit).toBe(true)
    expect(result.content).toBe('')
    expect(result.outputLines).toBe(0)
  })
})
