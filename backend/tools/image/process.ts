import { convertImageBytesToPng } from './convert'
import { formatDimensionNote, resizeImage, type ImageResizeOptions } from './resize'

/**
 * Turning a file on disk into something a model can be shown.
 *
 * Three jobs in order: work out whether these bytes are an inline image at all,
 * convert them if they are a format that is not one, and shrink them until the
 * request will carry them.
 *
 * Every failure returns a sentence rather than throwing. A file that cannot be
 * decoded is still worth telling the model about, because "this is a BMP I could
 * not read" is a better answer than a failed tool call with no explanation.
 */

export interface ProcessImageOptions {
  autoResizeImages?: boolean
  resizeOptions?: ImageResizeOptions
}

export type ProcessImageResult =
  | { ok: true; data: string; mimeType: string; hints: string[] }
  | { ok: false; message: string }

interface NormalizedImage {
  bytes: Uint8Array
  mimeType: string
  convertedFrom?: string
}

function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? mimeType.toLowerCase()
}

/** The formats a provider will take inline. Anything else has to be converted. */
function inlineableMimeType(mimeType: string): string | null {
  switch (baseMimeType(mimeType)) {
    case 'image/png':
      return 'image/png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'image/jpeg'
    case 'image/gif':
      return 'image/gif'
    case 'image/webp':
      return 'image/webp'
    default:
      return null
  }
}

async function normalizeImage(bytes: Uint8Array, mimeType: string): Promise<NormalizedImage | null> {
  const normalized = inlineableMimeType(mimeType)
  if (normalized !== null) {
    return { bytes, mimeType: normalized }
  }

  const pngBytes = await convertImageBytesToPng(bytes)
  if (pngBytes === null) {
    return null
  }

  return { bytes: pngBytes, mimeType: 'image/png', convertedFrom: baseMimeType(mimeType) }
}

function conversionHint(from: string | undefined, to: string): string | undefined {
  if (from === undefined || from === to) {
    return undefined
  }
  return '[Image converted from ' + from + ' to ' + to + '.]'
}

export async function processImage(
  bytes: Uint8Array,
  mimeType: string,
  options?: ProcessImageOptions
): Promise<ProcessImageResult> {
  const autoResize = options?.autoResizeImages ?? true
  const normalized = await normalizeImage(bytes, mimeType)
  if (normalized === null) {
    return { ok: false, message: '[Image omitted: could not be decoded as an image.]' }
  }

  if (!autoResize) {
    const hints: string[] = []
    const hint = conversionHint(normalized.convertedFrom, normalized.mimeType)
    if (hint !== undefined) hints.push(hint)
    return {
      ok: true,
      data: Buffer.from(normalized.bytes).toString('base64'),
      mimeType: normalized.mimeType,
      hints
    }
  }

  const resized = await resizeImage(normalized.bytes, normalized.mimeType, options?.resizeOptions)
  if (resized === null) {
    return {
      ok: false,
      message: '[Image omitted: could not be resized below the inline size limit.]'
    }
  }

  const hints: string[] = []
  const hint = conversionHint(normalized.convertedFrom, resized.mimeType)
  if (hint !== undefined) hints.push(hint)
  const note = formatDimensionNote(resized)
  if (note !== undefined) hints.push(note)

  return { ok: true, data: resized.data, mimeType: resized.mimeType, hints }
}
