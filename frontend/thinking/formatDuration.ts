/**
 * How long reasoning took, phrased for a collapsed header.
 *
 * Sub-second reasoning is reported as a second rather than as a fraction: the
 * number decorates a disclosure control, and "0.4s" is noise.
 */
export function formatThinkingDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'a moment'

  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}

/** The header label for a reasoning block. */
export function thinkingLabel(isStreaming: boolean, durationMs: number | undefined): string {
  if (isStreaming) return 'Thinking'
  if (durationMs === undefined) return 'Thought'
  return `Thought for ${formatThinkingDuration(durationMs)}`
}
