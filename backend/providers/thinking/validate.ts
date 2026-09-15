import type { ThinkingSupport } from '../types'

/** Only send effort values verified for this exact provider model. */
export async function verifiedThinkingRequest<T extends { model: string; reasoningEffort?: string; signal?: AbortSignal }>(
  request: T,
  thinkingFor: (model: string) => Promise<ThinkingSupport>,
): Promise<Omit<T, 'reasoningEffort'> & { reasoningEffort?: string }> {
  const effort = request.reasoningEffort
  if (effort === undefined) return request
  if (effort !== 'default' && effort !== 'off') {
    try {
      const support = await new Promise<ThinkingSupport | undefined>((resolve, reject) => {
        const finish = (value?: ThinkingSupport) => { cleanup(); resolve(value) }
        const abort = () => finish()
        const timer = setTimeout(abort, 5000)
        const cleanup = () => { clearTimeout(timer); request.signal?.removeEventListener('abort', abort) }
        if (request.signal?.aborted) { finish(); return }
        request.signal?.addEventListener('abort', abort, { once: true })
        Promise.resolve().then(() => thinkingFor(request.model)).then(finish, error => { cleanup(); reject(error) })
      })
      if (support?.kind === 'effort' && support.levels.includes(effort)) return request
    } catch {
      // Missing metadata must not break chat or authorize an unverified value.
    }
  }
  const result = { ...request }
  delete result.reasoningEffort
  return result
}
