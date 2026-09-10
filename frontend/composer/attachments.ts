/**
 * Images attached to a message.
 *
 * A screenshot is the fast way to say something that would take a paragraph,
 * and until now there was nowhere to put one.
 *
 * Two formats are accepted: the ones a provider takes inline, and the ones the
 * browser can decode so they can be converted. Anything else is refused at the
 * door with a reason, which is better than attaching it and failing the send.
 *
 * Decoding is checked here rather than left to the server. An attachment that
 * looks fine in the composer and cannot actually be read would drop out of the
 * request silently, and the reader would be left wondering why the model
 * answered about a picture it never saw.
 */

/** The ceiling a provider enforces on the base64 payload, with headroom. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024

/** A pasted screenshot is a few hundred kilobytes. This is the absurdity limit. */
export const MAX_SOURCE_BYTES = 32 * 1024 * 1024

export interface Attachment {
  id: string
  /** Base64, without a data url prefix. */
  data: string
  mimeType: string
  name: string
  /** Decoded size, for the size shown on the chip. */
  size: number
}

/** Formats a provider takes as they are. */
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

/** Formats the browser decodes and the server can convert. */
const CONVERTIBLE_TYPES = new Set(['image/bmp', 'image/avif', 'image/tiff'])

let counter = 0

function nextId(): string {
  counter += 1
  return 'att-' + Date.now().toString(36) + '-' + String(counter)
}

export function attachmentDataUrl(attachment: Attachment): string {
  return 'data:' + attachment.mimeType + ';base64,' + attachment.data
}

/**
 * Base64 without blowing the stack.
 *
 * Spreading a large byte array into String.fromCharCode passes every byte as an
 * argument, and a multi-megabyte image has more of those than the call stack
 * holds.
 */
export function toBase64(bytes: Uint8Array): string {
  const chunk = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export type AttachmentResult =
  | { ok: true; attachment: Attachment }
  | { ok: false; reason: string }

/**
 * A name for the chip, inventing one when the file arrived without any.
 *
 * A clipboard image has no filename, and what "no filename" looks like depends
 * on the runtime: an empty string in one, undefined in another. Checking for
 * both is the difference between a chip labelled with the image and one
 * labelled "undefined".
 */
function nameFor(file: File, index: number): string {
  const given: unknown = file.name
  if (typeof given === 'string' && given !== '') {
    return given
  }
  const extension = file.type.split('/')[1] ?? 'png'
  return 'pasted image' + (index === 0 ? '' : ' ' + String(index + 1)) + '.' + extension
}

/**
 * Whether these bytes decode as an image.
 *
 * A browser capability rather than a pure function, so it is a parameter with a
 * default. Everything built on top of it is then testable without a document,
 * which is the difference between the naming and rejection rules being covered
 * and being taken on trust.
 */
export type ImageDecoder = (bytes: Uint8Array, mimeType: string) => Promise<boolean>

const decodeWithBitmap: ImageDecoder = async (bytes, mimeType) => {
  try {
    const blob = new Blob([bytes as BlobPart], { type: mimeType })
    const bitmap = await createImageBitmap(blob)
    // Freed immediately. This is a yes or no question, not a resize.
    bitmap.close()
    return true
  } catch {
    return false
  }
}

/**
 * Turn one file into an attachment, or say why it cannot be one.
 *
 * Nothing is resized here. The server runs every attachment through the same
 * ladder it uses for an image read, so there is one resize and it is the tested
 * one. What happens here is the check that it is an image at all, which is the
 * failure that would otherwise be invisible: the attachment would sit in the
 * composer looking correct and quietly not be sent.
 */
export async function attachmentFromFile(
  file: File,
  index = 0,
  decode: ImageDecoder = decodeWithBitmap
): Promise<AttachmentResult> {
  const type = file.type.toLowerCase()

  if (!INLINE_TYPES.has(type) && !CONVERTIBLE_TYPES.has(type)) {
    const label = type === '' ? 'that file' : type
    return { ok: false, reason: 'Cannot attach ' + label + '. Images only.' }
  }

  if (file.size > MAX_SOURCE_BYTES) {
    return { ok: false, reason: 'That image is too large to attach.' }
  }

  if (file.size === 0) {
    return { ok: false, reason: 'That file is empty.' }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  if (!(await decode(bytes, type))) {
    return { ok: false, reason: 'That file could not be read as an image.' }
  }

  return {
    ok: true,
    attachment: {
      id: nextId(),
      data: toBase64(bytes),
      mimeType: type,
      name: nameFor(file, index),
      size: bytes.length
    }
  }
}

export interface AttachmentBatch {
  attachments: Attachment[]
  /** One reason per file that was refused, in the order they arrived. */
  errors: string[]
}

export async function attachmentsFromFiles(
  files: Iterable<File>,
  decode: ImageDecoder = decodeWithBitmap
): Promise<AttachmentBatch> {
  const attachments: Attachment[] = []
  const errors: string[] = []

  let index = 0
  for (const file of files) {
    const result = await attachmentFromFile(file, index, decode)
    if (result.ok) {
      attachments.push(result.attachment)
    } else {
      errors.push(result.reason)
    }
    index += 1
  }

  return { attachments, errors }
}

/**
 * Whether a drag is carrying files at all.
 *
 * Only the type list is readable while a drag is still in the air. The file
 * entries themselves appear at the moment of the drop, so a highlight driven
 * off them would never light up.
 */
export function isFileDrag(data: DataTransfer | null): boolean {
  if (data === null) return false
  return Array.from(data.types).includes('Files')
}

/** Image files carried by a paste or a drop. */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (data === null) return []
  const files: File[] = []
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file !== null && file.type.startsWith('image/')) {
      files.push(file)
    }
  }
  return files
}

/** A human size for the chip, matching how the rest of the app writes one. */
export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return String(bytes) + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}
