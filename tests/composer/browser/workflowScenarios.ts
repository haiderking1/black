import { readSettings } from '../../../frontend/settings/settingsStore'
import type { harness } from './entry'
const settle = () => new Promise(resolve => setTimeout(resolve, 50))
function radio(mode: string) {
  const input = document.querySelector<HTMLInputElement>('input[name="workflow"][value="' + mode + '"]')
  if (!input) throw new Error('Missing workflow control: ' + mode)
  return input
}
export async function workflowScenarios(fixture: typeof harness): Promise<string[]> {
  fixture.mountSettings()
  radio('standard').click()
  await settle()
  if (readSettings(localStorage).workflow !== 'standard') throw new Error('Workflow choice was not saved')
  fixture.mountSettings()
  if (!radio('standard').checked) throw new Error('Workflow choice did not survive remount')
  document.querySelector<HTMLButtonElement>('.settings-reset-button')!.click()
  await settle()
  if (!radio('compute').checked || readSettings(localStorage).workflow !== 'compute') throw new Error('Reset did not restore Compute')
  radio('compute').focus()
  return ['workflow choice persists and Reset restores Compute']
}
