export { deepMergeSettings } from './merge'
export { migrateSettings } from './migrate'
export { acquireFileLock, type FileLock, type FileLockOptions } from './lock'
export { FileSettingsStorage, InMemorySettingsStorage } from './storage'
export { SettingsManager, DEFAULT_HTTP_IDLE_TIMEOUT_MS } from './manager'
export type {
  CompactionSettings,
  DefaultProjectTrust,
  ImageSettings,
  PackageSource,
  ProviderRetrySettings,
  RetrySettings,
  Settings,
  SettingsError,
  SettingsManagerCreateOptions,
  SettingsScope,
  SettingsStorage,
  ThinkingBudgetsSettings,
  ThinkingLevel,
  TransportSetting,
} from './types'
