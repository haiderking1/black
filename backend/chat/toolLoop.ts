import { toolByName } from '../tools/registry'
import { retryModelStream } from './retry/stream'
import { parseToolArguments } from '../tools/parseArguments'
import type { ChatImage, ChatMessage, ChatStreamEvent, ChatUsage, ToolCall } from '../providers/types'
import type { ImageAttachment, ToolContext } from '../tools/types'

/**
 * The turn, which is more than one request.
 *
 * A model that wants to read a file does not read it. It stops, asks for the
 * read, and the answer it gets comes back to it as another message. So one
 * visible turn is a loop: ask, run whatever it asked for, hand the results
 * back, ask again, until it answers without asking for anything.
 *
 * Two things here are load bearing.
 *
 * Every call gets a result. The API requires a message for each tool call id it
 * was given, so a call naming a tool that does not exist, or one whose
 * arguments will not parse, still produces a result. That result is the error.
 * Skipping it leaves the model waiting on an answer that never comes and the
 * next request is rejected.
 *
 * A tool that throws is a result, not a failure. The model gets the error text
 * and can fix what it sent. Failing the turn instead throws away a working
 * conversation over one bad path.

 */

/** What a tool run produced, whether it succeeded or not. */
interface ToolRun {
  content: string
  isError: boolean
  images?: ImageAttachment[]
  details?: unknown
}

async function runOneTool(call: ToolCall, context: ToolContext): Promise<ToolRun> {
  const tool = toolByName(call.name)
  if (tool === undefined) {
    // Naming the tools that do exist is what lets the model correct itself
    // rather than guess at another name.
    return {
      content:
        'There is no tool named ' +
        call.name +
        '. The only available tool is compute. Provider methods are called inside its JavaScript plan.',
      isError: true
    }
  }

  const parsed = parseToolArguments(call)
  if (!parsed.ok) {
    return { content: parsed.error, isError: true }
  }

  try {
    const outcome = await tool.run(parsed.value, context)
    return {
      content: outcome.content,
      isError: outcome.isError ?? false,
      ...(outcome.images === undefined || outcome.images.length === 0 ? {} : { images: outcome.images }),
      ...(outcome.details === undefined ? {} : { details: outcome.details })
    }
  } catch (error) {
    // A wrong path or a failed match is information the model can act on, so it
    // travels back as the result rather than ending the turn.
    return {
      content: error instanceof Error ? error.message : String(error),
      isError: true
    }
  }
}

export interface ToolLoopOptions {
  /** Messages for the first request, system prompt already applied. */
  messages: ChatMessage[]
  /** One model request. Called once per round. */
  stream: (messages: ChatMessage[]) => AsyncGenerator<ChatStreamEvent>
  /** Directory relative paths resolve against. */
  cwd: string
  signal?: AbortSignal
  /**
   * Whether the model can be shown an image. Passed down so a tool that reads
   * one knows whether to decode it or report it.
   */
  acceptsImages?: boolean
}

export async function* runToolLoop(options: ToolLoopOptions): AsyncGenerator<ChatStreamEvent> {
  const messages = [...options.messages]
  const context: ToolContext = {
    cwd: options.cwd,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.acceptsImages === undefined ? {} : { acceptsImages: options.acceptsImages })
  }

  // Read through a call rather than inline. A signal is aborted by something
  // else while this is awaiting, which control flow analysis cannot see, so an
  // inline check after the first one is treated as always false.
  const isAborted = (): boolean => options.signal?.aborted === true

  for (let round = 0; ; round++) {
    if (isAborted()) {
      yield { type: 'done', stopReason: 'aborted' }
      return
    }

    const requested: ToolCall[] = []
    let assistantText = ''
    let thinkingSignature: string | undefined
    let usage: ChatUsage | undefined
    let stopReason: string | undefined

    for await (const event of retryModelStream(() => options.stream(messages), options.signal)) {
      if (event.type === 'text') {
        assistantText += event.text ?? ''
        yield { ...event, round }
        continue
      }
      if (event.thinkingSignature !== undefined) thinkingSignature = event.thinkingSignature
      if (event.type === 'thinking') {
        yield { ...event, round }
        continue
      }
      if (event.type === 'tool_calls') {
        requested.push(...(event.toolCalls ?? []))
        continue
      }
      if (event.type === 'error') {
        yield event
        return
      }
      if (event.type === 'done') {
        // Held back rather than forwarded. This is the end of a round, not the
        // end of the turn, and a reader that saw done would stop listening for
        // the continuation.
        usage = event.usage
        stopReason = event.stopReason
        continue
      }
      // Anything else belongs to the interface rather than to the loop, so it
      // passes straight through. A checkpoint taken between rounds is the
      // clearest case: the reader should see the context shrink as it happens.
      yield event
    }

    if (stopReason === undefined) {
      yield { type: 'error', message: 'Provider connection ended before the round finished.' }
      return
    }

    if (stopReason === 'aborted') {
      yield { type: 'done', stopReason: 'aborted', ...(usage === undefined ? {} : { usage }) }
      return
    }

    // Checked before the calls are announced, not after. Telling the interface
    // that a tool is about to run and then not running it leaves a row in the
    // transcript for work that never happened.
    if (isAborted()) {
      yield { type: 'done', stopReason: 'aborted', ...(usage === undefined ? {} : { usage }) }
      return
    }

    if (requested.length === 0) {
      yield { type: 'done', stopReason: (stopReason ?? 'stop') as 'stop' | 'length', ...(usage === undefined ? {} : { usage }) }
      return
    }

    // The interface is told what is about to run, before it runs, so a slow
    // tool shows up as a wait rather than as a frozen reply.
    yield { type: 'tool_calls', toolCalls: requested, round }

    // The assistant turn that asked is kept with its calls. Without it the
    // results that follow answer questions the model has no record of asking.
    messages.push({ role: 'assistant', content: assistantText, toolCalls: requested,
      ...(thinkingSignature === undefined ? {} : { thinkingSignature }) })

    const collected: ChatImage[] = []

    for (const call of requested) {
      if (isAborted()) {
        yield { type: 'done', stopReason: 'aborted' }
        return
      }

      const result = await runOneTool(call, context)

      yield {
        type: 'tool_result',
        round,
        toolCallId: call.id,
        toolName: call.name,
        toolResult: result.content,
        toolIsError: result.isError,
        ...(result.images === undefined ? {} : { toolImages: result.images }),
        ...(result.details === undefined ? {} : { toolDetails: result.details })
      }

      messages.push({ role: 'tool', toolCallId: call.id, content: result.content })

      for (const image of result.images ?? []) {
        collected.push({ mimeType: image.mimeType, data: image.data })
      }
    }

    // Images go in their own message rather than inside the tool results. A
    // tool result is text as far as the wire is concerned, and there is no
    // field in it for an image, so a read that returned one arrives as text
    // followed by a user turn carrying the picture.
    if (collected.length > 0) {
      messages.push({ role: 'user', content: '', images: collected })
    }
  }

}
