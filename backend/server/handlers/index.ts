import type { BrowserWindow } from 'electron'

import { ServerRpcs } from '../../../contracts/rpc'
import { chatHandlers } from './chat'
import { fsHandlers } from './fs'
import { providerHandlers } from './providers'

/**
 * Every method the server serves.
 *
 * The group declares the surface and this layer implements it, so a missing
 * handler is a type error at startup rather than a failed call at runtime.
 */

export interface HandlerContext {
  windowGetter: () => BrowserWindow | null
}

export function buildHandlers(context: HandlerContext) {
  return ServerRpcs.toLayer({
    ...fsHandlers(context),
    ...providerHandlers(),
    ...chatHandlers(),
  })
}
