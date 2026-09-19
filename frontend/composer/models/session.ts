/**
 * This-run catalog fetch state.
 *
 * Disk can remember last session's list. This set is only the catalogs we
 * already paid for since the process started, so a picker remount does not
 * hit the wire again.
 */

const warmed = new Set<string>()
const inflight = new Map<string, Promise<readonly unknown[]>>()

export function isCatalogWarmed(providerId: string): boolean {
  return providerId !== '' && warmed.has(providerId)
}

export function markCatalogWarmed(providerId: string): void {
  if (providerId === '') return
  warmed.add(providerId)
}

export function forgetCatalogWarm(providerId: string): void {
  warmed.delete(providerId)
}

export function catalogInflight<T>(providerId: string): Promise<readonly T[]> | undefined {
  return inflight.get(providerId) as Promise<readonly T[]> | undefined
}

export function setCatalogInflight<T>(providerId: string, request: Promise<readonly T[]>): void {
  inflight.set(providerId, request as Promise<readonly unknown[]>)
}

export function clearCatalogInflight<T>(providerId: string, request: Promise<readonly T[]>): void {
  if (inflight.get(providerId) === request) inflight.delete(providerId)
}

/** Tests must not inherit warm/inflight from a previous case. */
export function resetCatalogSession(): void {
  warmed.clear()
  inflight.clear()
}
