import { ServerRpcs } from '../../../contracts/rpc'
import { chatHandlers } from './chat'
import { instructionHandlers } from './instructions'
import { fsHandlers } from './fs'
import { providerHandlers } from './providers'
import { shell, type BrowserWindow } from 'electron'

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
    ...providerHandlers({
      openUrl: async (url) => {
        await shell.openExternal(url)
      },
    }),
    ...chatHandlers(),
    ...instructionHandlers(),
  })
}
