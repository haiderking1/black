import { execFile } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import type { GitBranchResult } from '../../contracts/fs'

function resolveUserPath(inputPath?: unknown): string {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    return process.cwd()
  }

  const trimmed = inputPath.trim()
  if (trimmed === '~' || trimmed.startsWith('~/')) {
    return path.join(os.homedir(), trimmed.slice(1))
  }

  return path.resolve(trimmed)
}

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: 2000,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      },
      (error, stdout) => {
        if (error) {
          reject(error)
        } else {
          resolve(stdout.trim())
        }
      }
    )
  })
}

export async function getGitBranch(targetPath?: unknown): Promise<GitBranchResult> {
  const resolved = resolveUserPath(targetPath)
  try {
    // Symbolic HEAD exists immediately after init, before the first commit.
    const branch = await runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], resolved)
    return { isRepo: true, branch: branch || null }
  } catch {
    try {
      const branch = await runGit(['rev-parse', '--short', 'HEAD'], resolved)
      return { isRepo: true, branch: branch || null }
    } catch {
      return { isRepo: false, branch: null }
    }
  }
}
