import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { connectProtocol } from '../../working/browser/protocol'

const executable = Bun.which('chromium') ?? Bun.which('chromium-browser')
if (!executable) throw new Error('Chromium is not installed')
const directory = await mkdtemp(join(tmpdir(), 'black-composer-browser-'))
let browser: ReturnType<typeof Bun.spawn> | undefined
let server: ReturnType<typeof Bun.serve> | undefined
let protocol: Awaited<ReturnType<typeof connectProtocol>> | undefined
try {
  const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, 'entry.tsx')], outdir: directory,
    target: 'browser', format: 'iife', loader: { '.svg': 'file' } })
  if (!built.success) throw new Error(built.logs.join('\n'))
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const path = new URL(request.url).pathname
    if (path === '/') return new Response('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/entry.css"></head><body><div id="root"></div><script src="/entry.js"></script></body></html>', { headers: { 'Content-Type': 'text/html' } })
    if (!/^\/[a-zA-Z0-9_.-]+$/.test(path)) return new Response('Not found', { status: 404 })
    const file = Bun.file(join(directory, path.slice(1)))
    return await file.exists() ? new Response(file) : new Response('Not found', { status: 404 })
  } })
  browser = Bun.spawn([executable, '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + join(directory, 'profile'), 'about:blank'], { stdout: 'ignore', stderr: Bun.file(join(directory, 'chromium.log')) })
  let port = ''
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(directory, 'profile', 'DevToolsActivePort'), 'utf8')).split('\n')[0] ?? '' } catch { /* Browser still starting. */ }
    if (port) break
    if (browser.exitCode !== null) throw new Error('Chromium exited: ' + await readFile(join(directory, 'chromium.log'), 'utf8'))
    await Bun.sleep(50)
  }
  if (!port) throw new Error('Chromium did not start')
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json')).json() as Array<{ type: string; webSocketDebuggerUrl: string }>
  const page = pages.find(target => target.type === 'page')
  if (!page) throw new Error('Chromium has no page')
  protocol = await connectProtocol(page.webSocketDebuggerUrl)
  await protocol.send('Page.enable')
  await protocol.send('Runtime.enable')
  await protocol.send('Page.navigate', { url: 'http://127.0.0.1:' + server.port })
  const evaluate = async (expression: string) => {
    const reply = await protocol!.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? JSON.stringify(reply.exceptionDetails))
    return reply.result.value
  }
  for (let i = 0; i < 100; i++) {
    if (await evaluate('Boolean(window.composerHarness)')) break
    await Bun.sleep(50)
  }
  if (!await evaluate('Boolean(window.composerHarness)')) throw new Error('Fixture did not mount: ' + JSON.stringify(protocol.errors) + ' ' + await evaluate('document.documentElement.outerHTML'))
  await Bun.sleep(150)
  const passed: string[] = await evaluate('window.composerHarness.scenarios()')
  await protocol.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await protocol.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await Bun.sleep(80)
  if (!await evaluate("document.querySelector('input[value=standard]').checked && JSON.parse(localStorage.getItem('black_settings_v1')).workflow === 'standard'")) throw new Error('Native keyboard workflow selection failed')
  passed.push('native arrow keys select and save the workflow')
  await protocol.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: false })
  await Bun.sleep(50)
  if (!await evaluate('document.documentElement.scrollWidth <= window.innerWidth')) throw new Error('Workflow settings overflow at 360px')
  passed.push('workflow settings fit a 360px viewport')
  await protocol.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false })
  await Bun.sleep(50)
  const screenshot = await protocol.send('Page.captureScreenshot', { format: 'png' })
  await writeFile('/tmp/black-workflow-chromium.png', Buffer.from(screenshot.data, 'base64'))
  await evaluate('window.composerHarness.prepareCacheRestart()')
  await evaluate('window.composerHarness = undefined')
  await protocol.send('Page.reload')
  for (let i = 0; i < 100; i++) {
    if (await evaluate('Boolean(window.composerHarness)')) break
    await Bun.sleep(50)
  }
  passed.push(await evaluate('window.composerHarness.verifyCacheRestart()'))
  if (protocol.errors.length) throw new Error(JSON.stringify(protocol.errors))
  console.log(JSON.stringify({ passed }, null, 2))
} finally {
  protocol?.close()
  if (browser) { browser.kill(); await browser.exited }
  await server?.stop(true)
  await rm(directory, { recursive: true, force: true })
}
