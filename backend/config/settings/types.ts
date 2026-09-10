/** Thinking budget levels accepted by providers, ordered weakest to strongest. */
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Wire transport used to talk to providers. */
export type TransportSetting = 'sse' | 'websocket' | 'websocket-cached' | 'auto'

/** What to do when opening a project that has not been trusted yet. */
export type DefaultProjectTrust = 'ask' | 'always' | 'never'

export interface CompactionSettings {
  enabled?: boolean // default: true
  reserveTokens?: number // default: 16384
  keepRecentTokens?: number // default: 20000
}

export interface ProviderRetrySettings {
  timeoutMs?: number // SDK/provider request timeout in milliseconds
  maxRetries?: number // SDK/provider retry attempts
  maxRetryDelayMs?: number // default: 60000 (max server-requested delay before failing)
}

export interface RetrySettings {
  enabled?: boolean // default: true
  maxRetries?: number // default: 3
  baseDelayMs?: number // default: 2000 (exponential backoff: 2s, 4s, 8s)
  provider?: ProviderRetrySettings
}

export interface ImageSettings {
  autoResize?: boolean // default: true (resize images to 2000x2000 max for provider compatibility)
  blockImages?: boolean // default: false - when true, prevents all images from being sent to providers
}

export interface ThinkingBudgetsSettings {
  minimal?: number
  low?: number
  medium?: number
  high?: number
}

/**
 * Package source for npm/git packages.
 * - String form: load all resources from the package
 * - Object form: filter which resources to load
 * - autoload=false: start empty and only apply explicit resource patterns
 */
export type PackageSource =
  | string
  | {
      source: string
      autoload?: boolean
      extensions?: string[]
      skills?: string[]
      prompts?: string[]
      themes?: string[]
    }

/**
 * Persistent settings stored in ~/.black/agent/settings.json (global) and
 * <project>/.black/settings.json (project). Fields black's backend consumes.
 */
export interface Settings {
  lastChangelogVersion?: string
  defaultProvider?: string
  defaultModel?: string
  defaultThinkingLevel?: ThinkingLevel
  /** Per-model default thinking level overrides keyed by "provider/modelId". */
  modelThinkingLevels?: Record<string, ThinkingLevel>
  transport?: TransportSetting // default: "auto"
  steeringMode?: 'all' | 'one-at-a-time'
  followUpMode?: 'all' | 'one-at-a-time'
  theme?: string
  compaction?: CompactionSettings
  retry?: RetrySettings
  images?: ImageSettings
  defaultProjectTrust?: DefaultProjectTrust // default: "ask"; global setting only
  packages?: PackageSource[] // Array of npm/git package sources (string or object with filtering)
  extensions?: string[] // Array of local extension file paths or directories
  skills?: string[] // Array of local skill file paths or directories
  prompts?: string[] // Array of local prompt template paths or directories
  themes?: string[] // Array of local theme file paths or directories
  enableSkillCommands?: boolean // default: true - register skills as /skill:name commands
  thinkingBudgets?: ThinkingBudgetsSettings // Custom token budgets for thinking levels
  /** Custom session storage directory (supports a leading ~). */
  sessionDir?: string
  /** Proxy URL applied as HTTP_PROXY and HTTPS_PROXY for app-managed HTTP clients. */
  httpProxy?: string
  /** HTTP header/body idle timeout in milliseconds; 0 disables it. */
  httpIdleTimeoutMs?: number
  /** WebSocket connect/open handshake timeout in milliseconds; 0 disables it. */
  websocketConnectTimeoutMs?: number
}

export type SettingsScope = 'global' | 'project'

/**
 * Runs fn with the raw file contents for a scope and optionally returns the new
 * serialized contents to write. Returning undefined means "nothing to write".
 */
export interface SettingsStorage {
  withLock(scope: SettingsScope, fn: (current: string | undefined) => string | undefined): void
}

export interface SettingsError {
  scope: SettingsScope
  path?: string
  error: Error
}

export interface SettingsManagerCreateOptions {
  projectTrusted?: boolean
}
