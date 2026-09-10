import React from 'react'

import { formatTokens } from '../format/tokens'
import './context-ring.css'

export interface ContextRingProps {
  /** Prompt tokens of the last request, or null before one has completed. */
  tokens: number | null
  /** What the model can hold, or null when it was not reported. */
  contextWindow: number | null
}

/**
 * Radius and stroke of the drawn track, in the viewBox units below.
 *
 * The viewBox is 20 across, so a radius of 9 with a stroke of 2 puts the outer
 * edge at 10: the ring fills the whole box rather than floating inside it.
 *
 * The box is 28 against the send button's 32 on purpose. A bright outline reads
 * larger than a filled disc of the same diameter, and at 32 the ring visibly
 * overhung the button beside it. Match it dimensionally and it looks wrong;
 * match it optically and it looks right.
 */
const RADIUS = 9
const STROKE = 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * How full the model's context is.
 *
 * Reads the prompt tokens the provider reported for the last request against the
 * window that came with them, so the two always describe the same model. Both
 * arrive on the done event; before the first turn completes there is nothing
 * real to show, and a ring drawn from a guess would be a decoration rather than
 * a measurement.
 *
 * The threshold that matters is ninety per cent, because that is where
 * compaction fires. Above it the ring switches to the brighter colour, so the
 * jump in the transcript has an explanation on screen before it happens.
 */
export function ContextRing({ tokens, contextWindow }: ContextRingProps): React.JSX.Element | null {
  if (tokens === null || contextWindow === null || contextWindow <= 0) return null

  const used = Math.min(1, Math.max(0, tokens / contextWindow))
  const full = used >= 0.9
  const percent = Math.round(used * 100)

  return (
    <span
      className={full ? 'context-ring full' : 'context-ring'}
      role="img"
      aria-label={`Context ${percent} per cent full`}
      title={`${formatTokens(tokens)} of ${formatTokens(contextWindow)} tokens (${percent}%)`}
    >
      <svg width="28" height="28" viewBox="0 0 20 20" aria-hidden="true">
        <circle className="context-ring-track" cx="10" cy="10" r={RADIUS} strokeWidth={STROKE} />
        <circle
          className="context-ring-fill"
          cx="10"
          cy="10"
          r={RADIUS}
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - used)}
        />
      </svg>
    </span>
  )
}
