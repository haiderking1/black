/**
 * Turn a pasted callback URL, query string, or bare code into its pieces.
 *
 * The authorize redirect sometimes lands in a browser that cannot reach
 * localhost, so the reader pastes whatever the address bar shows. That can be
 * the full URL, `code=...&state=...`, `code#state`, or just the code.
 */

export function parseAuthorizationInput(input: string): { code?: string; state?: string } {
  const value = input.trim()
  if (value === '') return {}

  try {
    const url = new URL(value)
    return {
      ...(url.searchParams.get('code') !== null ? { code: url.searchParams.get('code') ?? undefined } : {}),
      ...(url.searchParams.get('state') !== null ? { state: url.searchParams.get('state') ?? undefined } : {}),
    }
  } catch {
    // Not a URL.
  }

  if (value.includes('#')) {
    const [code, state] = value.split('#', 2)
    return {
      ...(code !== undefined && code !== '' ? { code } : {}),
      ...(state !== undefined && state !== '' ? { state } : {}),
    }
  }

  if (value.includes('code=')) {
    const params = new URLSearchParams(value)
    return {
      ...(params.get('code') !== null ? { code: params.get('code') ?? undefined } : {}),
      ...(params.get('state') !== null ? { state: params.get('state') ?? undefined } : {}),
    }
  }

  return { code: value }
}
