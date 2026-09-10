import { describe, expect, it } from 'bun:test'

import {
  attachmentDataUrl,
  attachmentFromFile,
  attachmentsFromFiles,
  formatAttachmentSize,
  imageFilesFrom,
  isFileDrag,
  toBase64,
  MAX_SOURCE_BYTES,
} from '../frontend/composer/attachments'

/** Always says yes, so the rules around decoding can be tested on their own. */
const decodes = async (): Promise<boolean> => true
const neverDecodes = async (): Promise<boolean> => false

function imageFile(bytes: Uint8Array, name = 'shot.png', type = 'image/png'): File {
  return new File([bytes as BlobPart], name, { type })
}

/** The shape imageFilesFrom reads, without needing a real DataTransfer. */
function transfer(items: Array<{ kind: string; file: File | null }>): DataTransfer {
  return {
    items: items.map((item) => ({ kind: item.kind, getAsFile: () => item.file })),
  } as unknown as DataTransfer
}

describe('toBase64', () => {
  it('encodes bytes the way atob reads them back', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255])
    expect(atob(toBase64(bytes))).toBe(String.fromCharCode(...bytes))
  })

  it('handles an empty input', () => {
    expect(toBase64(new Uint8Array(0))).toBe('')
  })

  it('survives an image far larger than the call stack', () => {
    // Spreading the bytes into fromCharCode passes one argument per byte, and a
    // real screenshot has more of those than the stack holds. This is the size
    // that would throw.
    const bytes = new Uint8Array(512 * 1024)
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = index % 251
    }
    const encoded = toBase64(bytes)
    expect(encoded.length).toBe(Math.ceil(bytes.length / 3) * 4)
    expect(atob(encoded).length).toBe(bytes.length)
  })

  it('round trips every byte value', () => {
    const bytes = new Uint8Array(256)
    for (let index = 0; index < 256; index++) {
      bytes[index] = index
    }
    const decoded = atob(toBase64(bytes))
    for (let index = 0; index < 256; index++) {
      expect(decoded.charCodeAt(index)).toBe(index)
    }
  })
})

describe('formatAttachmentSize', () => {
  it('writes a size the way the rest of the app does', () => {
    expect(formatAttachmentSize(512)).toBe('512B')
    expect(formatAttachmentSize(2048)).toBe('2KB')
    expect(formatAttachmentSize(3 * 1024 * 1024)).toBe('3.0MB')
  })
})

describe('imageFilesFrom', () => {
  it('takes image files and leaves the rest', () => {
    const png = imageFile(new Uint8Array([1]))
    const text = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    const files = imageFilesFrom(
      transfer([
        { kind: 'file', file: png },
        { kind: 'file', file: text },
        { kind: 'string', file: null },
      ])
    )
    expect(files.map((file) => file.name)).toEqual(['shot.png'])
  })

  it('returns nothing for no transfer', () => {
    expect(imageFilesFrom(null)).toEqual([])
  })

  it('recognises a drag carrying files from the type list alone', () => {
    // The file entries are not readable until the drop, so the highlight has to
    // come from the types or it never lights up.
    expect(isFileDrag({ types: ['Files'] } as unknown as DataTransfer)).toBe(true)
    expect(isFileDrag({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false)
    expect(isFileDrag(null)).toBe(false)
  })

  it('does not call a drag with no types a file drag', () => {
    expect(isFileDrag({ types: [] } as unknown as DataTransfer)).toBe(false)
  })

  it('ignores a file entry that carries no file', () => {
    expect(imageFilesFrom(transfer([{ kind: 'file', file: null }]))).toEqual([])
  })
})

describe('attachmentFromFile', () => {
  it('accepts an image and encodes it', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const result = await attachmentFromFile(imageFile(bytes), 0, decodes)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.attachment.mimeType).toBe('image/png')
      expect(result.attachment.name).toBe('shot.png')
      expect(result.attachment.size).toBe(4)
      expect(atob(result.attachment.data).length).toBe(4)
      expect(result.attachment.id).not.toBe('')
    }
  })

  it('refuses a file that is not an image, and says what it was', async () => {
    const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
    const result = await attachmentFromFile(pdf, 0, decodes)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('application/pdf')
  })

  it('refuses a file with no type at all', async () => {
    const unknown = new File(['x'], 'thing', { type: '' })
    const result = await attachmentFromFile(unknown, 0, decodes)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('Images only')
  })

  it('accepts a format that has to be converted rather than sent as it is', async () => {
    // A bitmap is not inlineable, but it is decodable, and the server converts
    // it. Refusing it here would be refusing something that would have worked.
    const bmp = new File([new Uint8Array([1, 2])], 'shot.bmp', { type: 'image/bmp' })
    expect((await attachmentFromFile(bmp, 0, decodes)).ok).toBe(true)
  })

  it('refuses an empty file', async () => {
    const empty = new File([], 'empty.png', { type: 'image/png' })
    const result = await attachmentFromFile(empty, 0, decodes)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('empty')
  })

  it('refuses an image too large to attach', async () => {
    const huge = imageFile(new Uint8Array(MAX_SOURCE_BYTES + 1))
    const result = await attachmentFromFile(huge, 0, decodes)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('too large')
  })

  it('refuses something that claims to be an image and does not decode', async () => {
    // The check that matters. Without it the attachment sits in the composer
    // looking correct and quietly fails to be sent.
    const result = await attachmentFromFile(imageFile(new Uint8Array([1, 2])), 0, neverDecodes)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('could not be read')
  })

  it('names something pasted rather than chosen', async () => {
    // A clipboard image has no filename.
    const pasted = new File([new Uint8Array([1])], '', { type: 'image/png' })
    const result = await attachmentFromFile(pasted, 0, decodes)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.attachment.name).toBe('pasted image.png')
  })

  it('numbers a second pasted image so the names differ', async () => {
    // The extension comes from the type, so two pasted images cannot collide on
    // a name in a way that makes one indistinguishable from the other.
    const pasted = new File([new Uint8Array([1])], '', { type: 'image/jpeg' })
    const result = await attachmentFromFile(pasted, 1, decodes)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.attachment.name).toBe('pasted image 2.jpeg')
  })

  it('invents a name when the runtime reports none at all', async () => {
    // A clipboard image can arrive with the name missing rather than empty.
    const nameless = { name: undefined, type: 'image/png', size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer }
    const result = await attachmentFromFile(nameless as unknown as File, 0, decodes)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.attachment.name).toBe('pasted image.png')
  })
})

describe('attachmentsFromFiles', () => {
  it('keeps what it can and reports what it cannot', async () => {
    const batch = await attachmentsFromFiles(
      [
        imageFile(new Uint8Array([1]), 'good.png'),
        new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' }),
        imageFile(new Uint8Array([2]), 'also.png'),
      ],
      decodes
    )
    expect(batch.attachments.map((item) => item.name)).toEqual(['good.png', 'also.png'])
    expect(batch.errors.length).toBe(1)
    expect(batch.errors[0]).toContain('application/pdf')
  })

  it('reports nothing when everything was fine', async () => {
    const batch = await attachmentsFromFiles([imageFile(new Uint8Array([1]))], decodes)
    expect(batch.errors).toEqual([])
    expect(batch.attachments.length).toBe(1)
  })

  it('handles an empty selection', async () => {
    const batch = await attachmentsFromFiles([], decodes)
    expect(batch.attachments).toEqual([])
    expect(batch.errors).toEqual([])
  })
})

describe('attachmentDataUrl', () => {
  it('builds a url an img tag can display', () => {
    expect(attachmentDataUrl({ id: 'a', mimeType: 'image/png', data: 'AAAA', name: 'x', size: 3 })).toBe(
      'data:image/png;base64,AAAA'
    )
  })
})
