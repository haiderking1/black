import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('bash timeout, abort and inherited pipes work in a Node host', async () => {
  const node = Bun.which('node')
  if (!node) throw new Error('Node is required for Electron runtime regression tests')
  const directory = await mkdtemp(join(tmpdir(), 'black-bash-node-'))
  let child: ReturnType<typeof Bun.spawn> | undefined
  try {
    const built = await Bun.build({ entrypoints: [join(import.meta.dir, 'node.fixture.ts')], outdir: directory, naming: '[name].mjs', target: 'node' })
    if (!built.success) throw new Error(built.logs.join('\n'))
    const running = Bun.spawn([node, join(directory, 'node.fixture.mjs')], { stdout: 'pipe', stderr: 'pipe' })
    child = running
    const [code, stdout, stderr] = await Promise.all([running.exited, new Response(running.stdout).text(), new Response(running.stderr).text()])
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
    expect(stdout).toContain('Node bash lifecycle passed')
  } finally {
    if (child) { child.kill(); await child.exited }
    await rm(directory, { recursive: true, force: true })
  }
})
