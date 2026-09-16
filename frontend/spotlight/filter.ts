import type { DirectoryEntry } from '../../contracts/fs'
import type { ProjectItemData } from './ProjectList'

function needleOf(query: string): string {
  return query.trim().toLowerCase()
}

/**
 * Projects matching a query.
 *
 * Name and path both count, so typing a folder name or a parent directory
 * lands on the same row.
 */
export function filterProjects(
  projects: readonly ProjectItemData[],
  query: string,
): readonly ProjectItemData[] {
  const needle = needleOf(query)
  if (needle === '') return projects

  return projects.filter(
    (project) =>
      project.name.toLowerCase().includes(needle) || project.path.toLowerCase().includes(needle),
  )
}

/**
 * Directories matching a query.
 *
 * Only the folder name is searchable. The absolute path is the same prefix
 * for every row in a listing, so matching on it would keep every folder.
 */
export function filterDirectories(
  entries: readonly DirectoryEntry[],
  query: string,
): readonly DirectoryEntry[] {
  const needle = needleOf(query)
  if (needle === '') return entries
  return entries.filter((entry) => entry.name.toLowerCase().includes(needle))
}

/**
 * Whether a haystack (translated labels plus English aliases) still matches.
 *
 * Used for the Local folder row, which has no path of its own.
 */
export function matchesHaystack(haystack: string, query: string): boolean {
  const needle = needleOf(query)
  if (needle === '') return true
  return haystack.toLowerCase().includes(needle)
}
