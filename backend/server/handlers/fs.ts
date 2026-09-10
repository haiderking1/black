import * as Effect from 'effect/Effect'
import type { BrowserWindow } from 'electron'

import { FsError } from '../../../contracts/errors'
import { METHODS } from '../../../contracts/methods'
import { openDirectoryDialog } from '../../fs/dialog'
import { listDirectory } from '../../fs/navigator'
import { openInFiles } from '../../fs/open'

/**
 * Filesystem handlers.
 *
 * Each handler lifts an existing Electron-side function into an Effect, so a
 * rejection becomes a typed FsError the client can branch on rather than a
 * string it has to parse.
 */

export interface FsHandlerContext {
  windowGetter: () => BrowserWindow | null
}

function asFsError(error: unknown): FsError {
  return new FsError({ message: error instanceof Error ? error.message : String(error) })
}

export function fsHandlers(context: FsHandlerContext) {
  return {
    [METHODS.listDirectory]: (payload: { path?: string }) =>
      Effect.tryPromise({
        try: () => listDirectory(payload.path),
        catch: asFsError,
      }),

    [METHODS.openDirectoryDialog]: () =>
      Effect.tryPromise({
        try: () => openDirectoryDialog(context.windowGetter()),
        catch: asFsError,
      }),

    [METHODS.openInFiles]: (payload: { path: string }) =>
      Effect.tryPromise({
        try: () => openInFiles(payload.path),
        catch: asFsError,
      }),

    [METHODS.getHomeDir]: () => Effect.sync(() => homedir()),

    [METHODS.getCwd]: () => Effect.sync(() => process.cwd()),
  }
}

function homedir(): string {
  return process.env['HOME'] ?? ''
}
