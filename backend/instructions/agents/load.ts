import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

export interface AgentInstructions { path: string; scope: string; content: string }
export const MAX_INSTRUCTION_BYTES = 128 * 1024
export const MAX_TOTAL_BYTES = 512 * 1024

/** Workspace ancestors from broadest to closest; global policy is a fallback only. */
export async function loadAgentInstructions(workingDirectory?: string, globalDirectory = join(homedir(), '.black'), includeEmpty = false): Promise<AgentInstructions[]> {
  const candidates: Array<{ path: string; scope: string }> = []
  if (workingDirectory) {
    if (!isAbsolute(workingDirectory)) throw new Error('Instruction loading requires an absolute working directory')
    const directories: string[] = []
    let directory = workingDirectory
    for (;;) {
      directories.push(directory)
      const parent = dirname(directory)
      if (parent === directory) break
      directory = parent
    }
    for (const scope of directories.reverse()) candidates.push({ path: join(scope, 'AGENTS.md'), scope })
  }
  const globalCandidate = { path: join(globalDirectory, 'AGENTS.md'), scope: 'All workspaces' }
  candidates.push(globalCandidate)
  const loaded: AgentInstructions[] = []
  const seen = new Set<string>()
  let total = 0
  for (const candidate of candidates) {
    // Existence, not nonempty content, determines whether global rules are replaced.
    if (candidate === globalCandidate && seen.size > 0) continue
    let canonical: string
    try { canonical = await realpath(candidate.path) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw new Error('Cannot resolve instructions at ' + candidate.path, { cause: error })
    }
    if (seen.has(canonical)) continue
    seen.add(canonical)
    const handle = await open(canonical, constants.O_RDONLY | constants.O_NONBLOCK)
    try {
      const stat = await handle.stat()
      if (!stat.isFile()) throw new Error('Instructions must be a regular file: ' + candidate.path)
      if (stat.size > MAX_INSTRUCTION_BYTES) throw new Error('Instructions exceed 128 KiB: ' + candidate.path)
      const buffer = Buffer.alloc(MAX_INSTRUCTION_BYTES + 1)
      let size = 0
      while (size < buffer.length) {
        const result = await handle.read(buffer, size, buffer.length - size, null)
        if (result.bytesRead === 0) break
        size += result.bytesRead
      }
      if (size > MAX_INSTRUCTION_BYTES) throw new Error('Instructions exceed 128 KiB: ' + candidate.path)
      total += size
      if (total > MAX_TOTAL_BYTES) throw new Error('Combined instructions exceed 512 KiB')
      const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))
      if (includeEmpty || content.trim()) loaded.push({ ...candidate, content })
    } finally { await handle.close() }
  }
  return loaded
}
