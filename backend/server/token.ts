import { randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Bearer token for one server run.
 *
 * The server listens on the loopback interface, but a loopback port is still
 * reachable by every process on the machine. The token is minted per run, handed
 * only to the renderer that the main process spawned, and required on the
 * upgrade, so another local process cannot attach to the session.
 */

const TOKEN_BYTES = 32

export function mintToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/**
 * Constant-time comparison, so a wrong token cannot be recovered by timing.
 * Length is checked first because timingSafeEqual throws on a length mismatch.
 */
export function tokenMatches(expected: string, candidate: string | undefined): boolean {
  if (typeof candidate !== 'string' || candidate.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))
}
