/**
 * Turn a pasted callback URL, query string, or bare code into its pieces.
 *
 * Cline's redirect can include `provider` next to `code`. A browser that
 * cannot reach the loopback host leaves the reader pasting the address bar.
 */

export function parseAuthorizationInput(input: string): { code?: string; provider?: string; state?: string } {
  const value = input.trim()
  if (value === '') return {}

  try {
    const url = new URL(value)
    return {
      ...(url.searchParams.get('code') !== null ? { code: url.searchParams.get('code') ?? undefined } : {}),
      ...(url.searchParams.get('provider') !== null ? { provider: url.searchParams.get('provider') ?? undefined } : {}),
      ...(url.searchParams.get('state') !== null ? { state: url.searchParams.get('state') ?? undefined } : {}),
    }
  } catch {
    // Not a URL.
  }

  if (value.includes('code=')) {
    const params = new URLSearchParams(value)
    return {
      ...(params.get('code') !== null ? { code: params.get('code') ?? undefined } : {}),
      ...(params.get('provider') !== null ? { provider: params.get('provider') ?? undefined } : {}),
      ...(params.get('state') !== null ? { state: params.get('state') ?? undefined } : {}),
    }
  }

  return { code: value }
}
