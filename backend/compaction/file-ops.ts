/**
 * File operation tracking across the messages a compaction discards.
 *
 * Paths are collected cumulatively: a compaction inherits the file lists of the
 * compaction before it, so a long session keeps reporting files that were
 * touched before the previous checkpoint.
 */

import type { AgentMessage, AssistantMessage, CompactionEntry, SessionEntry, ToolCall } from '../sessions/types'
import { isPresent } from './tokens'
import type { CompactionDetails, FileOperations } from './types'

export function createFileOps(): FileOperations {
  return { read: new Set(), written: new Set(), edited: new Set() }
}

/**
 * Record the file path of every read, write, or edit tool call in an assistant
 * message. Calls without a usable path argument are ignored.
 */
export function extractFileOpsFromMessage(message: AgentMessage, fileOps: FileOperations): void {
  if (!isPresent(message) || message.role !== 'assistant') return

  const content = (message as AssistantMessage).content
  if (!Array.isArray(content)) return

  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    if (block.type !== 'toolCall') continue

    const call = block as ToolCall
    const args = call.arguments
    if (!isPresent(args)) continue

    const path = args.path
    if (typeof path !== 'string' || path === '') continue

    switch (call.name) {
      case 'read':
        fileOps.read.add(path)
        break
      case 'write':
        fileOps.written.add(path)
        break
      case 'edit':
        fileOps.edited.add(path)
        break
      default:
        break
    }
  }
}

/**
 * Split collected paths into files only read and files modified. A file that
 * was read and then written counts as modified, not read.
 */
export function computeFileLists(fileOps: FileOperations): { readFiles: string[]; modifiedFiles: string[] } {
  const modified = new Set([...fileOps.edited, ...fileOps.written])
  const readFiles = [...fileOps.read].filter((file) => !modified.has(file)).sort()
  const modifiedFiles = [...modified].sort()
  return { readFiles, modifiedFiles }
}

/** Render the file lists as the tag block appended to a summary. */
export function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
  const sections: string[] = []
  if (readFiles.length > 0) {
    sections.push('<read-files>\n' + readFiles.join('\n') + '\n</read-files>')
  }
  if (modifiedFiles.length > 0) {
    sections.push('<modified-files>\n' + modifiedFiles.join('\n') + '\n</modified-files>')
  }
  if (sections.length === 0) return ''
  return '\n\n' + sections.join('\n\n')
}

/**
 * Collect file operations for a compaction: first the lists carried by the
 * previous compaction entry, then the tool calls in the messages being folded
 * into the new summary.
 */
export function extractFileOperations(
  messages: AgentMessage[],
  entries: SessionEntry[],
  prevCompactionIndex: number,
): FileOperations {
  const fileOps = createFileOps()

  if (prevCompactionIndex >= 0) {
    const entry = entries[prevCompactionIndex]
    if (entry !== undefined && entry.type === 'compaction') {
      const compaction = entry as CompactionEntry<CompactionDetails>
      const details = compaction.details
      if (compaction.fromHook !== true && details !== undefined && details !== null) {
        if (Array.isArray(details.readFiles)) {
          for (const file of details.readFiles) {
            if (typeof file === 'string' && file !== '') fileOps.read.add(file)
          }
        }
        if (Array.isArray(details.modifiedFiles)) {
          for (const file of details.modifiedFiles) {
            if (typeof file === 'string' && file !== '') fileOps.edited.add(file)
          }
        }
      }
    }
  }

  for (const message of messages) {
    if (!isPresent(message)) continue
    extractFileOpsFromMessage(message, fileOps)
  }

  return fileOps
}
