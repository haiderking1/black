import { describe, expect, it } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getGitBranch } from '../backend/fs/git'

describe('backend/fs/git - getGitBranch', () => {
  it('reflects initialization, branch changes and detached HEAD without stale results', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'black-git-'))
    const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim()
    try {
      expect(await getGitBranch(directory)).toEqual({ isRepo: false, branch: null })
      git('init', '--initial-branch=master')
      expect(await getGitBranch(directory)).toEqual({ isRepo: true, branch: 'master' })
      git('symbolic-ref', 'HEAD', 'refs/heads/feature')
      expect(await getGitBranch(directory)).toEqual({ isRepo: true, branch: 'feature' })
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Initial')
      git('checkout', '--detach', 'HEAD')
      expect(await getGitBranch(directory)).toEqual({ isRepo: true, branch: git('rev-parse', '--short', 'HEAD') })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('returns no repository for a missing directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'black-git-missing-'))
    await rm(directory, { recursive: true })
    expect(await getGitBranch(directory)).toEqual({ isRepo: false, branch: null })
  })
})
