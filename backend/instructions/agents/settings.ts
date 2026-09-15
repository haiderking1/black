import { createHash, randomUUID } from 'node:crypto'
import { open, realpath, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { loadAgentInstructions, MAX_INSTRUCTION_BYTES, MAX_TOTAL_BYTES } from './load'

function revision(content: string): string { return createHash('sha256').update(content).digest('hex') }

export async function listInstructions(workingDirectory?: string, globalDirectory?: string) {
  const files = await loadAgentInstructions(workingDirectory, globalDirectory, true)
  return { files: files.map(file => ({ ...file, revision: revision(file.content) })), globalExcluded: files.some(file => file.scope !== 'All workspaces') }
}

// Serialize editor saves within this process; revisions detect external edits.
let pending: Promise<unknown> = Promise.resolve()
export function saveInstruction(input: { workingDirectory?: string; path: string; content: string; revision: string }, globalDirectory?: string) {
  const task = pending.then(async () => {
    if (Buffer.byteLength(input.content, 'utf8') > MAX_INSTRUCTION_BYTES) throw new Error('Instructions exceed 128 KiB')
    const snapshot = await listInstructions(input.workingDirectory, globalDirectory)
    const file = snapshot.files.find(file => file.path === input.path)
    if (!file) throw new Error('This instruction file is no longer selected for this workspace. Reload before saving.')
    if (file.revision !== input.revision) throw new Error('This file changed on disk. Reload before saving; your draft has been kept.')
    const totalBytes = snapshot.files.reduce((total, row) => total + Buffer.byteLength(row.path === file.path ? input.content : row.content, 'utf8'), 0)
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Combined instructions exceed 512 KiB')
    const target = await realpath(file.path)
    const source = await open(target, 'r')
    let mode: number
    try { mode = (await source.stat()).mode & 0o777 } finally { await source.close() }
    const temporary = join(dirname(target), '.black-instructions-' + randomUUID())
    try {
      const handle = await open(temporary, 'wx', mode)
      try { await handle.chmod(mode); await handle.writeFile(input.content, 'utf8'); await handle.sync() } finally { await handle.close() }
      const current = (await listInstructions(input.workingDirectory, globalDirectory)).files.find(row => row.path === file.path)
      if (current?.revision !== input.revision || await realpath(file.path) !== target) throw new Error('This file changed on disk. Reload before saving; your draft has been kept.')
      await rename(temporary, target)
    } finally {
      await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error })
    }
    return listInstructions(input.workingDirectory, globalDirectory)
  })
  pending = task.catch(() => {})
  return task
}
