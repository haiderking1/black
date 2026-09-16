import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as Effect from 'effect/Effect'
import type { InstructionFile } from '../../../contracts/instructions'
import { describeRpcError, useRpcClient } from '../../rpc'
import { InstructionEditor } from './InstructionEditor'
import { useT } from '../../i18n'
import './instructions.css'

export function ProjectInstructions({ workingDirectory, onDirtyChange }: { workingDirectory?: string; onDirtyChange?: (dirty: boolean) => void }) {
  const t = useT()
  const client = useRpcClient()
  const [snapshot, setSnapshot] = useState<{ files: readonly InstructionFile[]; globalExcluded: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [epoch, setEpoch] = useState(0)
  const dirty = useRef(new Set<string>())
  const generation = useRef(0)
  const reportDirty = useCallback((path: string, changed: boolean) => {
    if (changed) dirty.current.add(path); else dirty.current.delete(path)
    onDirtyChange?.(dirty.current.size > 0)
  }, [onDirtyChange])
  const reload = useCallback(async () => {
    if (!client) return
    const current = ++generation.current
    setLoading(true); setError(null)
    try {
      const result = await Effect.runPromise(client['instructions.list']({ ...(workingDirectory ? { workingDirectory } : {}) }))
      if (current === generation.current) { setSnapshot(result); setEpoch(value => value + 1) }
    } catch (error) { if (current === generation.current) setError(describeRpcError(error)) }
    finally { if (current === generation.current) setLoading(false) }
  }, [client, workingDirectory])
  useEffect(() => { void reload(); return () => { generation.current++ } }, [reload])
  async function save(file: InstructionFile, content: string) {
    if (!client) throw new Error(t('instructions.notConnected'))
    try {
      const result = await Effect.runPromise(client['instructions.save']({ ...(workingDirectory ? { workingDirectory } : {}), path: file.path, revision: file.revision, content }))
      // Update only the saved row; other open drafts keep their original revisions.
      const saved = result.files.find(row => row.path === file.path)
      if (saved) setSnapshot(previous => previous ? { ...previous, files: previous.files.map(row => row.path === file.path ? saved : row) } : result)
    } catch (error) { throw new Error(describeRpcError(error)) }
  }
  return <section className="instructions-settings">
    <header><span className="instructions-note">{t('instructions.selected')}</span><button type="button" disabled={loading} onClick={() => { if (!dirty.current.size || window.confirm(t('settings.discardReload'))) void reload() }}>{t('instructions.reload')}</button></header>
    <p className="instructions-note">{t('instructions.savedNextRound')}</p>
    {workingDirectory && snapshot && <p className="instructions-note">{snapshot.globalExcluded ? t('instructions.replaceGlobal') : t('instructions.usesGlobal')}</p>}
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">{t('instructions.loading')}</p>}
    {!loading && snapshot?.files.length === 0 && <p>{t('instructions.none')}</p>}
    {snapshot?.files.filter(file => !workingDirectory || file.scope !== 'All workspaces').map(file => <InstructionEditor key={file.path + ':' + epoch} file={file} save={save} reportDirty={reportDirty} />)}
  </section>
}
