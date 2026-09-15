// Tail accumulation follows pi's OutputAccumulator. See LICENSE.
// Checked synchronous writes avoid an unbounded WriteStream queue under flooding.
import { closeSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const BASH_MAX_BYTES = 50 * 1024
export const BASH_MAX_LINES = 2000
export class BashOutput {
  private tail = Buffer.alloc(0)
  private bytes = 0
  private newlines = 0
  private fd: number | undefined
  private path: string | undefined
  private finished = false

  append(data: Buffer): void {
    if (this.finished) throw new Error('Bash output is already closed')
    this.bytes += data.length
    for (const byte of data) if (byte === 10) this.newlines++
    if (this.fd === undefined && (this.bytes > BASH_MAX_BYTES || this.newlines >= BASH_MAX_LINES)) {
      const directory = mkdtempSync(join(tmpdir(), 'black-bash-output-'))
      try {
        this.path = join(directory, 'output.log')
        this.fd = openSync(this.path, 'wx', 0o600)
        this.write(this.tail)
      } catch (error) {
        if (this.fd !== undefined) { closeSync(this.fd); this.fd = undefined }
        rmSync(directory, { recursive: true, force: true })
        this.path = undefined
        throw error
      }
    }
    if (this.fd !== undefined) this.write(data)
    // Retain enough bytes to cut a UTF-8 boundary and select the last lines.
    this.tail = Buffer.concat([this.tail, data])
    if (this.tail.length > BASH_MAX_BYTES * 2) this.tail = Buffer.from(this.tail.subarray(-BASH_MAX_BYTES * 2))
  }

  private write(data: Buffer): void {
    let offset = 0
    while (offset < data.length) {
      const count = writeSync(this.fd!, data, offset, data.length - offset)
      if (count <= 0) throw new Error('Unable to write bash output')
      offset += count
    }
  }

  finish(): { content: string; fullOutputPath?: string } {
    this.finished = true
    if (this.fd !== undefined) { const fd = this.fd; this.fd = undefined; closeSync(fd) }
    let start = Math.max(0, this.tail.length - BASH_MAX_BYTES)
    while (start < this.tail.length && (this.tail[start]! & 0xc0) === 0x80) start++
    const content = this.tail.subarray(start).toString('utf8').split('\n').slice(-BASH_MAX_LINES).join('\n')
    return { content, ...(this.path === undefined ? {} : { fullOutputPath: this.path }) }
  }
}
