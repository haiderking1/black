/**
 * Streamed replies that are still running, so one can be stopped by id.
 *
 * A stream cannot be stopped by the side reading it. Dropping the reader ends
 * the socket, but the request upstream keeps generating until it finishes,
 * because nothing has told it to stop. The tokens still get produced and still
 * get billed, and the renderer keeps paying for an answer it has walked away
 * from.
 *
 * Stopping means aborting the request itself, and only the side holding the
 * signal can do that. This is where that signal lives between the call that
 * created it and the call that ends it.
 */
const controllers = new Map<string, AbortController>()

/**
 * Opens a request and returns the controller to hand to the transport.
 *
 * An id already in flight is aborted first. Reusing one would otherwise strand
 * the earlier request with no way left to reach it, and leak its controller.
 */
export function beginRequest(requestId: string): AbortController {
  abortRequest(requestId)

  const controller = new AbortController()
  controllers.set(requestId, controller)
  return controller
}

/** Aborts a request. Reports whether there was one to abort. */
export function abortRequest(requestId: string): boolean {
  const controller = controllers.get(requestId)
  if (controller === undefined) return false

  controllers.delete(requestId)
  controller.abort()
  return true
}

/**
 * Closes a request that finished on its own.
 *
 * The controller is checked before removing: a request restarted under the same
 * id is a different controller, and the earlier one finishing must not remove it.
 */
export function endRequest(requestId: string, controller: AbortController): void {
  if (controllers.get(requestId) === controller) controllers.delete(requestId)
}

/** How many requests are open. Exists for tests and diagnostics. */
export function openRequestCount(): number {
  return controllers.size
}
