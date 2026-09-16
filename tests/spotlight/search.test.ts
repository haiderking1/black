import { describe, expect, it } from 'bun:test'

import type { DirectoryEntry } from '../../contracts/fs'
import type { ProjectItemData } from '../../frontend/spotlight'
import {
  filterDirectories,
  filterProjects,
  matchesHaystack,
} from '../../frontend/spotlight/filter'
import {
  backspaceAction,
  clampIndex,
  firstSearchIndex,
  isSearchTextKey,
  nextIndex,
} from '../../frontend/spotlight/keys'

function project(id: string, name: string, path: string): ProjectItemData {
  return { id, name, path }
}

function dir(name: string, path = `/tmp/${name}`): DirectoryEntry {
  return { name, path, isDirectory: true, isHidden: name.startsWith('.') }
}

const catalog: readonly ProjectItemData[] = [
  project('1', 'black', '/home/soka/code/black'),
  project('2', 'Nexus', '/projects/nexus'),
  project('3', 'notes', '/home/soka/notes'),
]

const folders: readonly DirectoryEntry[] = [
  dir('src'),
  dir('tests'),
  dir('.git'),
  dir('node_modules'),
]

describe('filterProjects', () => {
  it('returns everything for an empty query', () => {
    expect(filterProjects(catalog, '')).toEqual(catalog)
    expect(filterProjects(catalog, '   ')).toEqual(catalog)
  })

  it('matches on the project name', () => {
    expect(filterProjects(catalog, 'nex').map((item) => item.id)).toEqual(['2'])
  })

  it('matches on the path so a parent directory finds its projects', () => {
    expect(filterProjects(catalog, 'code').map((item) => item.id)).toEqual(['1'])
    expect(filterProjects(catalog, '/home/soka').map((item) => item.id)).toEqual(['1', '3'])
  })

  it('ignores case and surrounding space', () => {
    expect(filterProjects(catalog, '  BLACK ').map((item) => item.id)).toEqual(['1'])
  })

  it('returns nothing when nothing matches, rather than everything', () => {
    expect(filterProjects(catalog, 'nope')).toEqual([])
  })
})

describe('filterDirectories', () => {
  it('returns everything for an empty query', () => {
    expect(filterDirectories(folders, '')).toEqual(folders)
    expect(filterDirectories(folders, '   ')).toEqual(folders)
  })

  it('matches on the folder name', () => {
    expect(filterDirectories(folders, 'src').map((item) => item.name)).toEqual(['src'])
  })

  it('does not match on the absolute path, which is shared by every row', () => {
    expect(filterDirectories(folders, 'tmp')).toEqual([])
  })

  it('ignores case', () => {
    expect(filterDirectories(folders, 'GIT').map((item) => item.name)).toEqual(['.git'])
  })

  it('returns nothing when nothing matches', () => {
    expect(filterDirectories(folders, 'nope')).toEqual([])
  })
})

describe('matchesHaystack', () => {
  const haystack = 'local folder browse a folder on disk'

  it('keeps the row until a query is typed', () => {
    expect(matchesHaystack(haystack, '')).toBe(true)
    expect(matchesHaystack(haystack, '   ')).toBe(true)
  })

  it('matches a word from the labels', () => {
    expect(matchesHaystack(haystack, 'local')).toBe(true)
    expect(matchesHaystack(haystack, 'browse')).toBe(true)
  })

  it('drops the row when the query names something else', () => {
    expect(matchesHaystack(haystack, 'black')).toBe(false)
  })
})

describe('nextIndex', () => {
  it('starts at the first row on Down when nothing is highlighted', () => {
    expect(nextIndex(null, 1, 4)).toBe(0)
  })

  it('starts at the last row on Up when nothing is highlighted', () => {
    expect(nextIndex(null, -1, 4)).toBe(3)
  })

  it('moves within the list and stops at the ends', () => {
    expect(nextIndex(0, 1, 4)).toBe(1)
    expect(nextIndex(3, 1, 4)).toBe(3)
    expect(nextIndex(0, -1, 4)).toBe(0)
  })

  it('is null when there are no rows', () => {
    expect(nextIndex(null, 1, 0)).toBeNull()
    expect(nextIndex(2, 1, 0)).toBeNull()
  })
})

describe('clampIndex', () => {
  it('keeps a highlight that still fits', () => {
    expect(clampIndex(2, 5)).toBe(2)
    expect(clampIndex(0, 1)).toBe(0)
  })

  it('pulls a stale highlight onto the last remaining row', () => {
    expect(clampIndex(5, 2)).toBe(1)
  })

  it('is null when nothing is highlighted or the list is empty', () => {
    expect(clampIndex(null, 4)).toBeNull()
    expect(clampIndex(0, 0)).toBeNull()
    expect(clampIndex(3, 0)).toBeNull()
  })
})

describe('firstSearchIndex', () => {
  it('stays on Local folder when the query is empty', () => {
    expect(firstSearchIndex('', true, 3)).toBe(0)
    expect(firstSearchIndex('   ', true, 3)).toBe(0)
  })

  it('skips Local folder once a query matches real projects', () => {
    expect(firstSearchIndex('bla', true, 1)).toBe(1)
  })

  it('keeps Local folder when it is the only remaining row', () => {
    expect(firstSearchIndex('local', true, 0)).toBe(0)
  })

  it('starts at the first project when Local folder is hidden', () => {
    expect(firstSearchIndex('bla', false, 2)).toBe(0)
  })
})

describe('isSearchTextKey', () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false, isComposing: false }

  it('treats a character as type-to-search', () => {
    expect(isSearchTextKey({ ...base, key: 'b' })).toBe(true)
    expect(isSearchTextKey({ ...base, key: 'B' })).toBe(true)
    expect(isSearchTextKey({ ...base, key: '/' })).toBe(true)
    expect(isSearchTextKey({ ...base, key: ' ' })).toBe(true)
  })

  it('leaves navigation and editing keys to their own handlers', () => {
    expect(isSearchTextKey({ ...base, key: 'ArrowDown' })).toBe(false)
    expect(isSearchTextKey({ ...base, key: 'Enter' })).toBe(false)
    expect(isSearchTextKey({ ...base, key: 'Escape' })).toBe(false)
    expect(isSearchTextKey({ ...base, key: 'Backspace' })).toBe(false)
    expect(isSearchTextKey({ ...base, key: 'Tab' })).toBe(false)
  })

  it('ignores shortcuts and composing keystrokes', () => {
    expect(isSearchTextKey({ ...base, key: 'k', ctrlKey: true })).toBe(false)
    expect(isSearchTextKey({ ...base, key: 'k', metaKey: true })).toBe(false)
    expect(isSearchTextKey({ ...base, key: 'b', altKey: true })).toBe(false)
    expect(isSearchTextKey({ ...base, key: 'b', isComposing: true })).toBe(false)
    expect(isSearchTextKey({ ...base, key: 'Process' })).toBe(false)
  })
})

describe('backspaceAction', () => {
  it('edits while the field still has text, including held Backspace', () => {
    expect(backspaceAction({ fieldValue: 'src', repeat: false, composing: false })).toBe('edit')
    expect(backspaceAction({ fieldValue: 's', repeat: false, composing: false })).toBe('edit')
    expect(backspaceAction({ fieldValue: 'sr', repeat: true, composing: false })).toBe('edit')
  })

  it('does not leave the folder on key-repeat after the field is empty', () => {
    expect(backspaceAction({ fieldValue: '', repeat: true, composing: false })).toBe('ignore')
  })

  it('leaves only on a fresh Backspace against an empty field', () => {
    expect(backspaceAction({ fieldValue: '', repeat: false, composing: false })).toBe('leave')
  })

  it('does not steal composing Backspace', () => {
    expect(backspaceAction({ fieldValue: 'س', repeat: false, composing: true })).toBe('ignore')
    expect(backspaceAction({ fieldValue: '', repeat: false, composing: true })).toBe('ignore')
  })
})
