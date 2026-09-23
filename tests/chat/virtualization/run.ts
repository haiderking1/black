import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { connectProtocol } from '../../working/browser/protocol'

const executable = Bun.which('chromium') ?? Bun.which('chromium-browser')
if (!executable) throw new Error('Chromium is not installed')
const directory = await mkdtemp(join(tmpdir(), 'black-virtual-transcript-'))
let browser: ReturnType<typeof Bun.spawn> | undefined
let server: ReturnType<typeof Bun.serve> | undefined
let protocol: Awaited<ReturnType<typeof connectProtocol>> | undefined
try {
  const built = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'fixture.tsx')],
    outdir: directory,
    target: 'browser',
    format: 'iife',
  })
  if (!built.success) throw new Error(built.logs.join('\n'))
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const path = new URL(request.url).pathname
    if (path === '/') {
      return new Response('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>', {
        headers: { 'Content-Type': 'text/html' },
      })
    }
    if (!/^\/[a-zA-Z0-9_.-]+$/.test(path)) return new Response('Not found', { status: 404 })
    const file = Bun.file(join(directory, path.slice(1)))
    return await file.exists() ? new Response(file) : new Response('Not found', { status: 404 })
  } })
  browser = Bun.spawn([
    executable,
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--user-data-dir=' + join(directory, 'profile'),
    'about:blank',
  ], { stdout: 'ignore', stderr: Bun.file(join(directory, 'chromium.log')) })

  let port = ''
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = (await readFile(join(directory, 'profile', 'DevToolsActivePort'), 'utf8')).split('\n')[0] ?? ''
    } catch {
      // Chromium has not created its debugging port yet.
    }
    if (port !== '') break
    if (browser.exitCode !== null) throw new Error('Chromium exited: ' + await readFile(join(directory, 'chromium.log'), 'utf8'))
    await Bun.sleep(50)
  }
  if (port === '') throw new Error('Chromium did not start')

  const pages = await (await fetch('http://127.0.0.1:' + port + '/json')).json() as Array<{ type: string; webSocketDebuggerUrl: string }>
  const page = pages.find((target) => target.type === 'page')
  if (page === undefined) throw new Error('Chromium has no page')
  protocol = await connectProtocol(page.webSocketDebuggerUrl)
  await protocol.send('Page.enable')
  await protocol.send('Runtime.enable')
  await protocol.send('Page.navigate', { url: 'http://127.0.0.1:' + server.port })
  const evaluate = async (expression: string): Promise<unknown> => {
    const reply = await protocol!.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? JSON.stringify(reply.exceptionDetails))
    return reply.result.value
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate('Boolean(window.virtualTranscriptHarness)')) break
    await Bun.sleep(50)
  }
  if (!await evaluate('Boolean(window.virtualTranscriptHarness)')) throw new Error('Virtual transcript fixture did not mount')
  await Bun.sleep(250)

  const layout = await evaluate('window.virtualTranscriptHarness.layout()') as { display: string; paddingTop: string; paddingBottom: string }
  if (layout.display !== 'block' || layout.paddingTop !== '0px' || layout.paddingBottom !== '0px') {
    throw new Error('Virtual transcript layout overrides were not applied: ' + JSON.stringify(layout))
  }
  const initial = await evaluate('window.virtualTranscriptHarness.renderedIndexes()') as number[]
  if (await evaluate('window.virtualTranscriptHarness.totalCount()') !== 5000) throw new Error('Fixture did not create 5000 transcript items')
  if (initial.length === 0 || initial.length > 40) throw new Error('Expected a small visible range, got ' + initial.length + ' rows')
  if (!initial.some((index) => index >= 4900)) throw new Error('Opening the transcript did not stay at the latest messages: ' + initial.join(','))

  await evaluate('window.virtualTranscriptHarness.scrollToIndex(2500)')
  await Bun.sleep(150)
  const middle = await evaluate('window.virtualTranscriptHarness.renderedIndexes()') as number[]
  if (middle.length === 0 || middle.length > 40) throw new Error('Scrolling rendered too many rows: ' + middle.length)
  if (!middle.some((index) => index > 1800 && index < 3200)) throw new Error('Virtual range did not follow the scroll position: ' + middle.join(','))

  const savedAnchor = await evaluate('window.virtualTranscriptHarness.visibleAnchor()') as { key: string; offset: number } | null
  if (savedAnchor === null) throw new Error('The scrolled session did not expose a visible anchor row')

  await evaluate('window.virtualTranscriptHarness.switchSession("second")')
  await Bun.sleep(200)
  await evaluate('window.virtualTranscriptHarness.trimFirstPrefix(1000)')
  if (await evaluate('window.virtualTranscriptHarness.totalCount()') !== 3000) throw new Error('The second session did not load')
  const second = await evaluate('window.virtualTranscriptHarness.renderedIndexes()') as number[]
  if (!second.some((index) => index >= 2900)) {
    throw new Error('A session without a saved position did not open at its latest messages: ' + second.join(','))
  }

  await evaluate('window.virtualTranscriptHarness.switchSession("first")')
  await Bun.sleep(200)
  const restoredAnchor = await evaluate('window.virtualTranscriptHarness.visibleAnchor()') as { key: string; offset: number } | null
  if (restoredAnchor?.key !== savedAnchor.key) {
    throw new Error('Returning to a session did not restore its visible row: ' + JSON.stringify({ savedAnchor, restoredAnchor }))
  }
  if (Math.abs(restoredAnchor.offset - savedAnchor.offset) > 2) {
    throw new Error('Returning to a session shifted the saved row: ' + JSON.stringify({ savedAnchor, restoredAnchor }))
  }

  await evaluate('window.virtualTranscriptHarness.trimFirstPrefix(1500)')
  await Bun.sleep(200)
  const compactedAnchor = await evaluate('window.virtualTranscriptHarness.visibleAnchor()') as { key: string; offset: number } | null
  if (compactedAnchor?.key !== restoredAnchor.key || Math.abs(compactedAnchor.offset - restoredAnchor.offset) > 2) {
    throw new Error('Compaction shifted the reader away from its visible row: ' + JSON.stringify({ restoredAnchor, compactedAnchor }))
  }

  const replacementId = await evaluate('window.virtualTranscriptHarness.replaceVisibleAnchor()') as string | null
  if (replacementId === null) throw new Error('Could not replace a visible transcript row')
  await Bun.sleep(200)
  const replacedAnchor = await evaluate('window.virtualTranscriptHarness.visibleAnchor()') as { key: string; offset: number } | null
  if (replacedAnchor?.key !== replacementId || Math.abs(replacedAnchor.offset - compactedAnchor.offset) > 2) {
    throw new Error('Replacing a row with the same count reused a stale measurement: ' + JSON.stringify({ compactedAnchor, replacedAnchor, replacementId }))
  }

  await evaluate('window.virtualTranscriptHarness.trimFirstPrefix(3000)')
  await Bun.sleep(200)
  const deletedAnchorFallback = await evaluate('window.virtualTranscriptHarness.visibleAnchor()') as { key: string; offset: number } | null
  if (deletedAnchorFallback?.key !== 'first-message-3000') {
    throw new Error('Compaction did not move a deleted anchor to the first retained message: ' + JSON.stringify({ replacedAnchor, deletedAnchorFallback }))
  }

  await evaluate('window.virtualTranscriptHarness.scrollToIndex(0)')
  await Bun.sleep(150)
  const top = await evaluate('window.virtualTranscriptHarness.renderedIndexes()') as number[]
  if (!top.includes(0)) throw new Error('Returning to the top did not render the first message')
  if (top.length > 40) throw new Error('Returning to the top rendered too many rows: ' + top.length)

  console.log(JSON.stringify({
    total: 5000,
    renderedAtStart: initial.length,
    renderedInMiddle: middle.length,
    restoredAnchor: restoredAnchor.key,
    compactedAnchor: compactedAnchor.key,
    replacedAnchor: replacedAnchor.key,
    deletedAnchorFallback: deletedAnchorFallback.key,
    renderedAtTop: top.length,
  }, null, 2))
} finally {
  protocol?.close()
  if (browser) {
    browser.kill()
    await browser.exited
  }
  await server?.stop(true)
  await rm(directory, { recursive: true, force: true })
}
