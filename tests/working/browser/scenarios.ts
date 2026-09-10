import { isInspectingWork } from '../../../frontend/working/inspection'
import { replay, rounds } from '../fixtures'

const wait = () => new Promise(resolve => setTimeout(resolve, 100))
function check(condition: unknown, message: string): void { if (!condition) throw new Error(message) }
const header = () => document.querySelector<HTMLButtonElement>('.working-header')!
const scroll = () => document.getElementById('scroll')!

export async function runScenarios(): Promise<string[]> {
  const passed: string[] = []
  const originalHeight = scroll().style.height
  scroll().style.height = '10000px'
  window.workingHarness.jump()
  await wait()
  header().focus()
  header().click()
  await wait()
  header().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await wait()
  check(document.getElementById('pinned')!.textContent === 'false', 'work inspection pauses following')
  check(document.getElementById('at-bottom')!.textContent === 'true', 'opening work at bottom does not imply hidden content')
  header().click()
  await wait()
  check(document.getElementById('at-bottom')!.textContent === 'true', 'collapsing work at bottom keeps arrow hidden')
  scroll().style.height = originalHeight
  await wait()
  check(document.getElementById('at-bottom')!.textContent === 'false', 'viewport resize detects content below without a scroll event')
  ;(document.activeElement as HTMLElement)?.blur()
  window.workingHarness.jump()
  await wait()
  check(document.getElementById('at-bottom')!.textContent === 'true', 'jumping to bottom clears hidden-content state')
  passed.push('bottom position independent of work inspection')
  check(header().getAttribute('aria-expanded') === 'false', 'new activity starts collapsed')
  header().click()
  await wait()
  check(document.querySelectorAll('.working-header').length === 1, 'one main work group per turn')
  const section = document.querySelector('.working-section')!
  check(!section.textContent!.includes('Before read.'), 'spoken text stays outside work')
  check(document.querySelector('.assistant-turn')!.textContent!.includes('Before read.'), 'spoken text remains visible')
  check(!section.textContent!.includes('Final '), 'final answer outside work')
  passed.push('chronology and final split')

  header().focus()
  check(isInspectingWork(scroll()), 'focused header counts as inspection')
  header().click()
  await wait()
  check(header().getAttribute('aria-expanded') === 'false', 'header click collapses')
  check(document.getElementById(header().getAttribute('aria-controls')!)!.hidden, 'controlled body hidden')
  window.workingHarness.patch({ type: 'text', round: 2, text: 'answer.' })
  await wait()
  check(header().getAttribute('aria-expanded') === 'false', 'stream does not reset manual collapse')
  window.workingHarness.patch({ type: 'done', stopReason: 'stop' })
  await wait()
  window.workingHarness.remount()
  await wait()
  check(header().getAttribute('aria-expanded') === 'false', 'saved choice survives replay/remount')
  check([...document.querySelectorAll('.working-header')].some(node => node.textContent!.includes('Worked for')), 'completed recorded duration')
  passed.push('toggle persistence and recorded duration')

  header().click()
  await wait()
  const label = header().textContent
  document.getElementById('next-prompt')!.textContent = 'Next prompt'
  await wait()
  check(header().getAttribute('aria-expanded') === 'true', 'next prompt never forces collapse')
  check(header().textContent === label, 'elapsed label does not change on replay')
  passed.push('conservative collapse policy')

  // Native scroll events release following; a token arriving afterwards must not pull it back.
  const scrollingTurn = replay(rounds.slice(0, 11))
  scrollingTurn.work!.expanded = true
  window.workingHarness.replace(scrollingTurn)
  await wait()
  ;(document.activeElement as HTMLElement)?.blur()
  scroll().scrollTop = 180
  scroll().dispatchEvent(new Event('scroll', { bubbles: true }))
  await wait()
  check(document.getElementById('pinned')!.textContent === 'false', 'scrolling up releases follow')
  check(document.getElementById('at-bottom')!.textContent === 'false', 'scrolling up shows the jump arrow')
  const before = scroll().scrollTop
  window.workingHarness.patch({ type: 'text', round: 2, text: '\n\n' + 'New answer line.\n\n'.repeat(50) })
  await wait()
  check(Math.abs(scroll().scrollTop - before) < 2, 'stream leaves unpinned scroll position alone')
  header().click()
  await wait()
  check(Math.abs(scroll().scrollTop - before) < 2, 'collapse does not steal scroll from older history')
  passed.push('unpinned streaming and toggle scroll')

  header().click()
  await wait()
  const text = document.querySelector('.working-header span')!
  const selection = document.getSelection()!
  const range = document.createRange()
  range.selectNodeContents(text)
  selection.removeAllRanges()
  selection.addRange(range)
  check(isInspectingWork(scroll()), 'selected work counts as inspection')
  selection.removeAllRanges()
  passed.push('selection inspection')

  window.workingHarness.replace(replay([...rounds.slice(0, 4),
    { type: 'tool_result', round: 0, toolCallId: 'read', toolResult: 'Unique failure body', toolIsError: true },
    { type: 'done', stopReason: 'aborted' }]))
  await wait()
  check(!document.body.innerText.includes('Unique failure body'), 'collapsed group hides error details')
  const failedHeader = header()
  check(!failedHeader.textContent!.includes('Tool failed'), 'tool errors stay inside the main group')
  failedHeader.click()
  await wait()
  check(document.body.innerText.split('Unique failure body').length === 2, 'expanding shows error exactly once')
  failedHeader.click()
  await wait()
  check(!document.body.innerText.includes('Unique failure body'), 'error respects collapsing again')
  check(!header().textContent!.includes('Working for '), 'cancelled work is not active')
  passed.push('collapsed failure and stop state')

  window.workingHarness.replace(replay(rounds))
  await wait()
  header().click()
  await wait()
  header().focus()
  return passed
}
