import { realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { APP_NAME, CONFIG_DIR_NAME, expandTildePath, getAgentDir } from './agentDir'

/**
 * Expand a leading home marker and resolve the result against a base directory
 * (the process cwd by default). Relative inputs become absolute; absolute and
 * home-anchored inputs pass through resolution untouched.
 */
export function resolvePath(input: string, baseDir: string = process.cwd()): string {
  return resolve(baseDir, expandTildePath(input))
}

/**
 * Resolve symlinks when the target exists; return the input unchanged when it
 * does not (or when the filesystem walk fails mid-way).
 */
export function canonicalizePath(input: string): string {
  try {
    return realpathSync(input)
  } catch {
    return input
  }
}

/** Path to the global settings file, for example ~/.black/agent/settings.json. */
export function getSettingsPath(): string {
  return join(getAgentDir(), 'settings.json')
}

/** Path to the provider credentials file. */
export function getAuthPath(): string {
  return join(getAgentDir(), 'auth.json')
}

/** Path to the model catalog overrides file. */
export function getModelsPath(): string {
  return join(getAgentDir(), 'models.json')
}

/** Directory holding user-installed themes. */
export function getCustomThemesDir(): string {
  return join(getAgentDir(), 'themes')
}

/** Directory holding user tools. */
export function getToolsDir(): string {
  return join(getAgentDir(), 'tools')
}

/** Directory holding managed binaries. */
export function getBinDir(): string {
  return join(getAgentDir(), 'bin')
}

/** Directory holding prompt templates. */
export function getPromptsDir(): string {
  return join(getAgentDir(), 'prompts')
}

/** Path to the rolling debug log. */
export function getDebugLogPath(): string {
  return join(getAgentDir(), APP_NAME + '-debug.log')
}

/** Per-project config directory, for example <project>/.black. */
export function getProjectConfigDir(cwd: string): string {
  return join(resolvePath(cwd), CONFIG_DIR_NAME)
}

/** Per-project settings file, for example <project>/.black/settings.json. */
export function getProjectSettingsPath(cwd: string): string {
  return join(getProjectConfigDir(cwd), 'settings.json')
}
