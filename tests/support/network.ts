/**
 * Whether this machine can reach the internet.
 *
 * Two suites check black against the vendors rather than against a fixture: the
 * model catalog on the Go endpoint, and the published limits on models.dev.
 * Neither needs a key and neither costs anything, but both need a network.
 *
 * Without this an offline contributor sees two failures that look like their
 * change broke something. Any response at all counts as online, including an
 * error status, because the question is whether the request went out.
 */
export async function isOnline(): Promise<boolean> {
  try {
    await fetch('https://models.dev/api.json', { signal: AbortSignal.timeout(5000) })
    return true
  } catch {
    return false
  }
}
