import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { listDirectory } from '../backend/fs/navigator'

describe('backend/fs/navigator - listDirectory', () => {
  const testRoot = path.join(os.tmpdir(), `black-test-fs-${Date.now()}`)

  beforeAll(async () => {
    await fs.mkdir(testRoot, { recursive: true })
    await fs.mkdir(path.join(testRoot, 'alpha-dir'))
    await fs.mkdir(path.join(testRoot, 'beta-dir'))
    await fs.mkdir(path.join(testRoot, '.hidden-dir'))
    await fs.writeFile(path.join(testRoot, 'file-1.txt'), 'hello')
    await fs.writeFile(path.join(testRoot, 'file-2.txt'), 'world')
    await fs.writeFile(path.join(testRoot, '.hidden-file'), 'secret')
  })

  afterAll(async () => {
    await fs.rm(testRoot, { recursive: true, force: true })
  })

  it('correctly reads directory contents, identifies types, and marks hidden items', async () => {
    const result = await listDirectory(testRoot)

    expect(result.currentPath).toBe(path.resolve(testRoot))
    expect(result.parentPath).toBe(path.dirname(path.resolve(testRoot)))
    expect(result.error).toBeUndefined()
    expect(result.entries.length).toBe(6)

    const hiddenDir = result.entries.find((e) => e.name === '.hidden-dir')
    expect(hiddenDir).toBeDefined()
    expect(hiddenDir?.isDirectory).toBe(true)
    expect(hiddenDir?.isHidden).toBe(true)

    const hiddenFile = result.entries.find((e) => e.name === '.hidden-file')
    expect(hiddenFile).toBeDefined()
    expect(hiddenFile?.isDirectory).toBe(false)
    expect(hiddenFile?.isHidden).toBe(true)
  })

  it('sorts directories first, then files alphabetically', async () => {
    const result = await listDirectory(testRoot)

    const dirIndices = result.entries
      .map((e, idx) => (e.isDirectory ? idx : -1))
      .filter((i) => i !== -1)
    const fileIndices = result.entries
      .map((e, idx) => (!e.isDirectory ? idx : -1))
      .filter((i) => i !== -1)

    // All directory indices should appear before any file indices
    const maxDirIdx = Math.max(...dirIndices)
    const minFileIdx = Math.min(...fileIndices)
    expect(maxDirIdx).toBeLessThan(minFileIdx)

    // Verify alphabetical ordering within directories
    const dirNames = result.entries.filter((e) => e.isDirectory).map((e) => e.name)
    const sortedDirNames = [...dirNames].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
    )
    expect(dirNames).toEqual(sortedDirNames)

    // Verify alphabetical ordering within files
    const fileNames = result.entries.filter((e) => !e.isDirectory).map((e) => e.name)
    const sortedFileNames = [...fileNames].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
    )
    expect(fileNames).toEqual(sortedFileNames)
  })

  it('safely handles non-string and empty inputs by falling back to cwd', async () => {
    const fromUndefined = await listDirectory(undefined)
    expect(fromUndefined.currentPath).toBe(process.cwd())
    expect(fromUndefined.error).toBeUndefined()

    const fromEmpty = await listDirectory('   ')
    expect(fromEmpty.currentPath).toBe(process.cwd())
    expect(fromEmpty.error).toBeUndefined()

    // Robustness: ensure malformed inputs don't crash
    const fromNumber = await listDirectory(12345 as unknown as string)
    expect(fromNumber.currentPath).toBe(process.cwd())
    expect(fromNumber.error).toBeUndefined()

    const fromObject = await listDirectory({} as unknown as string)
    expect(fromObject.currentPath).toBe(process.cwd())
    expect(fromObject.error).toBeUndefined()
  })

  it('handles non-directory target by returning descriptive error and parent path', async () => {
    const filePath = path.join(testRoot, 'file-1.txt')
    const result = await listDirectory(filePath)

    expect(result.currentPath).toBe(filePath)
    expect(result.parentPath).toBe(testRoot)
    expect(result.entries).toEqual([])
    expect(result.error).toBe('Target is not a directory')
  })

  it('handles non-existent target path gracefully without throwing', async () => {
    const nonExistent = path.join(testRoot, 'does-not-exist')
    const result = await listDirectory(nonExistent)

    expect(result.currentPath).toBe(nonExistent)
    expect(result.parentPath).toBe(testRoot)
    expect(result.entries).toEqual([])
    expect(result.error).toBeDefined()
    expect(typeof result.error).toBe('string')
  })

  it('expands tilde (~) prefix to user home directory', async () => {
    const result = await listDirectory('~')
    expect(result.currentPath).toBe(os.homedir())
    expect(result.error).toBeUndefined()
  })
})
