import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * One file, one writer at a time.
 *
 * A model will happily emit three write calls for the same file in one turn.
 * Two of them read the file, both compute a result from the version they read,
 * and the second write silently discards the first. Serializing per path makes
 * each one start from what the previous one left.
 *
 * Different files still run in parallel, so this costs nothing in the common
 * case where the calls are unrelated.
 */

const queues = new Map<string, Promise<void>>()

/**
 * Key by the real path, not the path as written.
 *
 * "./src/a.ts", "src/a.ts" and a symlink to "src/a.ts" are one file. Keying on
 * the string would let three writers in.
 */
async function queueKey(filePath: string): Promise<string> {
  const resolved = resolve(filePath)
  try {
    return await realpath(resolved)
  } catch (error) {
    // A file being created has no real path yet. Its resolved path is the best
    // name available, and it is the same name a later create would produce.
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return resolved
    }
    throw error
  }
}

let registration: Promise<void> = Promise.resolve()

export async function withFileMutationQueue<T>(filePath: string, run: () => Promise<T>): Promise<T> {
  // Registering the queue itself has to be serialized: two callers resolving
  // the same key at once would both read an empty map and both start writing.
  const registered = registration.then(async () => {
    const key = await queueKey(filePath)
    const current = queues.get(key) ?? Promise.resolve()

    let release!: () => void
    const next = new Promise<void>((resolveNext) => {
      release = resolveNext
    })
    const chained = current.then(() => next)
    queues.set(key, chained)

    return { key, current, chained, release }
  })
  // A failed registration must not wedge the queue for every later file.
  registration = registered.then(
    () => undefined,
    () => undefined
  )

  const { key, current, chained, release } = await registered
  await current
  try {
    return await run()
  } finally {
    release()
    // Only the last waiter clears the entry, so a queued successor still sees
    // it. Deleting unconditionally would let a third writer start early.
    if (queues.get(key) === chained) {
      queues.delete(key)
    }
  }
}
