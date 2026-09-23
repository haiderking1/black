/** OpenAI-compatible gateways require reasoning_details to be an array of records. */
function isDetailList(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && value.every(
    detail => typeof detail === 'object' && detail !== null && !Array.isArray(detail),
  )
}

/** Read a saved signature only when it can be sent as reasoning_details. */
export function parseReasoningDetails(signature: string): Record<string, unknown>[] | undefined {
  try {
    const value: unknown = JSON.parse(signature)
    return isDetailList(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** Ignore malformed upstream metadata instead of storing a replay payload that breaks the next turn. */
export function serializeReasoningDetails(value: unknown): string | undefined {
  if (!isDetailList(value)) return undefined
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}
