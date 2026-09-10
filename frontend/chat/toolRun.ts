import type { ToolCall } from '../../contracts/chat'

/**
 * One tool call, as the transcript holds it.
 *
 * The arguments arrive as the text the model wrote, so they are read
 * defensively here: a summary is for a human glancing at the row, and it must
 * not be the thing that throws when a model sends something malformed. The raw
 * text is kept either way, because a call that failed to parse is exactly the
 * call worth being able to look at.
 */
export interface ToolRun {
  id: string
  name: string
  /** One line naming what the call touches. */
  summary: string
  /** The arguments exactly as the model sent them. */
  args: string
  /** Set once the call finished. */
  result?: string
  isError?: boolean
  /** Present for an edit, which has a diff worth showing. */
  diff?: string
  path?: string
}

function readArgs(args: string): Record<string, unknown> | undefined {
  const trimmed = args.trim()
  if (trimmed.length === 0) {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

function stringField(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** What this call touches, in as few words as the arguments allow. */
export function describeToolRun(name: string, args: string): { summary: string; path?: string } {
  const parsed = readArgs(args)

  if (parsed === undefined) {
    // The model sent something unreadable, so the row says that rather than
    // pretending to know what it was for.
    return { summary: 'unreadable arguments' }
  }

  const path = stringField(parsed, 'path')

  if (name === 'read') {
    const offset = typeof parsed['offset'] === 'number' ? parsed['offset'] : undefined
    const limit = typeof parsed['limit'] === 'number' ? parsed['limit'] : undefined
    const range =
      offset === undefined && limit === undefined
        ? ''
        : offset === undefined
          ? ' first ' + String(limit) + ' lines'
          : ' from line ' + String(offset) + (limit === undefined ? '' : ' (' + String(limit) + ')')
    return { summary: (path ?? 'no path given') + range, ...(path === undefined ? {} : { path }) }
  }

  if (name === 'write') {
    const content = typeof parsed['content'] === 'string' ? parsed['content'] : ''
    const lines = content === '' ? 0 : content.split('\n').length
    return {
      summary: (path ?? 'no path given') + ' (' + String(lines) + ' lines)',
      ...(path === undefined ? {} : { path })
    }
  }

  if (name === 'edit') {
    const edits = parsed['edits']
    const count = Array.isArray(edits) ? edits.length : 0
    const label = count === 1 ? '1 edit' : String(count) + ' edits'
    return {
      summary: (path ?? 'no path given') + ' (' + label + ')',
      ...(path === undefined ? {} : { path })
    }
  }

  return { summary: path ?? 'no arguments', ...(path === undefined ? {} : { path }) }
}

export function startToolRun(call: ToolCall): ToolRun {
  const described = describeToolRun(call.name, call.arguments)
  return {
    id: call.id,
    name: call.name,
    summary: described.summary,
    args: call.arguments,
    ...(described.path === undefined ? {} : { path: described.path })
  }
}

/** Fold a result into the run that was waiting for it. */
export function finishToolRun(
  run: ToolRun,
  result: string,
  isError: boolean,
  details: unknown
): ToolRun {
  const diff =
    details !== null && typeof details === 'object' && typeof (details as Record<string, unknown>)['diff'] === 'string'
      ? ((details as Record<string, unknown>)['diff'] as string)
      : undefined

  const text =
    details !== null && typeof details === 'object' && typeof (details as Record<string, unknown>)['path'] === 'string'
      ? ((details as Record<string, unknown>)['path'] as string)
      : undefined

  return {
    ...run,
    result,
    isError,
    ...(diff === undefined ? {} : { diff }),
    ...(text === undefined ? {} : { path: text })
  }
}

/** Calls whose results have not arrived yet, for the running indicator. */
export function isRunning(run: ToolRun): boolean {
  return run.result === undefined
}

/**
 * Fold one result into the list it belongs to.
 *
 * A result whose call is not in the list would otherwise disappear. This
 * client's own loop always announces a call before running it, so that pairing
 * is not something to rely on quietly: losing a result leaves a row spinning
 * forever and nothing on screen saying why.
 */
export function applyToolResult(
  runs: readonly ToolRun[],
  callId: string,
  result: string,
  isError: boolean,
  details: unknown
): ToolRun[] {
  let matched = false
  const next = runs.map((run) => {
    if (run.id !== callId) {
      return run
    }
    matched = true
    return finishToolRun(run, result, isError, details)
  })

  if (matched) {
    return next
  }

  const orphan = startToolRun({ id: callId, name: 'tool', arguments: '' })
  return [...next, finishToolRun(orphan, result, isError, details)]
}
