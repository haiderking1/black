import type { ModelInfo } from '../../../contracts/providers'
import { DEFAULT_SETTINGS, readSettings, writeSettings } from '../../../frontend/settings/settingsStore'
import type { harness } from './entry'

const model: ModelInfo = { id: 'fixture-model', ownedBy: 'fixture', created: 1, thinkingKind: 'effort', thinkingLevels: ['low', 'high', 'max'] }
const settle = () => new Promise(resolve => setTimeout(resolve, 40))
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
function picker() {
  const button = document.querySelector<HTMLButtonElement>('button[aria-label="Thinking level"]')
  assert(button, 'Missing thinking picker')
  return button
}
function label() { return picker().querySelector('.composer-picker-label')?.textContent }
async function send() {
  const input = document.querySelector<HTMLTextAreaElement>('.composer-textarea')!
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Hello')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  document.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click()
  await settle()
}

export async function scenarios(fixture: typeof harness): Promise<string[]> {
  const passed: string[] = []
  writeSettings(localStorage, { ...DEFAULT_SETTINGS, selectedModelId: model.id, thinkingLevel: 'max' })
  fixture.mount()
  await settle()
  assert(label() === 'Default' && picker().disabled, 'Cold start must expose only Default')
  assert(readSettings(localStorage).thinkingLevel === 'max', 'Cold start overwrote saved Max')
  await send()
  assert(fixture.sent()?.thinkingLevel === 'default', 'Cold start sent an unverified effort')
  fixture.mount([model])
  await settle()
  assert(label() === 'Max', 'Published levels did not restore saved Max')
  passed.push('cold startup preserves preference and sends only the usable level')

  picker().click()
  await settle()
  const high = [...document.querySelectorAll<HTMLButtonElement>('button[role=option]')].find(button => button.textContent === 'High')
  assert(high, 'Missing High option')
  high.click()
  await settle()
  assert(readSettings(localStorage).thinkingLevel === 'high', 'Explicit selection was not saved')
  fixture.mount()
  await settle()
  assert(readSettings(localStorage).thinkingLevel === 'high', 'Restart overwrote chosen High')
  fixture.mount([model])
  await settle()
  assert(label() === 'High', 'Restart failed to restore High')
  await send()
  assert(fixture.sent()?.thinkingLevel === 'high', 'Submission lost restored High')
  passed.push('explicit choice survives a cold remount and reaches submission')

  for (const unresolved of [[], [{ ...model, thinkingKind: 'unknown', thinkingLevels: [] }], [{ id: model.id, ownedBy: 'fixture', created: 1 }]] as readonly ModelInfo[][]) {
    fixture.mount(unresolved)
    await settle()
    assert(label() === 'Default' && picker().disabled, 'Unverified metadata enabled custom effort')
    assert(readSettings(localStorage).thinkingLevel === 'high', 'Missing metadata erased the preference')
  }
  fixture.mount([{ ...model, thinkingLevels: ['low'] }])
  await settle()
  assert(label() === 'Low', 'Incompatible preference was not clamped for display')
  await send()
  assert(fixture.sent()?.thinkingLevel === 'low', 'Unsupported preference leaked into submission')
  assert(readSettings(localStorage).thinkingLevel === 'high', 'Temporary clamp replaced saved preference')
  fixture.mount([model])
  await settle()
  assert(label() === 'High', 'Metadata recovery failed to restore preferred level')
  passed.push('missing metadata and incompatible models never overwrite the preference')
  return passed
}
