import { describe, expect, it } from 'bun:test'
import { compact } from '../backend/compaction/compact'
import { prepareCompaction } from '../backend/compaction/prepare'
import { estimateMessagesTokens } from '../backend/compaction/tokens'
import type { SummarizationCall } from '../backend/compaction/types'
import { BRANCH_SUMMARY_PREFIX, BRANCH_SUMMARY_SUFFIX, convertToLlm } from '../backend/sessions/messages'
import { SessionManager, type AppendableMessage } from '../backend/sessions/manager'
import type { AssistantMessage, Usage } from '../backend/sessions/types'

const ZERO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

/** 400 characters estimates to 100 tokens, so every message costs the same. */
function text(prefix: string): string {
  return prefix + 'x'.repeat(Math.max(0, 400 - prefix.length))
}

function userMessage(label: string): AppendableMessage {
  return { role: 'user', content: text(label), timestamp: 1 }
}

function assistantMessage(label: string): AppendableMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: text(label) }],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage: ZERO_USAGE,
    stopReason: 'stop',
    timestamp: 1,
  }
}

function fill(session: SessionManager, turns: number, offset = 0): void {
  for (let i = 0; i < turns; i++) {
    session.appendMessage(userMessage('u' + (i + offset)))
    session.appendMessage(assistantMessage('a' + (i + offset)))
  }
}

function stubCall(text = 'SUMMARY'): SummarizationCall {
  return async (): Promise<AssistantMessage> => ({
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'test',
    provider: 'test',
    model: 'test',
    usage: { ...ZERO_USAGE, input: 5, totalTokens: 5 },
    stopReason: 'stop',
    timestamp: 1,
  })
}

const SETTINGS = { enabled: true, reserveTokens: 1000, keepRecentTokens: 300 }

describe('compaction pipeline', () => {
  it('shrinks the context and keeps one checkpoint', async () => {
    const session = SessionManager.inMemory('/project')
    fill(session, 10)

    const before = session.buildSessionContext().messages
    expect(before).toHaveLength(20)

    const plan = prepareCompaction(session.getEntries(), SETTINGS)
    expect(plan).toBeDefined()

    const result = await compact(plan!, { reserveTokens: SETTINGS.reserveTokens, call: stubCall() })
    session.appendCompaction(result.summary, result.firstKeptEntryId, result.tokensBefore, result.details, false, result.usage)

    const after = session.buildSessionContext().messages
    expect(after.length).toBeLessThan(before.length)
    expect(after[0]!.role).toBe('compactionSummary')
    expect(after).toHaveLength(4)
    expect((after[0] as { summary: string }).summary).toContain('SUMMARY')
  })

  it('refuses a second compaction until new messages arrive', async () => {
    const session = SessionManager.inMemory('/project')
    fill(session, 10)
    const plan = prepareCompaction(session.getEntries(), SETTINGS)!
    const result = await compact(plan, { reserveTokens: SETTINGS.reserveTokens, call: stubCall() })
    session.appendCompaction(result.summary, result.firstKeptEntryId, result.tokensBefore)

    expect(prepareCompaction(session.getEntries(), SETTINGS)).toBe(undefined)
  })

  it('carries the previous summary into a later compaction', async () => {
    const session = SessionManager.inMemory('/project')
    fill(session, 10)
    const first = prepareCompaction(session.getEntries(), SETTINGS)!
    const firstResult = await compact(first, { reserveTokens: SETTINGS.reserveTokens, call: stubCall('FIRST') })
    session.appendCompaction(firstResult.summary, firstResult.firstKeptEntryId, firstResult.tokensBefore)

    fill(session, 10, 100)
    const second = prepareCompaction(session.getEntries(), SETTINGS)
    expect(second).toBeDefined()
    expect(second!.previousSummary).toContain('FIRST')

    const secondResult = await compact(second!, { reserveTokens: SETTINGS.reserveTokens, call: stubCall('SECOND') })
    session.appendCompaction(secondResult.summary, secondResult.firstKeptEntryId, secondResult.tokensBefore)

    const messages = session.buildSessionContext().messages
    expect(messages[0]!.role).toBe('compactionSummary')
    expect((messages[0] as { summary: string }).summary).toContain('SECOND')
  })

  it('measures the rebuilt context the way the session layer does', async () => {
    const session = SessionManager.inMemory('/project')
    fill(session, 10)

    const plan = prepareCompaction(session.getEntries(), SETTINGS)!
    const result = await compact(plan, { reserveTokens: SETTINGS.reserveTokens, call: stubCall() })

    // pi's session layer appends first, rebuilds, then measures. The field is on
    // CompactionResult but only a caller with the rebuilt context can fill it in.
    session.appendCompaction(result.summary, result.firstKeptEntryId, result.tokensBefore)
    result.estimatedTokensAfter = estimateMessagesTokens(session.buildSessionContext().messages)

    expect(result.estimatedTokensAfter).toBeLessThan(result.tokensBefore)
    expect(result.tokensBefore).toBe(2000)
  })

  it('round-trips a branch summary through the session', () => {
    const session = SessionManager.inMemory('/project')
    fill(session, 2)

    session.appendBranchSummary('explored another branch', 'u1', { readFiles: ['/a.ts'], modifiedFiles: [] })
    const messages = session.buildSessionContext().messages

    expect(messages).toHaveLength(5)
    expect(messages[4]!.role).toBe('branchSummary')
    expect(convertToLlm(messages)[4]!.content).toEqual([
      { type: 'text', text: BRANCH_SUMMARY_PREFIX + 'explored another branch' + BRANCH_SUMMARY_SUFFIX },
    ])
  })

  it('records the file operations of a compaction on a real session', async () => {
    const session = SessionManager.inMemory('/project')
    session.appendMessage({
      role: 'assistant',
      content: [{ type: 'toolCall', id: 't1', name: 'edit', arguments: { path: '/edited.ts' } }],
      api: 'test',
      provider: 'test',
      model: 'test',
      usage: ZERO_USAGE,
      stopReason: 'stop',
      timestamp: 1,
    })
    fill(session, 3)

    const plan = prepareCompaction(session.getEntries(), { ...SETTINGS, keepRecentTokens: 100 })!
    const result = await compact(plan, { reserveTokens: SETTINGS.reserveTokens, call: stubCall() })
    expect(result.summary).toContain('<modified-files>\n/edited.ts\n</modified-files>')
  })
})
