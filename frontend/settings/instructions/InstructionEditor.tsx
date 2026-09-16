import React, { useEffect, useState } from 'react'
import type { InstructionFile } from '../../../contracts/instructions'
import { useT } from '../../i18n'

export function InstructionEditor({ file, save, reportDirty }: { file: InstructionFile; save: (file: InstructionFile, content: string) => Promise<void>; reportDirty: (path: string, dirty: boolean) => void }) {
  const t = useT()
  const [draft, setDraft] = useState(file.content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = draft !== file.content
  useEffect(() => { reportDirty(file.path, dirty || saving); return () => reportDirty(file.path, false) }, [dirty, saving, file.path, reportDirty])
  async function submit() {
    setSaving(true); setError(null)
    try { await save(file, draft) } catch (error) { setError(error instanceof Error ? error.message : String(error)) } finally { setSaving(false) }
  }
  return <details className="instruction-file">
    <summary><span className="instruction-file-name">AGENTS.md</span><span>{file.scope === 'All workspaces' ? t('instructions.scope.global') : t('instructions.scope.project')}</span>{dirty && <span>{t('instructions.unsaved')}</span>}</summary>
    <div className="instruction-editor">
      <div className="instruction-path">{file.path}</div>
      <textarea aria-label={t('instructions.aria', { path: file.path })} spellCheck={false} value={draft} disabled={saving} onChange={event => setDraft(event.target.value)} />
      {error && <p role="alert">{error}</p>}
      <div className="instruction-actions"><button type="button" disabled={!dirty || saving} onClick={() => { setDraft(file.content); setError(null) }}>{t('instructions.discard')}</button><button type="button" disabled={!dirty || saving} onClick={() => void submit()}>{saving ? t('instructions.saving') : t('instructions.save')}</button></div>
    </div>
  </details>
}
