import type {
  AgentMessage,
  Message,
  Usage,
} from './types'

/** Backtick, kept out of source strings so markdown fences survive linting. */
const TICK = String.fromCharCode(96)

/** ISO strings that fail to parse fall back to the epoch rather than NaN. */
function parseTimestampToMs(timestamp: string): number {
  const parsed = new Date(timestamp).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Convert a bash execution message to user message text for LLM context.
 */
export function bashExecutionToText(msg: {
  command: string
  output: string
  exitCode: number | undefined
  cancelled: boolean
  truncated: boolean
  fullOutputPath?: string
}): string {
  let text = 'Ran ' + TICK + msg.command + TICK + '\n'
  if (msg.output !== '') {
    text += TICK + TICK + TICK + '\n' + msg.output + '\n' + TICK + TICK + TICK
  } else {
    text += '(no output)'
  }
  if (msg.cancelled) {
    text += '\n\n(command cancelled)'
  } else if (msg.exitCode !== null && msg.exitCode !== undefined && msg.exitCode !== 0) {
    text += '\n\nCommand exited with code ' + String(msg.exitCode)
  }
  if (msg.truncated && msg.fullOutputPath !== undefined) {
    text += '\n\n[Output truncated. Full output: ' + msg.fullOutputPath + ']'
  }
  return text
}

export function createCustomMessage(
  customType: string,
  content: string | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>,
  display: boolean,
  details: unknown | undefined,
  timestamp: string,
): {
  role: 'custom'
  customType: string
  content: string | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>
  display: boolean
  details?: unknown
  timestamp: number
} {
  return {
    role: 'custom',
    customType,
    content,
    display,
    details,
    timestamp: parseTimestampToMs(timestamp),
  }
}

export function createBranchSummaryMessage(summary: string, fromId: string, timestamp: string): {
  role: 'branchSummary'
  summary: string
  fromId: string
  timestamp: number
} {
  return {
    role: 'branchSummary',
    summary,
    fromId,
    timestamp: parseTimestampToMs(timestamp),
  }
}

export function createCompactionSummaryMessage(summary: string, tokensBefore: number, timestamp: string): {
  role: 'compactionSummary'
  summary: string
  tokensBefore: number
  timestamp: number
} {
  return {
    role: 'compactionSummary',
    summary,
    tokensBefore,
    timestamp: parseTimestampToMs(timestamp),
  }
}

export const COMPACTION_SUMMARY_PREFIX =
  'The conversation history before this point was compacted into the following summary:\n\n<summary>\n'
export const COMPACTION_SUMMARY_SUFFIX = '\n</summary>'
export const BRANCH_SUMMARY_PREFIX =
  'The following is a summary of a branch that this conversation came back from:\n\n<summary>\n'
export const BRANCH_SUMMARY_SUFFIX = '</summary>'

/**
 * Transform agent messages (including UI-only custom types) to the base
 * message types an LLM understands. UI-only messages that cannot be converted
 * are dropped. Used by compaction and by anything that calls a model directly.
 */
export function convertToLlm(messages: AgentMessage[]): Message[] {
  const converted: Message[] = []

  for (const message of messages) {
    switch (message.role) {
      case 'bashExecution':
        if (message.excludeFromContext === true) break
        converted.push({
          role: 'user',
          content: [{ type: 'text', text: bashExecutionToText(message) }],
          timestamp: message.timestamp,
        })
        break
      case 'custom': {
        const content =
          typeof message.content === 'string'
            ? [{ type: 'text' as const, text: message.content }]
            : message.content
        converted.push({ role: 'user', content, timestamp: message.timestamp })
        break
      }
      case 'branchSummary':
        converted.push({
          role: 'user',
          content: [
            { type: 'text' as const, text: BRANCH_SUMMARY_PREFIX + message.summary + BRANCH_SUMMARY_SUFFIX },
          ],
          timestamp: message.timestamp,
        })
        break
      case 'compactionSummary':
        converted.push({
          role: 'user',
          content: [
            { type: 'text' as const, text: COMPACTION_SUMMARY_PREFIX + message.summary + COMPACTION_SUMMARY_SUFFIX },
          ],
          timestamp: message.timestamp,
        })
        break
      case 'user':
      case 'assistant':
      case 'toolResult':
        converted.push(message)
        break
      default:
        break
    }
  }

  return converted
}

export interface SessionUsageTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
}

/** Sum usage across entries, ignoring malformed or missing usage records. */
export function sumUsage(usages: Array<Usage | undefined>): SessionUsageTotals {
  const totals: SessionUsageTotals = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }

  for (const usage of usages) {
    if (usage === undefined || typeof usage !== 'object' || usage === null) continue
    totals.input += safeNumber(usage.input)
    totals.output += safeNumber(usage.output)
    totals.cacheRead += safeNumber(usage.cacheRead)
    totals.cacheWrite += safeNumber(usage.cacheWrite)
    totals.totalTokens += safeNumber(usage.totalTokens)
    const cost = usage.cost
    if (cost !== undefined && cost !== null && typeof cost === 'object') {
      totals.cost.input += safeNumber(cost.input)
      totals.cost.output += safeNumber(cost.output)
      totals.cost.cacheRead += safeNumber(cost.cacheRead)
      totals.cost.cacheWrite += safeNumber(cost.cacheWrite)
      totals.cost.total += safeNumber(cost.total)
    }
  }

  return totals
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
