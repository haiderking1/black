/**
 * The wire surface.
 *
 * Every method and topic name crossing between the renderer and the main
 * process is declared here, once. The renderer never invents a channel name and
 * the main process never handles one that is not listed, so a typo is a type
 * error instead of a silent dead call.
 *
 * Naming is dotted and grouped by domain: `fs.listDirectory`, `sessions.list`.
 */

export const FS_METHODS = {
  listDirectory: 'fs.listDirectory',
  openDirectoryDialog: 'fs.openDirectoryDialog',
  openInFiles: 'fs.openInFiles',
  getHomeDir: 'fs.getHomeDir',
  getCwd: 'fs.getCwd',
} as const

/** Provider configuration. Credentials live on the server, never in the renderer. */
export const PROVIDER_METHODS = {
  listProviders: 'providers.list',
  setApiKey: 'providers.setApiKey',
  clearApiKey: 'providers.clearApiKey',
  setEnabled: 'providers.setEnabled',
  listModels: 'providers.listModels',
} as const

/** Chat completions. */
export const CHAT_METHODS = {
  complete: 'chat.complete',
  stream: 'chat.stream',
} as const

/** Methods the main process answers. */
export const METHODS = {
  ...FS_METHODS,
  ...PROVIDER_METHODS,
  ...CHAT_METHODS,
} as const

export type MethodName = (typeof METHODS)[keyof typeof METHODS]

/** Topics the main process pushes to the renderer. */
export const TOPICS = {} as const

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS]
