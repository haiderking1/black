import { createServer } from 'node:net'

/** Loopback only, matching the interface the RPC server binds. */
const BIND_HOST = '127.0.0.1'

/**
 * Ask the OS for an unused port.
 *
 * The listener is closed before the port is returned, so the RPC server can
 * bind it. There is a small race between the two, which is why a failed bind
 * surfaces as a startup error rather than being retried here.
 */
export async function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, BIND_HOST, () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close()
        reject(new Error('Could not determine a free port'))
        return
      }
      const chosen = address.port
      probe.close(() => resolve(chosen))
    })
  })
}
