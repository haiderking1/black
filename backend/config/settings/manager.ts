import { expandTildePath, CONFIG_DIR_NAME, getAgentDir } from '../agentDir'
import { resolvePath } from '../paths'
import { stripBom } from '../text'
import { deepMergeSettings } from './merge'
import { migrateSettings } from './migrate'
import { FileSettingsStorage, InMemorySettingsStorage } from './storage'
import type {
  DefaultProjectTrust,
  PackageSource,
  Settings,
  SettingsError,
  SettingsManagerCreateOptions,
  SettingsScope,
  SettingsStorage,
  ThinkingBudgetsSettings,
  ThinkingLevel,
  TransportSetting,
} from './types'
import { join } from 'node:path'

/** Default HTTP header/body idle timeout: five minutes. */
export const DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000

type SettingsPaths = Partial<Record<SettingsScope, string>>

function toSettingsError(scope: SettingsScope, error: unknown, path?: string): SettingsError {
  return {
    scope,
    ...(path !== undefined ? { path } : {}),
    error: error instanceof Error ? error : new Error(String(error)),
  }
}

/**
 * Parse a timeout setting. Accepts numbers, numeric strings, and "disabled"
 * (which maps to 0); anything else non-undefined is an error.
 */
function parseTimeoutSetting(value: unknown, settingName: string): number | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.toLowerCase() === 'disabled') return 0
    if (trimmed.length === 0) return undefined
    return parseTimeoutSetting(Number(trimmed), settingName)
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  if (value !== undefined) {
    throw new Error('Invalid ' + settingName + ' setting: ' + String(value))
  }
  return undefined
}

export class SettingsManager {
  private readonly storage: SettingsStorage
  private globalSettings: Settings
  private projectSettings: Settings
  private settings: Settings
  private projectTrusted: boolean
  /** Global fields modified during this session; only these are written back. */
  private modifiedFields = new Set<keyof Settings>()
  private modifiedNestedFields = new Map<keyof Settings, Set<string>>()
  private modifiedProjectFields = new Set<keyof Settings>()
  private modifiedProjectNestedFields = new Map<keyof Settings, Set<string>>()
  private globalSettingsLoadError: Error | null = null
  private projectSettingsLoadError: Error | null = null
  private writeQueue: Promise<void> = Promise.resolve()
  private errors: SettingsError[]
  private readonly settingsPaths: SettingsPaths

  private constructor(
    storage: SettingsStorage,
    initialGlobal: Settings,
    initialProject: Settings,
    globalLoadError: Error | null = null,
    projectLoadError: Error | null = null,
    initialErrors: SettingsError[] = [],
    projectTrusted = true,
    settingsPaths: SettingsPaths = {},
  ) {
    this.storage = storage
    this.globalSettings = initialGlobal
    this.projectSettings = initialProject
    this.projectTrusted = projectTrusted
    this.globalSettingsLoadError = globalLoadError
    this.projectSettingsLoadError = projectLoadError
    this.errors = [...initialErrors]
    this.settingsPaths = settingsPaths
    this.settings = deepMergeSettings(this.globalSettings, this.projectSettings)
  }

  /** Create a manager that loads global and project settings from files. */
  static create(
    cwd: string,
    agentDir: string = getAgentDir(),
    options: SettingsManagerCreateOptions = {},
  ): SettingsManager {
    const resolvedCwd = resolvePath(cwd)
    const resolvedAgentDir = resolvePath(agentDir)
    const storage = new FileSettingsStorage(resolvedCwd, resolvedAgentDir)
    return SettingsManager.fromStorageWithPaths(storage, options, {
      global: join(resolvedAgentDir, 'settings.json'),
      project: join(resolvedCwd, CONFIG_DIR_NAME, 'settings.json'),
    })
  }

  /** Create a manager from an arbitrary storage backend. */
  static fromStorage(storage: SettingsStorage, options: SettingsManagerCreateOptions = {}): SettingsManager {
    return SettingsManager.fromStorageWithPaths(storage, options)
  }

  /** Create an in-memory manager (no file I/O). */
  static inMemory(settings: Partial<Settings> = {}, options: SettingsManagerCreateOptions = {}): SettingsManager {
    const storage = new InMemorySettingsStorage()
    const initialSettings = migrateSettings(structuredClone(settings) as Record<string, unknown>)
    storage.withLock('global', () => JSON.stringify(initialSettings, null, 2))
    return SettingsManager.fromStorage(storage, options)
  }

  private static fromStorageWithPaths(
    storage: SettingsStorage,
    options: SettingsManagerCreateOptions,
    settingsPaths: SettingsPaths = {},
  ): SettingsManager {
    const projectTrusted = options.projectTrusted ?? true
    const globalLoad = SettingsManager.tryLoadFromStorage(storage, 'global')
    const projectLoad = SettingsManager.tryLoadFromStorage(storage, 'project', projectTrusted)
    const initialErrors: SettingsError[] = []
    if (globalLoad.error !== null) {
      initialErrors.push(toSettingsError('global', globalLoad.error, settingsPaths.global))
    }
    if (projectLoad.error !== null) {
      initialErrors.push(toSettingsError('project', projectLoad.error, settingsPaths.project))
    }

    return new SettingsManager(
      storage,
      globalLoad.settings,
      projectLoad.settings,
      globalLoad.error,
      projectLoad.error,
      initialErrors,
      projectTrusted,
      settingsPaths,
    )
  }

  private static loadFromStorage(storage: SettingsStorage, scope: SettingsScope, projectTrusted = true): Settings {
    if (scope === 'project' && !projectTrusted) {
      return {}
    }

    let content: string | undefined
    storage.withLock(scope, (current) => {
      content = current
      return undefined
    })

    if (content === undefined || content === '') {
      return {}
    }
    const settings = JSON.parse(stripBom(content)) as Record<string, unknown>
    return migrateSettings(settings)
  }

  private static tryLoadFromStorage(
    storage: SettingsStorage,
    scope: SettingsScope,
    projectTrusted = true,
  ): { settings: Settings; error: Error | null } {
    try {
      return { settings: SettingsManager.loadFromStorage(storage, scope, projectTrusted), error: null }
    } catch (error) {
      return { settings: {}, error: error instanceof Error ? error : new Error(String(error)) }
    }
  }

  getGlobalSettings(): Settings {
    return structuredClone(this.globalSettings)
  }

  getProjectSettings(): Settings {
    return structuredClone(this.projectSettings)
  }

  isProjectTrusted(): boolean {
    return this.projectTrusted
  }

  setProjectTrusted(trusted: boolean): void {
    if (this.projectTrusted === trusted) {
      return
    }

    this.projectTrusted = trusted
    this.modifiedProjectFields.clear()
    this.modifiedProjectNestedFields.clear()

    if (!trusted) {
      this.projectSettings = {}
      this.projectSettingsLoadError = null
      this.settings = deepMergeSettings(this.globalSettings, this.projectSettings)
      return
    }

    const projectLoad = SettingsManager.tryLoadFromStorage(this.storage, 'project', trusted)
    this.projectSettings = projectLoad.settings
    this.projectSettingsLoadError = projectLoad.error
    if (projectLoad.error !== null) {
      this.recordError('project', projectLoad.error)
    }
    this.settings = deepMergeSettings(this.globalSettings, this.projectSettings)
  }

  async reload(): Promise<void> {
    await this.writeQueue
    const globalLoad = SettingsManager.tryLoadFromStorage(this.storage, 'global')
    if (globalLoad.error === null) {
      this.globalSettings = globalLoad.settings
      this.globalSettingsLoadError = null
    } else {
      this.globalSettingsLoadError = globalLoad.error
      this.recordError('global', globalLoad.error)
    }

    this.modifiedFields.clear()
    this.modifiedNestedFields.clear()
    this.modifiedProjectFields.clear()
    this.modifiedProjectNestedFields.clear()

    const projectLoad = SettingsManager.tryLoadFromStorage(this.storage, 'project', this.projectTrusted)
    if (projectLoad.error === null) {
      this.projectSettings = projectLoad.settings
      this.projectSettingsLoadError = null
    } else {
      this.projectSettingsLoadError = projectLoad.error
      this.recordError('project', projectLoad.error)
    }

    this.settings = deepMergeSettings(this.globalSettings, this.projectSettings)
  }

  /** Apply additional overrides on top of the current merged settings. */
  applyOverrides(overrides: Partial<Settings>): void {
    this.settings = deepMergeSettings(this.settings, overrides)
  }

  private markModified(field: keyof Settings, nestedKey?: string): void {
    this.modifiedFields.add(field)
    if (nestedKey !== undefined) {
      let keys = this.modifiedNestedFields.get(field)
      if (keys === undefined) {
        keys = new Set()
        this.modifiedNestedFields.set(field, keys)
      }
      keys.add(nestedKey)
    }
  }

  private markProjectModified(field: keyof Settings, nestedKey?: string): void {
    this.modifiedProjectFields.add(field)
    if (nestedKey !== undefined) {
      let keys = this.modifiedProjectNestedFields.get(field)
      if (keys === undefined) {
        keys = new Set()
        this.modifiedProjectNestedFields.set(field, keys)
      }
      keys.add(nestedKey)
    }
  }

  private assertProjectTrustedForWrite(): void {
    if (!this.projectTrusted) {
      throw new Error('Project is not trusted; refusing to write project settings')
    }
  }

  private recordError(scope: SettingsScope, error: unknown): void {
    this.errors.push(toSettingsError(scope, error, this.settingsPaths[scope]))
  }

  private clearModifiedScope(scope: SettingsScope): void {
    if (scope === 'global') {
      this.modifiedFields.clear()
      this.modifiedNestedFields.clear()
      return
    }

    this.modifiedProjectFields.clear()
    this.modifiedProjectNestedFields.clear()
  }

  private enqueueWrite(scope: SettingsScope, task: () => void): void {
    this.writeQueue = this.writeQueue
      .then(() => {
        if (scope === 'project') {
          this.assertProjectTrustedForWrite()
        }
        task()
        this.clearModifiedScope(scope)
      })
      .catch((error) => {
        this.recordError(scope, error)
      })
  }

  private cloneModifiedNestedFields(source: Map<keyof Settings, Set<string>>): Map<keyof Settings, Set<string>> {
    const snapshot = new Map<keyof Settings, Set<string>>()
    for (const [key, value] of source.entries()) {
      snapshot.set(key, new Set(value))
    }
    return snapshot
  }

  /**
   * Write only the fields modified during this session on top of the current
   * file contents, so external edits to untouched fields survive.
   */
  private persistScopedSettings(
    scope: SettingsScope,
    snapshotSettings: Settings,
    modifiedFields: Set<keyof Settings>,
    modifiedNestedFields: Map<keyof Settings, Set<string>>,
  ): void {
    this.storage.withLock(scope, (current) => {
      const currentFileSettings = current
        ? migrateSettings(JSON.parse(stripBom(current)) as Record<string, unknown>)
        : {}
      const mergedSettings: Settings = { ...currentFileSettings }
      for (const field of modifiedFields) {
        const value = snapshotSettings[field]
        if (modifiedNestedFields.has(field) && typeof value === 'object' && value !== null) {
          const nestedModified = modifiedNestedFields.get(field)
          if (nestedModified === undefined) continue
          const baseNested = (currentFileSettings[field] as Record<string, unknown>) ?? {}
          const inMemoryNested = value as Record<string, unknown>
          const mergedNested: Record<string, unknown> = { ...baseNested }
          for (const nestedKey of nestedModified) {
            mergedNested[nestedKey] = inMemoryNested[nestedKey]
          }
          ;(mergedSettings as Record<string, unknown>)[field] = mergedNested
        } else {
          ;(mergedSettings as Record<string, unknown>)[field] = value
        }
      }

      return JSON.stringify(mergedSettings, null, 2)
    })
  }

  private save(): void {
    this.settings = deepMergeSettings(this.globalSettings, this.projectSettings)

    if (this.globalSettingsLoadError !== null) {
      return
    }

    const snapshotGlobalSettings = structuredClone(this.globalSettings)
    const modifiedFields = new Set(this.modifiedFields)
    const modifiedNestedFields = this.cloneModifiedNestedFields(this.modifiedNestedFields)

    this.enqueueWrite('global', () => {
      this.persistScopedSettings('global', snapshotGlobalSettings, modifiedFields, modifiedNestedFields)
    })
  }

  private saveProjectSettings(settings: Settings): void {
    this.assertProjectTrustedForWrite()
    this.projectSettings = structuredClone(settings)
    this.settings = deepMergeSettings(this.globalSettings, this.projectSettings)

    if (this.projectSettingsLoadError !== null) {
      return
    }

    const snapshotProjectSettings = structuredClone(this.projectSettings)
    const modifiedFields = new Set(this.modifiedProjectFields)
    const modifiedNestedFields = this.cloneModifiedNestedFields(this.modifiedProjectNestedFields)
    this.enqueueWrite('project', () => {
      this.persistScopedSettings('project', snapshotProjectSettings, modifiedFields, modifiedNestedFields)
    })
  }

  private updateProjectSettings(field: keyof Settings, update: (settings: Settings) => void): void {
    this.assertProjectTrustedForWrite()
    const projectSettings = structuredClone(this.projectSettings)
    update(projectSettings)
    this.markProjectModified(field)
    this.saveProjectSettings(projectSettings)
  }

  /** Wait for all queued writes to finish. */
  async flush(): Promise<void> {
    await this.writeQueue
  }

  /** Return and clear accumulated load/write errors. */
  drainErrors(): SettingsError[] {
    const drained = [...this.errors]
    this.errors = []
    return drained
  }

  // ---------------------------------------------------------------------------
  // Field accessors
  // ---------------------------------------------------------------------------

  getLastChangelogVersion(): string | undefined {
    return this.settings.lastChangelogVersion
  }

  setLastChangelogVersion(version: string): void {
    this.globalSettings.lastChangelogVersion = version
    this.markModified('lastChangelogVersion')
    this.save()
  }

  /** Custom session storage directory, with a leading ~ expanded. */
  getSessionDir(): string | undefined {
    const sessionDir = this.settings.sessionDir
    return sessionDir ? expandTildePath(sessionDir) : sessionDir
  }

  getDefaultProvider(): string | undefined {
    return this.settings.defaultProvider
  }

  getDefaultModel(): string | undefined {
    return this.settings.defaultModel
  }

  setDefaultProvider(provider: string): void {
    this.globalSettings.defaultProvider = provider
    this.markModified('defaultProvider')
    this.save()
  }

  setDefaultModel(modelId: string): void {
    this.globalSettings.defaultModel = modelId
    this.markModified('defaultModel')
    this.save()
  }

  setDefaultModelAndProvider(provider: string, modelId: string): void {
    this.globalSettings.defaultProvider = provider
    this.globalSettings.defaultModel = modelId
    this.markModified('defaultProvider')
    this.markModified('defaultModel')
    this.save()
  }

  getSteeringMode(): 'all' | 'one-at-a-time' {
    return this.settings.steeringMode || 'one-at-a-time'
  }

  setSteeringMode(mode: 'all' | 'one-at-a-time'): void {
    this.globalSettings.steeringMode = mode
    this.markModified('steeringMode')
    this.save()
  }

  getFollowUpMode(): 'all' | 'one-at-a-time' {
    return this.settings.followUpMode || 'one-at-a-time'
  }

  setFollowUpMode(mode: 'all' | 'one-at-a-time'): void {
    this.globalSettings.followUpMode = mode
    this.markModified('followUpMode')
    this.save()
  }

  /** Raw theme value; slash-separated automatic themes pass through. */
  getThemeSetting(): string | undefined {
    const value = this.settings.theme
    if (typeof value === 'string') return value
    return undefined
  }

  /** Fixed theme name; slash-separated automatic themes resolve to undefined. */
  getTheme(): string | undefined {
    const theme = this.getThemeSetting()
    return theme?.includes('/') ? undefined : theme
  }

  setTheme(theme: string): void {
    this.globalSettings.theme = theme
    this.markModified('theme')
    this.save()
  }

  getDefaultThinkingLevel(): ThinkingLevel | undefined {
    return this.settings.defaultThinkingLevel
  }

  setDefaultThinkingLevel(level: ThinkingLevel): void {
    this.globalSettings.defaultThinkingLevel = level
    this.markModified('defaultThinkingLevel')
    this.save()
  }

  getModelThinkingLevel(provider: string, modelId: string): ThinkingLevel | undefined {
    return this.settings.modelThinkingLevels?.[provider + '/' + modelId]
  }

  getAllModelThinkingLevels(): Record<string, ThinkingLevel> {
    return { ...(this.settings.modelThinkingLevels ?? {}) }
  }

  setModelThinkingLevel(provider: string, modelId: string, level: ThinkingLevel): void {
    if (this.globalSettings.modelThinkingLevels === undefined) {
      this.globalSettings.modelThinkingLevels = {}
    }
    this.globalSettings.modelThinkingLevels[provider + '/' + modelId] = level
    this.markModified('modelThinkingLevels')
    this.save()
  }

  removeModelThinkingLevel(provider: string, modelId: string): void {
    const levels = this.globalSettings.modelThinkingLevels
    if (levels === undefined) return
    delete levels[provider + '/' + modelId]
    if (Object.keys(levels).length === 0) {
      delete this.globalSettings.modelThinkingLevels
    }
    this.markModified('modelThinkingLevels')
    this.save()
  }

  getTransport(): TransportSetting {
    return this.settings.transport ?? 'auto'
  }

  setTransport(transport: TransportSetting): void {
    this.globalSettings.transport = transport
    this.markModified('transport')
    this.save()
  }

  getCompactionEnabled(): boolean {
    return this.settings.compaction?.enabled ?? true
  }

  setCompactionEnabled(enabled: boolean): void {
    if (this.globalSettings.compaction === undefined) {
      this.globalSettings.compaction = {}
    }
    this.globalSettings.compaction.enabled = enabled
    this.markModified('compaction', 'enabled')
    this.save()
  }

  getCompactionReserveTokens(): number {
    return this.settings.compaction?.reserveTokens ?? 16384
  }

  getCompactionKeepRecentTokens(): number {
    return this.settings.compaction?.keepRecentTokens ?? 20000
  }

  getCompactionSettings(): { enabled: boolean; reserveTokens: number; keepRecentTokens: number } {
    return {
      enabled: this.getCompactionEnabled(),
      reserveTokens: this.getCompactionReserveTokens(),
      keepRecentTokens: this.getCompactionKeepRecentTokens(),
    }
  }

  getRetryEnabled(): boolean {
    return this.settings.retry?.enabled ?? true
  }

  setRetryEnabled(enabled: boolean): void {
    if (this.globalSettings.retry === undefined) {
      this.globalSettings.retry = {}
    }
    this.globalSettings.retry.enabled = enabled
    this.markModified('retry', 'enabled')
    this.save()
  }

  getRetrySettings(): { enabled: boolean; maxRetries: number; baseDelayMs: number } {
    return {
      enabled: this.getRetryEnabled(),
      maxRetries: this.settings.retry?.maxRetries ?? 3,
      baseDelayMs: this.settings.retry?.baseDelayMs ?? 2000,
    }
  }

  getProviderRetrySettings(): { timeoutMs?: number; maxRetries?: number; maxRetryDelayMs: number } {
    return {
      timeoutMs: this.settings.retry?.provider?.timeoutMs,
      maxRetries: this.settings.retry?.provider?.maxRetries,
      maxRetryDelayMs: this.settings.retry?.provider?.maxRetryDelayMs ?? 60000,
    }
  }

  getHttpIdleTimeoutMs(): number {
    return parseTimeoutSetting(this.settings.httpIdleTimeoutMs, 'httpIdleTimeoutMs') ?? DEFAULT_HTTP_IDLE_TIMEOUT_MS
  }

  setHttpIdleTimeoutMs(timeoutMs: number): void {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
      throw new Error('Invalid httpIdleTimeoutMs setting: ' + String(timeoutMs))
    }
    this.globalSettings.httpIdleTimeoutMs = Math.floor(timeoutMs)
    this.markModified('httpIdleTimeoutMs')
    this.save()
  }

  getWebSocketConnectTimeoutMs(): number | undefined {
    return parseTimeoutSetting(this.settings.websocketConnectTimeoutMs, 'websocketConnectTimeoutMs')
  }

  getDefaultProjectTrust(): DefaultProjectTrust {
    // Global-only on purpose: a project must not decide its own trust default.
    const value = this.globalSettings.defaultProjectTrust
    return value === 'always' || value === 'never' ? value : 'ask'
  }

  setDefaultProjectTrust(defaultProjectTrust: DefaultProjectTrust): void {
    this.globalSettings.defaultProjectTrust = defaultProjectTrust
    this.markModified('defaultProjectTrust')
    this.save()
  }

  getPackages(): PackageSource[] {
    return [...(this.settings.packages ?? [])]
  }

  setPackages(packages: PackageSource[]): void {
    this.globalSettings.packages = packages
    this.markModified('packages')
    this.save()
  }

  setProjectPackages(packages: PackageSource[]): void {
    this.updateProjectSettings('packages', (settings) => {
      settings.packages = packages
    })
  }

  getExtensionPaths(): string[] {
    return [...(this.settings.extensions ?? [])]
  }

  setExtensionPaths(paths: string[]): void {
    this.globalSettings.extensions = paths
    this.markModified('extensions')
    this.save()
  }

  setProjectExtensionPaths(paths: string[]): void {
    this.updateProjectSettings('extensions', (settings) => {
      settings.extensions = paths
    })
  }

  getSkillPaths(): string[] {
    return [...(this.settings.skills ?? [])]
  }

  setSkillPaths(paths: string[]): void {
    this.globalSettings.skills = paths
    this.markModified('skills')
    this.save()
  }

  setProjectSkillPaths(paths: string[]): void {
    this.updateProjectSettings('skills', (settings) => {
      settings.skills = paths
    })
  }

  getPromptTemplatePaths(): string[] {
    return [...(this.settings.prompts ?? [])]
  }

  setPromptTemplatePaths(paths: string[]): void {
    this.globalSettings.prompts = paths
    this.markModified('prompts')
    this.save()
  }

  setProjectPromptTemplatePaths(paths: string[]): void {
    this.updateProjectSettings('prompts', (settings) => {
      settings.prompts = paths
    })
  }

  getThemePaths(): string[] {
    return [...(this.settings.themes ?? [])]
  }

  setThemePaths(paths: string[]): void {
    this.globalSettings.themes = paths
    this.markModified('themes')
    this.save()
  }

  setProjectThemePaths(paths: string[]): void {
    this.updateProjectSettings('themes', (settings) => {
      settings.themes = paths
    })
  }

  getEnableSkillCommands(): boolean {
    return this.settings.enableSkillCommands ?? true
  }

  setEnableSkillCommands(enabled: boolean): void {
    this.globalSettings.enableSkillCommands = enabled
    this.markModified('enableSkillCommands')
    this.save()
  }

  getThinkingBudgets(): ThinkingBudgetsSettings | undefined {
    return this.settings.thinkingBudgets
  }

  getImageAutoResize(): boolean {
    return this.settings.images?.autoResize ?? true
  }

  setImageAutoResize(enabled: boolean): void {
    if (this.globalSettings.images === undefined) {
      this.globalSettings.images = {}
    }
    this.globalSettings.images.autoResize = enabled
    this.markModified('images', 'autoResize')
    this.save()
  }

  getBlockImages(): boolean {
    return this.settings.images?.blockImages ?? false
  }

  setBlockImages(blocked: boolean): void {
    if (this.globalSettings.images === undefined) {
      this.globalSettings.images = {}
    }
    this.globalSettings.images.blockImages = blocked
    this.markModified('images', 'blockImages')
    this.save()
  }
}
