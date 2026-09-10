import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  APP_NAME,
  CONFIG_DIR_NAME,
  canonicalizePath,
  getAgentDir,
  getAuthPath,
  getBinDir,
  getCustomThemesDir,
  getDebugLogPath,
  getModelsPath,
  getProjectConfigDir,
  getProjectSettingsPath,
  getPromptsDir,
  getSessionsDir,
  getSettingsPath,
  getToolsDir,
  getUserHomeDir,
  resolvePath,
} from '../backend/config'

describe('agent dir paths', () => {
  let home: string
  let originalHome: string | undefined
  let originalAgentDir: string | undefined
  let originalSessionDir: string | undefined

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'black-paths-'))
    originalHome = process.env['HOME']
    originalAgentDir = process.env['BLACK_AGENT_DIR']
    originalSessionDir = process.env['BLACK_SESSIONS_DIR']
    process.env['HOME'] = home
    delete process.env['BLACK_AGENT_DIR']
    delete process.env['BLACK_SESSIONS_DIR']
  })

  afterEach(() => {
    if (originalHome === undefined) delete process.env['HOME']
    else process.env['HOME'] = originalHome
    if (originalAgentDir === undefined) delete process.env['BLACK_AGENT_DIR']
    else process.env['BLACK_AGENT_DIR'] = originalAgentDir
    if (originalSessionDir === undefined) delete process.env['BLACK_SESSIONS_DIR']
    else process.env['BLACK_SESSIONS_DIR'] = originalSessionDir
    rmSync(home, { recursive: true, force: true })
  })

  it('derives the agent dir from HOME', () => {
    expect(getAgentDir()).toBe(join(home, '.black', 'agent'))
    expect(getSessionsDir()).toBe(join(home, '.black', 'agent', 'sessions'))
  })

  it('places every config file inside the agent dir', () => {
    const agentDir = getAgentDir()
    expect(getSettingsPath()).toBe(join(agentDir, 'settings.json'))
    expect(getAuthPath()).toBe(join(agentDir, 'auth.json'))
    expect(getModelsPath()).toBe(join(agentDir, 'models.json'))
    expect(getCustomThemesDir()).toBe(join(agentDir, 'themes'))
    expect(getToolsDir()).toBe(join(agentDir, 'tools'))
    expect(getBinDir()).toBe(join(agentDir, 'bin'))
    expect(getPromptsDir()).toBe(join(agentDir, 'prompts'))
    expect(getDebugLogPath()).toBe(join(agentDir, APP_NAME + '-debug.log'))
  })

  it('honors the agent dir override including tilde expansion', () => {
    process.env['BLACK_AGENT_DIR'] = '~/.custom-black'
    expect(getAgentDir()).toBe(join(home, '.custom-black'))
    expect(getSettingsPath()).toBe(join(home, '.custom-black', 'settings.json'))
  })

  it('honors the sessions dir override independently', () => {
    process.env['BLACK_SESSIONS_DIR'] = '/data/sessions'
    expect(getSessionsDir()).toBe('/data/sessions')
  })

  it('resolves project config paths against the project directory', () => {
    expect(getProjectConfigDir('/tmp/some-project')).toBe('/tmp/some-project/.black')
    expect(getProjectSettingsPath('/tmp/some-project')).toBe('/tmp/some-project/.black/settings.json')
  })

  it('resolves relative project dirs against the process cwd', () => {
    expect(getProjectConfigDir('relative-project')).toBe(join(process.cwd(), 'relative-project', '.black'))
  })

  it('expands tildes and resolves relative inputs in resolvePath', () => {
    expect(resolvePath('~')).toBe(home)
    expect(resolvePath('~/notes')).toBe(join(home, 'notes'))
    expect(resolvePath('a/b', '/tmp/base')).toBe('/tmp/base/a/b')
    expect(resolvePath('/abs/x')).toBe('/abs/x')
  })

  it('canonicalizes existing paths through symlinks and leaves missing ones alone', () => {
    const realDir = join(home, 'real')
    mkdirSync(realDir, { recursive: true })
    const link = join(home, 'link-to-real')
    symlinkSync(realDir, link, 'dir')
    expect(readlinkSync(link)).toBeTruthy()
    expect(canonicalizePath(link)).toBe(realDir)
    expect(canonicalizePath(join(home, 'missing-dir'))).toBe(join(home, 'missing-dir'))
  })

  it('falls back to os.homedir when HOME is unset', () => {
    delete process.env['HOME']
    expect(getUserHomeDir()).toBe(homedir())
  })
})

describe('project config layout', () => {
  it('names the config directory .black', () => {
    expect(CONFIG_DIR_NAME).toBe('.black')
  })
})
