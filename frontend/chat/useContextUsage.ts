import { useEffect, useState } from 'react'
import * as Effect from 'effect/Effect'

import type { Message } from './types'
import { conversationHistory } from '../working/history'
import { useRpcClient } from '../rpc'

export interface ContextUsage {
  tokens: number
  window: number
}

/**
 * Long enough that a streaming reply does not fire a request per token, short
 * enough that the gauge keeps up with the turn.
 */
const SETTLE_MS = 400

/**
 * How full the model's context is.
 *
 * Measured from the transcript rather than only from the last turn, so the
 * reading exists the moment a conversation is open. Feeding it from the done
 * event alone meant it vanished on restart and only came back once a message was
 * sent, which described the one moment it was least useful.
 *
 * The same estimator the server compacts against, so the gauge and the trigger
 * agree about when the context is nearly full. A provider reported count would
 * be exact for the last request and wrong for every edit since.
 */
export function useContextUsage(
  providerId: string,
  model: string | null,
  messages: readonly Message[]
): ContextUsage | null {
  const client = useRpcClient()
  const [usage, setUsage] = useState<ContextUsage | null>(null)

  // Identity of the transcript, so the effect runs when it changes rather than
  // on every render.
  const history = conversationHistory(messages)
  const signature = JSON.stringify(history)

  useEffect(() => {
    if (client === null || model === null || model === '') return

    let cancelled = false

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await Effect.runPromise(
            client['chat.contextUsage']({
              providerId,
              model,
              messages: history
            })
          )

          if (cancelled) return

          // No window means no denominator, and a gauge without one is a
          // decoration. Better to show nothing.
          setUsage(
            result.contextWindow === null
              ? null
              : { tokens: result.tokens, window: result.contextWindow }
          )
        } catch {
          if (!cancelled) setUsage(null)
        }
      })()
    }, SETTLE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // `messages` is read through the signature, which changes with its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, providerId, model, signature])

  return usage
}
