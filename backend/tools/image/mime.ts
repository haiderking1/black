import { open } from 'node:fs/promises'

/**
 * What a file actually is, read from its first bytes.
 *
 * The extension is a claim, not a fact. Screenshots get renamed, a .png can
 * hold a JPEG, and a file with no extension at all is a normal thing to find in
 * a project. A model asked about an image it cannot decode wastes a turn, so
 * the type is decided by content and the answer is "not an image" when the
 * bytes do not say otherwise.
 *
 * Two formats are deliberately rejected even though they are images: a
 * progressive JPEG, because the inline formats do not take one, and an animated
 * PNG, because only the first frame would ever be seen and the model would
 * reason about a still from a moving picture.
 */

const SNIFF_BYTES = 4100
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function detectImageMimeType(buffer: Uint8Array): string | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    // 0xf7 marks a progressive JPEG, which cannot be sent inline.
    return buffer[3] === 0xf7 ? null : 'image/jpeg'
  }
  if (startsWith(buffer, PNG_SIGNATURE)) {
    return isPng(buffer) && !isAnimatedPng(buffer) ? 'image/png' : null
  }
  if (startsWithAscii(buffer, 0, 'GIF')) {
    return 'image/gif'
  }
  if (startsWithAscii(buffer, 0, 'RIFF') && startsWithAscii(buffer, 8, 'WEBP')) {
    return 'image/webp'
  }
  if (startsWithAscii(buffer, 0, 'BM') && isBmp(buffer)) {
    return 'image/bmp'
  }
  return null
}

/** Read only the head of a file, since the type lives in the first few bytes. */
export async function detectImageMimeTypeFromFile(filePath: string): Promise<string | null> {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0)
    return detectImageMimeType(buffer.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

/** A PNG without a leading IHDR of the expected length is not a PNG. */
function isPng(buffer: Uint8Array): boolean {
  return (
    buffer.length >= 16 && readUint32BE(buffer, PNG_SIGNATURE.length) === 13 && startsWithAscii(buffer, 12, 'IHDR')
  )
}

/** An acTL chunk before the first IDAT means more than one frame. */
function isAnimatedPng(buffer: Uint8Array): boolean {
  let offset = PNG_SIGNATURE.length
  while (offset + 8 <= buffer.length) {
    const chunkLength = readUint32BE(buffer, offset)
    const chunkTypeOffset = offset + 4
    if (startsWithAscii(buffer, chunkTypeOffset, 'acTL')) {
      return true
    }
    if (startsWithAscii(buffer, chunkTypeOffset, 'IDAT')) {
      return false
    }
    const nextOffset = offset + 8 + chunkLength + 4
    // A length that goes backwards or past the end means the header cannot be
    // trusted, and an unreadable header is not a reason to call it animated.
    if (nextOffset <= offset || nextOffset > buffer.length) {
      return false
    }
    offset = nextOffset
  }
  return false
}

/** Validate the BMP header rather than trusting the two magic bytes alone. */
function isBmp(buffer: Uint8Array): boolean {
  if (buffer.length < 26) {
    return false
  }

  const declaredFileSize = readUint32LE(buffer, 2)
  const pixelDataOffset = readUint32LE(buffer, 10)
  const dibHeaderSize = readUint32LE(buffer, 14)

  if (declaredFileSize !== 0 && declaredFileSize < 26) return false
  if (pixelDataOffset < 14 + dibHeaderSize) return false
  if (declaredFileSize !== 0 && pixelDataOffset >= declaredFileSize) return false

  let colorPlanes: number
  let bitsPerPixel: number
  if (dibHeaderSize === 12) {
    colorPlanes = readUint16LE(buffer, 22)
    bitsPerPixel = readUint16LE(buffer, 24)
  } else if (dibHeaderSize >= 40 && dibHeaderSize <= 124) {
    if (buffer.length < 30) {
      return false
    }
    colorPlanes = readUint16LE(buffer, 26)
    bitsPerPixel = readUint16LE(buffer, 28)
  } else {
    return false
  }

  return colorPlanes === 1 && [1, 4, 8, 16, 24, 32].includes(bitsPerPixel)
}

function readUint16LE(buffer: Uint8Array, offset: number): number {
  return (buffer[offset] ?? 0) + ((buffer[offset + 1] ?? 0) << 8)
}

function readUint32BE(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset] ?? 0) * 0x1000000 +
    ((buffer[offset + 1] ?? 0) << 16) +
    ((buffer[offset + 2] ?? 0) << 8) +
    (buffer[offset + 3] ?? 0)
  )
}

function readUint32LE(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset] ?? 0) +
    ((buffer[offset + 1] ?? 0) << 8) +
    ((buffer[offset + 2] ?? 0) << 16) +
    (buffer[offset + 3] ?? 0) * 0x1000000
  )
}

function startsWith(buffer: Uint8Array, bytes: number[]): boolean {
  if (buffer.length < bytes.length) {
    return false
  }
  return bytes.every((byte, index) => buffer[index] === byte)
}

function startsWithAscii(buffer: Uint8Array, offset: number, text: string): boolean {
  if (buffer.length < offset + text.length) {
    return false
  }
  for (let index = 0; index < text.length; index++) {
    if (buffer[offset + index] !== text.charCodeAt(index)) {
      return false
    }
  }
  return true
}
