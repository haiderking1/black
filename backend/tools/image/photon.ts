/**
 * The image processing library, loaded on first use.
 *
 * It is a WebAssembly build and about a megabyte, so it is imported when an
 * image is actually read rather than when the server starts. Most sessions
 * never read one.
 *
 * Loading can fail: the wasm file may be missing from a packaged build, or the
 * runtime may refuse the module. Every caller has to cope with null, and
 * degrades to reporting the image rather than decoding it.
 */

export type Photon = typeof import('@silvia-odwyer/photon-node')

let loaded: Photon | null = null
let pending: Promise<Photon | null> | null = null

export async function loadPhoton(): Promise<Photon | null> {
  if (loaded !== null) {
    return loaded
  }
  if (pending !== null) {
    return pending
  }

  pending = (async () => {
    try {
      loaded = await import('@silvia-odwyer/photon-node')
      return loaded
    } catch {
      loaded = null
      return null
    }
  })()

  return pending
}
