import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { SettingsManager, DEFAULT_HTTP_IDLE_TIMEOUT_MS, migrateSettings } from '../backend/config'

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2))
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
}

describe('SettingsManager', () => {
  let root: string
  let agentDir: string
  let projectDir: string
  let globalPath: string
  let projectPath: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'black-settings-'))
    agentDir = join(root, 'agent')
    projectDir = join(root, 'project')
    mkdirSync(agentDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    globalPath = join(agentDir, 'settings.json')
    projectPath = join(projectDir, '.black', 'settings.json')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('preserves externally added settings', () => {
    it('keeps fields added by external edits when a tracked field changes', async () => {
      writeJson(globalPath, { theme: 'dark', defaultModel: 'claude-sonnet' })
      const manager = SettingsManager.create(projectDir, agentDir)

      // Simulate an external edit while the app is running.
      const current = readJson(globalPath)
      current['extensions'] = ['/local/ext.ts']
      writeJson(globalPath, current)

      manager.setDefaultThinkingLevel('high')
      await manager.flush()

      const saved = readJson(globalPath)
      expect(saved['extensions']).toEqual(['/local/ext.ts'])
      expect(saved['defaultThinkingLevel']).toBe('high')
      expect(saved['theme']).toBe('dark')
      expect(saved['defaultModel']).toBe('claude-sonnet')
    })

    it('keeps custom fields when the theme changes', async () => {
      writeJson(globalPath, { defaultModel: 'claude-sonnet' })
      const manager = SettingsManager.create(projectDir, agentDir)

      const current = readJson(globalPath)
      current['skills'] = ['/local/skills']
      current['prompts'] = ['/local/prompts']
      writeJson(globalPath, current)

      manager.setTheme('light')
      await manager.flush()

      const saved = readJson(globalPath)
      expect(saved['skills']).toEqual(['/local/skills'])
      expect(saved['prompts']).toEqual(['/local/prompts'])
      expect(saved['theme']).toBe('light')
    })

    it('lets in-memory changes win over external edits of the same field', async () => {
      writeJson(globalPath, { theme: 'dark' })
      const manager = SettingsManager.create(projectDir, agentDir)

      const current = readJson(globalPath)
      current['defaultThinkingLevel'] = 'low'
      writeJson(globalPath, current)

      manager.setDefaultThinkingLevel('high')
      await manager.flush()

      expect(readJson(globalPath)['defaultThinkingLevel']).toBe('high')
    })
  })

  describe('resource lists', () => {
    it('round-trips extensions and keeps packages separate', async () => {
      writeJson(globalPath, { extensions: ['/local/ext.ts', './relative/ext.ts'] })
      const manager = SettingsManager.create(projectDir, agentDir)
      expect(manager.getPackages()).toEqual([])
      expect(manager.getExtensionPaths()).toEqual(['/local/ext.ts', './relative/ext.ts'])

      manager.setPackages(['npm:simple-pkg', { source: 'npm:filtered', extensions: ['extensions/one.ts'], skills: [] }])
      await manager.flush()

      expect(manager.getPackages()).toEqual([
        'npm:simple-pkg',
        { source: 'npm:filtered', extensions: ['extensions/one.ts'], skills: [] },
      ])
      const saved = readJson(globalPath)
      expect(saved['packages']).toHaveLength(2)
      expect(saved['extensions']).toEqual(['/local/ext.ts', './relative/ext.ts'])
    })

    it('writes project resource lists into the project file', async () => {
      const manager = SettingsManager.create(projectDir, agentDir)
      manager.setProjectSkillPaths(['./skills/custom'])
      await manager.flush()

      expect(readJson(projectPath)['skills']).toEqual(['./skills/custom'])
      expect(existsSync(globalPath)).toBe(false)
    })
  })

  describe('reload', () => {
    it('picks up new file contents', async () => {
      writeJson(globalPath, { theme: 'dark', extensions: ['/before.ts'] })
      const manager = SettingsManager.create(projectDir, agentDir)

      writeJson(globalPath, { theme: 'light', extensions: ['/after.ts'], defaultModel: 'claude-sonnet' })
      await manager.reload()

      expect(manager.getTheme()).toBe('light')
      expect(manager.getExtensionPaths()).toEqual(['/after.ts'])
      expect(manager.getDefaultModel()).toBe('claude-sonnet')
    })

    it('keeps previous settings and reports the path when the file is invalid', async () => {
      writeJson(globalPath, { theme: 'dark' })
      const manager = SettingsManager.create(projectDir, agentDir)

      writeFileSync(globalPath, '{ invalid json')
      await manager.reload()

      expect(manager.getTheme()).toBe('dark')
      expect(manager.drainErrors()).toMatchObject([{ scope: 'global', path: globalPath }])
    })
  })

  describe('theme', () => {
    it('treats slash-separated automatic themes as unset for fixed lookups', async () => {
      writeJson(globalPath, { theme: 'light/dark' })
      const manager = SettingsManager.create(projectDir, agentDir)

      expect(manager.getTheme()).toBeUndefined()
      expect(manager.getThemeSetting()).toBe('light/dark')

      manager.setTheme('solarized-light/tokyo-night')
      await manager.flush()
      expect(readJson(globalPath)['theme']).toBe('solarized-light/tokyo-night')
    })
  })

  describe('error tracking', () => {
    it('collects load errors per scope and drains them', () => {
      writeFileSync(globalPath, '{ invalid global json')
      mkdirSync(join(projectDir, '.black'), { recursive: true })
      writeFileSync(projectPath, '{ invalid project json')

      const manager = SettingsManager.create(projectDir, agentDir)
      const errors = manager.drainErrors()

      expect(errors).toHaveLength(2)
      expect(errors[0]?.scope).toBe('global')
      expect(errors[0]?.path).toBe(globalPath)
      expect(errors[1]?.scope).toBe('project')
      expect(errors[1]?.path).toBe(projectPath)
      expect(manager.drainErrors()).toEqual([])
    })
  })

  describe('project trust', () => {
    it('skips project settings when the project is not trusted', () => {
      writeJson(globalPath, { theme: 'global' })
      mkdirSync(join(projectDir, '.black'), { recursive: true })
      writeJson(projectPath, { theme: 'project' })

      const manager = SettingsManager.create(projectDir, agentDir, { projectTrusted: false })

      expect(manager.isProjectTrusted()).toBe(false)
      expect(manager.getTheme()).toBe('global')
      expect(manager.getProjectSettings()).toEqual({})
    })

    it('loads project settings after trust flips to true', () => {
      writeJson(globalPath, { theme: 'global' })
      mkdirSync(join(projectDir, '.black'), { recursive: true })
      writeJson(projectPath, { theme: 'project' })
      const manager = SettingsManager.create(projectDir, agentDir, { projectTrusted: false })

      manager.setProjectTrusted(true)

      expect(manager.isProjectTrusted()).toBe(true)
      expect(manager.getTheme()).toBe('project')
    })

    it('refuses project writes when untrusted and leaves the file alone', async () => {
      mkdirSync(join(projectDir, '.black'), { recursive: true })
      writeJson(projectPath, { packages: ['npm:existing'] })
      const manager = SettingsManager.create(projectDir, agentDir, { projectTrusted: false })

      expect(() => manager.setProjectPackages(['npm:new'])).toThrow(
        'Project is not trusted; refusing to write project settings',
      )
      await manager.flush()

      expect(manager.getProjectSettings()).toEqual({})
      expect(readJson(projectPath)).toEqual({ packages: ['npm:existing'] })
    })

    it('reads the default trust mode from global settings only', () => {
      writeJson(globalPath, { defaultProjectTrust: 'always' })
      mkdirSync(join(projectDir, '.black'), { recursive: true })
      writeJson(projectPath, { defaultProjectTrust: 'never' })

      expect(SettingsManager.create(projectDir, agentDir).getDefaultProjectTrust()).toBe('always')
    })

    it('falls back to ask for invalid trust modes', () => {
      writeJson(globalPath, { defaultProjectTrust: 'sometimes' })
      expect(SettingsManager.create(projectDir, agentDir).getDefaultProjectTrust()).toBe('ask')
    })
  })

  describe('project settings directory', () => {
    it('is not created by reads alone', () => {
      writeJson(globalPath, { theme: 'dark' })
      const manager = SettingsManager.create(projectDir, agentDir)

      expect(manager.getTheme()).toBe('dark')
      expect(existsSync(join(projectDir, '.black'))).toBe(false)
    })

    it('is created by the first project write', async () => {
      writeJson(globalPath, { theme: 'dark' })
      const manager = SettingsManager.create(projectDir, agentDir)

      manager.setProjectPackages([{ source: 'npm:test-pkg' }])
      await manager.flush()

      expect(existsSync(join(projectDir, '.black', 'settings.json'))).toBe(true)
    })
  })

  describe('httpIdleTimeoutMs', () => {
    it('defaults to five minutes', () => {
      expect(SettingsManager.create(projectDir, agentDir).getHttpIdleTimeoutMs()).toBe(DEFAULT_HTTP_IDLE_TIMEOUT_MS)
      expect(DEFAULT_HTTP_IDLE_TIMEOUT_MS).toBe(300_000)
    })

    it('lets project settings override global ones', () => {
      writeJson(globalPath, { httpIdleTimeoutMs: 300000 })
      mkdirSync(join(projectDir, '.black'), { recursive: true })
      writeJson(projectPath, { httpIdleTimeoutMs: 0 })

      expect(SettingsManager.create(projectDir, agentDir).getHttpIdleTimeoutMs()).toBe(0)
    })

    it('rejects invalid values on read', () => {
      writeJson(globalPath, { httpIdleTimeoutMs: -1 })
      expect(() => SettingsManager.create(projectDir, agentDir).getHttpIdleTimeoutMs()).toThrow(
        'Invalid httpIdleTimeoutMs setting',
      )
    })

    it('accepts numbers, numeric strings, and "disabled"', () => {
      // Numeric string in global settings.
      const fromMemory = SettingsManager.inMemory({ httpIdleTimeoutMs: '120000' as unknown as number })
      expect(fromMemory.getHttpIdleTimeoutMs()).toBe(120000)

      // "disabled" maps to 0 and project settings win over global.
      writeJson(globalPath, { httpIdleTimeoutMs: '120000' })
      mkdirSync(join(projectDir, '.black'), { recursive: true })
      writeJson(projectPath, { httpIdleTimeoutMs: 'disabled' })
      expect(SettingsManager.create(projectDir, agentDir).getHttpIdleTimeoutMs()).toBe(0)
    })

    it('rejects negative values on set', () => {
      const manager = SettingsManager.inMemory()
      expect(() => manager.setHttpIdleTimeoutMs(-5)).toThrow('Invalid httpIdleTimeoutMs setting')
    })
  })

  describe('sessionDir', () => {
    it('is undefined when unset', () => {
      writeJson(globalPath, { theme: 'dark' })
      expect(SettingsManager.create(projectDir, agentDir).getSessionDir()).toBeUndefined()
    })

    it('returns the global value and lets project override it', () => {
      writeJson(globalPath, { sessionDir: '/global/sessions' })
      expect(SettingsManager.create(projectDir, agentDir).getSessionDir()).toBe('/global/sessions')

      mkdirSync(join(projectDir, '.black'), { recursive: true })
      writeJson(projectPath, { sessionDir: './sessions' })
      expect(SettingsManager.create(projectDir, agentDir).getSessionDir()).toBe('./sessions')
    })

    it('expands a leading tilde', () => {
      const originalHome = process.env['HOME']
      process.env['HOME'] = root
      try {
        writeJson(globalPath, { sessionDir: '~/sessions' })
        expect(SettingsManager.create(projectDir, agentDir).getSessionDir()).toBe(join(root, 'sessions'))
      } finally {
        if (originalHome === undefined) delete process.env['HOME']
        else process.env['HOME'] = originalHome
      }
    })
  })

  describe('format migrations', () => {
    it('migrates queueMode to steeringMode', () => {
      writeJson(globalPath, { queueMode: 'all' })
      expect(SettingsManager.create(projectDir, agentDir).getSteeringMode()).toBe('all')
    })

    it('migrates the websockets boolean to transport', () => {
      writeJson(globalPath, { websockets: true })
      expect(SettingsManager.create(projectDir, agentDir).getTransport()).toBe('websocket')

      writeJson(globalPath, { websockets: false })
      expect(SettingsManager.create(projectDir, agentDir).getTransport()).toBe('sse')
    })

    it('migrates the old skills object to an array', () => {
      writeJson(globalPath, { skills: { enableSkillCommands: false, customDirectories: ['/a', '/b'] } })
      const manager = SettingsManager.create(projectDir, agentDir)
      expect(manager.getSkillPaths()).toEqual(['/a', '/b'])
      expect(manager.getEnableSkillCommands()).toBe(false)

      writeJson(globalPath, { skills: { customDirectories: [] } })
      const emptied = SettingsManager.create(projectDir, agentDir)
      expect(emptied.getSkillPaths()).toEqual([])
      expect(emptied.getEnableSkillCommands()).toBe(true)
    })

    it('migrates retry.maxDelayMs into retry.provider.maxRetryDelayMs', () => {
      writeJson(globalPath, { retry: { maxDelayMs: 5000 } })
      const manager = SettingsManager.create(projectDir, agentDir)
      expect(manager.getProviderRetrySettings().maxRetryDelayMs).toBe(5000)

      writeJson(globalPath, { retry: { maxDelayMs: 5000, provider: { maxRetryDelayMs: 9000 } } })
      const kept = SettingsManager.create(projectDir, agentDir)
      expect(kept.getProviderRetrySettings().maxRetryDelayMs).toBe(9000)
    })

    it('migrates settings passed to inMemory', () => {
      const manager = SettingsManager.inMemory({ queueMode: 'all' } as unknown as Record<string, never>)
      expect(manager.getSteeringMode()).toBe('all')
      expect(migrateSettings({ queueMode: 'one-at-a-time' }).steeringMode).toBe('one-at-a-time')
    })
  })

  describe('nested field persistence', () => {
    it('preserves sibling keys inside a nested object it modified', async () => {
      writeJson(globalPath, { compaction: { enabled: false, reserveTokens: 999 } })
      const manager = SettingsManager.create(projectDir, agentDir)

      manager.setCompactionEnabled(true)
      await manager.flush()

      const saved = readJson(globalPath)
      expect((saved['compaction'] as Record<string, unknown>)['enabled']).toBe(true)
      expect((saved['compaction'] as Record<string, unknown>)['reserveTokens']).toBe(999)
    })

    it('preserves sibling keys inside retry', async () => {
      writeJson(globalPath, { retry: { enabled: true, maxRetries: 5 } })
      const manager = SettingsManager.create(projectDir, agentDir)

      manager.setRetryEnabled(false)
      await manager.flush()

      const saved = readJson(globalPath)
      const retry = saved['retry'] as Record<string, unknown>
      expect(retry['enabled']).toBe(false)
      expect(retry['maxRetries']).toBe(5)
    })

    it('preserves sibling keys inside images', async () => {
      writeJson(globalPath, { images: { autoResize: false } })
      const manager = SettingsManager.create(projectDir, agentDir)

      manager.setBlockImages(true)
      await manager.flush()

      const saved = readJson(globalPath)
      const images = saved['images'] as Record<string, unknown>
      expect(images['blockImages']).toBe(true)
      expect(images['autoResize']).toBe(false)
    })
  })

  describe('in-memory manager', () => {
    it('applies migrations and returns defensive clones', () => {
      const manager = SettingsManager.inMemory({ theme: 'dark' })
      expect(manager.getTheme()).toBe('dark')

      const globalSettings = manager.getGlobalSettings()
      globalSettings['theme'] = 'hijacked'
      expect(manager.getTheme()).toBe('dark')

      const projectSettings = manager.getProjectSettings()
      projectSettings['theme'] = 'hijacked'
      expect(manager.getTheme()).toBe('dark')
    })

    it('applies overrides on top of merged settings', () => {
      const manager = SettingsManager.inMemory({ compaction: { reserveTokens: 100 } })
      manager.applyOverrides({ compaction: { keepRecentTokens: 200 } })
      expect(manager.getCompactionSettings()).toEqual({
        enabled: true,
        reserveTokens: 100,
        keepRecentTokens: 200,
      })
    })
  })

  describe('defaults', () => {
    it('uses built-in defaults for agent behavior', () => {
      const manager = SettingsManager.inMemory()
      expect(manager.getCompactionSettings()).toEqual({ enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 })
      expect(manager.getRetrySettings()).toEqual({ enabled: true, maxRetries: 3, baseDelayMs: 2000 })
      expect(manager.getProviderRetrySettings()).toEqual({
        timeoutMs: undefined,
        maxRetries: undefined,
        maxRetryDelayMs: 60000,
      })
      expect(manager.getSteeringMode()).toBe('one-at-a-time')
      expect(manager.getFollowUpMode()).toBe('one-at-a-time')
      expect(manager.getTransport()).toBe('auto')
      expect(manager.getEnableSkillCommands()).toBe(true)
      expect(manager.getImageAutoResize()).toBe(true)
      expect(manager.getBlockImages()).toBe(false)
      expect(manager.getDefaultProjectTrust()).toBe('ask')
    })

    it('persists written values and merges project over global', async () => {
      writeJson(globalPath, { compaction: { reserveTokens: 100 } })
      mkdirSync(join(projectDir, '.black'), { recursive: true })
      writeJson(projectPath, { compaction: { keepRecentTokens: 200 } })

      const manager = SettingsManager.create(projectDir, agentDir)
      expect(manager.getCompactionSettings()).toEqual({
        enabled: true,
        reserveTokens: 100,
        keepRecentTokens: 200,
      })

      manager.setDefaultModelAndProvider('anthropic', 'claude-sonnet-4-5')
      await manager.flush()
      const saved = readJson(globalPath)
      expect(saved['defaultModel']).toBe('claude-sonnet-4-5')
      expect(saved['defaultProvider']).toBe('anthropic')
      expect(saved['compaction']).toEqual({ reserveTokens: 100 })
    })
  })

  describe('write queue', () => {
    it('serializes writes in call order', async () => {
      const manager = SettingsManager.create(projectDir, agentDir)
      manager.setTheme('first')
      manager.setTheme('second')
      await manager.flush()
      expect(readJson(globalPath)['theme']).toBe('second')
    })

    it('records write failures instead of throwing', async () => {
      const manager = SettingsManager.create(projectDir, agentDir)
      manager.setTheme('dark')
      await manager.flush()
      expect(manager.drainErrors()).toEqual([])
      expect(readJson(globalPath)['theme']).toBe('dark')
    })
  })
})
