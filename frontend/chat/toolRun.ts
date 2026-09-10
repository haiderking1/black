import type { ToolCall, ImageAttachment } from '../../contracts/chat'

export interface ToolRun {
  id: string
  name: string
  args: string
  result?: string
  interrupted?: boolean
  isError?: boolean
  diff?: string
  path?: string
  offset?: number
  limit?: number
  lines?: number
  images?: readonly ImageAttachment[]
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

function numberField(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

export interface ToolArguments {
  path?: string
  offset?: number
  limit?: number
  lines?: number
}

export function readToolArguments(name: string, args: string): ToolArguments {
  const parsed = readArgs(args)
  if (parsed === undefined) {
    return {}
  }

  const path = stringField(parsed, 'path')
  const facts: ToolArguments = path === undefined ? {} : { path }

  if (name === 'read') {
    const offset = numberField(parsed, 'offset')
    const limit = numberField(parsed, 'limit')
    return {
      ...facts,
      ...(offset === undefined ? {} : { offset }),
      ...(limit === undefined ? {} : { limit })
    }
  }

  if (name === 'write') {
    const content = parsed['content']
    if (typeof content !== 'string') return facts
    return { ...facts, lines: content === '' ? 0 : content.split('\n').length - (content.endsWith('\n') ? 1 : 0) }
  }

  return facts
}

export function startToolRun(call: ToolCall): ToolRun {
  return {
    id: call.id,
    name: call.name,
    args: call.arguments,
    ...readToolArguments(call.name, call.arguments)
  }
}

export function finishToolRun(
  run: ToolRun,
  result: string,
  isError: boolean,
  details: unknown,
  images?: readonly ImageAttachment[]
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
    ...(text === undefined ? {} : { path: text }),
    ...(images === undefined || images.length === 0 ? {} : { images })
  }
}

export function imageDataUrl(image: ImageAttachment): string {
  return 'data:' + image.mimeType + ';base64,' + image.data
}

export function isRunning(run: ToolRun): boolean {
  return run.result === undefined && run.interrupted !== true
}

export function applyToolResult(
  runs: readonly ToolRun[],
  callId: string,
  result: string,
  isError: boolean,
  details: unknown,
  images?: readonly ImageAttachment[]
): ToolRun[] {
  let matched = false
  const next = runs.map((run) => {
    if (run.id !== callId) {
      return run
    }
    matched = true
    return finishToolRun(run, result, isError, details, images)
  })

  if (matched) {
    return next
  }

  const orphan = startToolRun({ id: callId, name: 'tool', arguments: '' })
  return [...next, finishToolRun(orphan, result, isError, details, images)]
}
