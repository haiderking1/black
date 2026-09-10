import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g

/**
 * How a model writes a path and what the filesystem needs are two different
 * things.
 *
 * Everything here is about that gap. A model copies a non-breaking space out of
 * a document, or pastes an @-prefixed path from a file picker, or writes ~ and
 * expects it to mean something. None of those are valid paths, all of them are
 * what actually arrives.
 */
export function normalizePath(input: string, homeDir: string = homedir()): string {
  let path = input.replace(UNICODE_SPACES, ' ')
  if (path.startsWith('@')) {
    path = path.slice(1)
  }
  if (path === '~') {
    return homeDir
  }
  if (path.startsWith('~/')) {
    return homeDir + path.slice(1)
  }
  return path
}

/** Resolve a path a tool was handed against the directory it should be relative to. */
export function resolveToCwd(path: string, cwd: string, homeDir: string = homedir()): string {
  const normalized = normalizePath(path, homeDir)
  return isAbsolute(normalized) ? resolve(normalized) : resolve(cwd, normalized)
}

/** macOS hands out one space in these names and users type another. */
function narrowSpaceVariant(path: string): string {
  return path.replace(/ (AM|PM)\./gi, '\u202F$1.')
}

/** macOS stores filenames decomposed. A typed name is composed. They are not equal bytes. */
function decomposedVariant(path: string): string {
  return path.normalize('NFD')
}

/** macOS screenshots use a typographic apostrophe. A keyboard produces a straight one. */
function curlyQuoteVariant(path: string): string {
  return path.replace(/'/g, '\u2019')
}

/**
 * Resolve a path for reading, trying the shapes a real filename may actually
 * have on disk.
 *
 * Only read does this. A file that cannot be found is worth a few extra
 * lookups; a file that cannot be found when it plainly exists is what makes a
 * model give up and start guessing.
 */
export async function resolveReadPath(path: string, cwd: string, homeDir: string = homedir()): Promise<string> {
  const resolved = resolveToCwd(path, cwd, homeDir)
  const candidates = [
    resolved,
    narrowSpaceVariant(resolved),
    decomposedVariant(resolved),
    curlyQuoteVariant(resolved),
    curlyQuoteVariant(decomposedVariant(resolved))
  ]

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate
    }
  }

  // Nothing matched, so report the path that was asked for rather than a
  // variant the caller never mentioned.
  return resolved
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
