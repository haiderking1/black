import type { ChatRoute } from '../../../contracts/chat'
import { readRoute, toChatRoute, type RouteStorage } from '../../composer/routing/storage'
import { newRequestId } from '../requestId'
import type { Message } from '../types'
import type { QueuedSend } from './queue'

export function retryImages(
  images: Message['images']
): Array<{ mimeType: string; data: string }> {
  return (images ?? []).map((image) => ({ mimeType: image.mimeType, data: image.data }))
}

export function retryRoute(
  providerId: string,
  model: string | undefined,
  storage?: RouteStorage | null
): ChatRoute | undefined {
  if (providerId !== 'openrouter' || model === undefined || model === '') return undefined
  return toChatRoute(readRoute(model, storage))
}

export function capturedWorkingDirectory(path: string | undefined): string | undefined {
  if (path === undefined || path === '') return undefined
  return path
}

/** Rebuild the send for a user turn whose assistant reply died. */
export function buildRetrySend(input: {
  sessionId: string
  user: Message
  model: string | undefined
  providerId: string
  thinkingLevel: string
  workingDirectory?: string
  routeStorage?: RouteStorage | null
}): QueuedSend {
  const images = retryImages(input.user.images)
  const route = retryRoute(input.providerId, input.model, input.routeStorage)
  const workingDirectory = capturedWorkingDirectory(input.workingDirectory)
  return {
    requestId: newRequestId(),
    sessionId: input.sessionId,
    messageId: input.user.id,
    content: input.user.content,
    options: {
      ...(input.model === undefined || input.model === '' ? {} : { model: input.model }),
      thinkingLevel: input.thinkingLevel,
      ...(route === undefined ? {} : { route }),
      ...(images.length === 0 ? {} : { images })
    },
    providerId: input.providerId,
    ...(route === undefined ? {} : { route }),
    ...(workingDirectory === undefined ? {} : { workingDirectory }),
    images
  }
}
