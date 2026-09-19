/**
 * Cline request identity.
 *
 * `recommended-models` and chat gate free promos on `X-CLIENT-TYPE`.
 * Desktop's identity is `cline-desktop`. That is the client that currently
 * publishes `cline-free/kimi-k3`. Catalog and completions send the same
 * identity so the picker and the wire agree.
 */

export const CLINE_CLIENT_TYPE = 'cline-desktop'

const WORKOS_PREFIX = 'workos:'

/** Bearer value Cline's API expects. Store the raw access token; prefix here. */
export function formatClineBearer(accessToken: string): string {
  const token = accessToken.trim()
  return token.toLowerCase().startsWith(WORKOS_PREFIX) ? token : WORKOS_PREFIX + token
}

export function clineAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: 'Bearer ' + formatClineBearer(apiKey),
    'HTTP-Referer': 'https://cline.bot',
    'X-Title': 'Cline',
    'X-CLIENT-TYPE': CLINE_CLIENT_TYPE,
  }
}
