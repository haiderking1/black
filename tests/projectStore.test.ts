import { describe, expect, it } from 'bun:test'
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  DEFAULT_PROJECTS,
  PROJECTS_STORAGE_KEY,
  addProject,
  loadActiveProjectId,
  loadProjects,
  parseProjects,
  removeProject,
  repairedActiveProjectId,
  resolveActiveProject,
  saveActiveProjectId,
  saveProjects,
  type ProjectStorage
} from '../frontend/sidebar/projectStore'
import type { ProjectItemData } from '../frontend/spotlight'

function memoryStorage(initial: Record<string, string> = {}): ProjectStorage {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    }
  }
}

function project(id: string, path = `/tmp/${id}`): ProjectItemData {
  return { id, name: id, path }
}

describe('project persistence', () => {
  it('loads the default workspace when nothing is saved', () => {
    expect(loadProjects(memoryStorage())).toEqual(DEFAULT_PROJECTS)
    expect(loadActiveProjectId(memoryStorage())).toBe('proj-black')
  })

  it('round-trips a saved list and the active pointer', () => {
    const storage = memoryStorage()
    const projects = [project('alpha'), project('beta')]
    saveProjects(storage, projects)
    saveActiveProjectId(storage, 'beta')

    expect(loadProjects(storage)).toEqual(projects)
    expect(loadActiveProjectId(storage)).toBe('beta')
    expect(storage.getItem(PROJECTS_STORAGE_KEY)).not.toBeNull()
    expect(storage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBe('beta')
  })

  it('clears the active pointer when the last project is gone', () => {
    const storage = memoryStorage({ [ACTIVE_PROJECT_STORAGE_KEY]: 'gone' })
    saveActiveProjectId(storage, '')
    expect(storage.getItem(ACTIVE_PROJECT_STORAGE_KEY)).toBeNull()
    expect(loadActiveProjectId(storage)).toBe('proj-black')
  })

  it('rejects a payload that is not an array of projects', () => {
    expect(parseProjects(null)).toBeUndefined()
    expect(parseProjects({ id: 'x' })).toBeUndefined()
    expect(parseProjects('black')).toBeUndefined()
  })

  it('rejects the whole list when any entry is malformed', () => {
    expect(parseProjects([project('ok'), { id: 'bad' }])).toBeUndefined()
    expect(parseProjects([{ id: 1, name: 'n', path: '/p' }])).toBeUndefined()
    expect(loadProjects(memoryStorage({ [PROJECTS_STORAGE_KEY]: '{not json' }))).toEqual(DEFAULT_PROJECTS)
    expect(loadProjects(memoryStorage({ [PROJECTS_STORAGE_KEY]: '[]' }))).toEqual([])
  })

  it('keeps extra fields on a valid saved project', () => {
    const parsed = parseProjects([{ id: 'p', name: 'n', path: '/p', extra: true }])
    expect(parsed).toEqual([{ id: 'p', name: 'n', path: '/p', extra: true } as ProjectItemData & { extra: boolean }])
  })
})

describe('project selection', () => {
  it('resolves a known id and falls back to the first project', () => {
    const projects = [project('a'), project('b')]
    expect(resolveActiveProject(projects, 'b')?.id).toBe('b')
    expect(resolveActiveProject(projects, 'missing')?.id).toBe('a')
    expect(resolveActiveProject([], 'a')).toBeUndefined()
  })

  it('repairs a stale pointer without inventing one for an empty list', () => {
    const projects = [project('a'), project('b')]
    expect(repairedActiveProjectId(projects, 'b')).toBe('b')
    expect(repairedActiveProjectId(projects, 'gone')).toBe('a')
    expect(repairedActiveProjectId([], 'gone')).toBe('gone')
  })
})

describe('project list edits', () => {
  it('activates an already-open path instead of duplicating it', () => {
    const existing = project('alpha', '/work/alpha')
    const projects = [existing, project('beta')]
    const next = addProject(projects, { id: 'dup', name: 'Alpha copy', path: '/work/alpha' })
    expect(next.projects).toBe(projects)
    expect(next.activeId).toBe('alpha')
  })

  it('prepends a new project and selects it', () => {
    const current = [project('old')]
    const added = project('new', '/work/new')
    const next = addProject(current, added)
    expect(next.projects).toEqual([added, ...current])
    expect(next.activeId).toBe('new')
  })

  it('moves the pointer when the active project is removed', () => {
    const projects = [project('a'), project('b')]
    const next = removeProject(projects, 'a', 'a')
    expect(next.projects.map((item) => item.id)).toEqual(['b'])
    expect(next.activeId).toBe('b')
  })

  it('keeps the pointer when a different project is removed', () => {
    const projects = [project('a'), project('b')]
    const next = removeProject(projects, 'a', 'b')
    expect(next.projects.map((item) => item.id)).toEqual(['a'])
    expect(next.activeId).toBe('a')
  })

  it('clears the pointer after removing the last project', () => {
    const next = removeProject([project('only')], 'only', 'only')
    expect(next.projects).toEqual([])
    expect(next.activeId).toBe('')
  })
})
