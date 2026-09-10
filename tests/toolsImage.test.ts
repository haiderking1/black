import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readExifOrientation } from '../backend/tools/image/exif'
import { detectImageMimeType, detectImageMimeTypeFromFile } from '../backend/tools/image/mime'
import { processImage } from '../backend/tools/image/process'
import { resizeImage } from '../backend/tools/image/resize'

/** Build a buffer from a byte pattern written the way a hex dump reads. */
function bytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, '')
  const out = new Uint8Array(clean.length / 2)
  for (let index = 0; index < out.length; index++) {
    out[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
  }
  return out
}

const PNG_SIGNATURE = '89504e470d0a1a0a'

/**
 * One PNG chunk: length, type, data, crc.
 *
 * The crc is a placeholder. The scanner never validates it, because the
 * question being answered is whether a frame count chunk appears before the
 * image data, and that is a question about ordering.
 */
function pngChunk(type: string, body = ''): string {
  const length = (body.length / 2).toString(16).padStart(8, '0')
  return length + type + body + '00000000'
}

/** A PNG from its signature plus the given chunks, in order. */
function png(...chunks: string[]): Uint8Array {
  return bytes(PNG_SIGNATURE + chunks.join(''))
}

/** The smallest thing that passes as a PNG: a signature and a real IHDR. */
function simplePng(): Uint8Array {
  return png(pngChunk('49484452', '00'.repeat(13)))
}

/**
 * A JPEG holding one APP1 Exif segment with the given orientation.
 *
 * Built here rather than checked in as a fixture so the byte layout is visible:
 * SOI, APP1 with its length, the Exif header, a TIFF header, one IFD entry
 * holding the orientation tag, and end of image.
 */
function jpegWithOrientation(orientation: number, littleEndian = true): Uint8Array {
  const tiff = new Uint8Array(26)
  const view = new DataView(tiff.buffer)
  if (littleEndian) {
    tiff[0] = 0x49
    tiff[1] = 0x49
    view.setUint16(2, 42, true)
    view.setUint32(4, 8, true)
    view.setUint16(8, 1, true) // one entry
    view.setUint16(10, 0x0112, true) // orientation tag
    view.setUint16(12, 3, true) // SHORT
    view.setUint32(14, 1, true) // count
    view.setUint16(18, orientation, true) // value
    view.setUint32(22, 0, true) // no next ifd
  } else {
    tiff[0] = 0x4d
    tiff[1] = 0x4d
    view.setUint16(2, 42, false)
    view.setUint32(4, 8, false)
    view.setUint16(8, 1, false)
    view.setUint16(10, 0x0112, false)
    view.setUint16(12, 3, false)
    view.setUint32(14, 1, false)
    view.setUint16(18, orientation, false)
    view.setUint32(22, 0, false)
  }

  const exifHeader = bytes('457869660000') // "Exif\0\0"
  const payloadLength = exifHeader.length + tiff.length
  const out = new Uint8Array(2 + 2 + 2 + payloadLength + 2)
  const outView = new DataView(out.buffer)
  let offset = 0
  outView.setUint16(offset, 0xffd8, false) // SOI
  offset += 2
  outView.setUint16(offset, 0xffe1, false) // APP1
  offset += 2
  outView.setUint16(offset, payloadLength + 2, false) // segment length includes itself
  offset += 2
  out.set(exifHeader, offset)
  offset += exifHeader.length
  out.set(tiff, offset)
  offset += tiff.length
  outView.setUint16(offset, 0xffd9, false) // EOI
  return out
}

describe('image type detection', () => {
  it('recognises the formats it can send', () => {
    expect(detectImageMimeType(simplePng())).toBe('image/png')
    expect(detectImageMimeType(bytes('ffd8ffe0'))).toBe('image/jpeg')
    expect(detectImageMimeType(bytes('474946383961'))).toBe('image/gif')
    expect(detectImageMimeType(bytes('524946460000000057454250'))).toBe('image/webp')
  })

  it('rejects a progressive jpeg, which cannot be sent inline', () => {
    expect(detectImageMimeType(bytes('ffd8fff7'))).toBeNull()
  })

  it('rejects an animated png so a still is not mistaken for the whole picture', () => {
    // A frame count chunk before the image data means more than one frame, and
    // only the first would ever be seen.
    const animated = png(pngChunk('49484452', '00'.repeat(13)), pngChunk('6163544c', '0000000800000001'))
    expect(detectImageMimeType(animated)).toBeNull()
  })

  it('accepts a png whose frame count chunk comes after the image data', () => {
    // An acTL after IDAT is not a second frame, so the image is a still.
    const still = png(
      pngChunk('49484452', '00'.repeat(13)),
      pngChunk('49444154'),
      pngChunk('6163544c', '0000000800000001')
    )
    expect(detectImageMimeType(still)).toBe('image/png')
  })

  it('rejects a png whose header chunk is not the right shape', () => {
    // Signature right, IHDR length wrong.
    expect(detectImageMimeType(bytes(PNG_SIGNATURE + '0000000c49484452'))).toBeNull()
    // And a png whose first chunk is not IHDR at all.
    expect(detectImageMimeType(png(pngChunk('49444154')))).toBeNull()
  })

  it('rejects text, empty files and short buffers', () => {
    expect(detectImageMimeType(new Uint8Array(0))).toBeNull()
    expect(detectImageMimeType(bytes('68656c6c6f'))).toBeNull()
    expect(detectImageMimeType(bytes('ff'))).toBeNull()
    expect(detectImageMimeType(bytes('424d'))).toBeNull()
  })

  it('validates a bmp header instead of trusting the magic bytes', () => {
    // A full header: magic, size, reserved, pixel offset, dib size, width,
    // height, planes, bits per pixel.
    const header = (fileSize: string) =>
      bytes('424d' + fileSize + '00000000' + '36000000' + '28000000' + '01000000' + '01000000' + '0100' + '1800')

    // A file size of zero means "not recorded", which is valid and common.
    expect(detectImageMimeType(header('00000000'))).toBe('image/bmp')

    // A declared size smaller than the header itself is not a bmp.
    expect(detectImageMimeType(header('01000000'))).toBeNull()

    // One colour plane is required. Two is a malformed header, not an image.
    const twoPlanes = header('00000000')
    twoPlanes[26] = 2
    expect(detectImageMimeType(twoPlanes)).toBeNull()

    // And the bit depth has to be one the format defines.
    const oddDepth = header('00000000')
    oddDepth[28] = 7
    expect(detectImageMimeType(oddDepth)).toBeNull()
  })

  it('reads the type from a file without loading the whole thing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'black-mime-'))
    try {
      const file = join(dir, 'thing.bin')
      await writeFile(file, Buffer.from(simplePng()))
      expect(await detectImageMimeTypeFromFile(file)).toBe('image/png')

      const text = join(dir, 'notes.txt')
      await writeFile(text, 'hello', 'utf-8')
      expect(await detectImageMimeTypeFromFile(text)).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports a missing file rather than returning null for it', async () => {
    // "Not an image" and "not there" are different answers.
    await expect(detectImageMimeTypeFromFile('/nonexistent/nope.png')).rejects.toThrow()
  })
})

describe('exif orientation', () => {
  it('reads the orientation a camera recorded', () => {
    expect(readExifOrientation(jpegWithOrientation(6))).toBe(6)
    expect(readExifOrientation(jpegWithOrientation(8))).toBe(8)
    expect(readExifOrientation(jpegWithOrientation(1))).toBe(1)
  })

  it('reads a big endian tiff header too', () => {
    expect(readExifOrientation(jpegWithOrientation(6, false))).toBe(6)
  })

  it('returns upright for an image with no exif at all', () => {
    expect(readExifOrientation(bytes('ffd8ffe000104a46494600010100000100010000ffd9'))).toBe(1)
    expect(readExifOrientation(simplePng())).toBe(1)
    expect(readExifOrientation(new Uint8Array(0))).toBe(1)
  })

  it('rejects an orientation outside the defined range', () => {
    // Nine is not a rotation the spec defines, so the image is left alone
    // rather than rotated by a value that means nothing.
    expect(readExifOrientation(jpegWithOrientation(9))).toBe(1)
    expect(readExifOrientation(jpegWithOrientation(0))).toBe(1)
  })

  it('does not run off the end of a truncated image', () => {
    const full = jpegWithOrientation(6)
    for (const length of [2, 4, 6, 10, 14, 20]) {
      expect(() => readExifOrientation(full.subarray(0, length))).not.toThrow()
    }
  })
})

describe('image processing', () => {
  it('passes an image that already fits straight through', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'black-img-'))
    try {
      // Build a real png with the library, so the bytes are genuinely valid.
      const { loadPhoton } = await import('../backend/tools/image/photon')
      const photon = await loadPhoton()
      if (photon === null) return

      const pixels = new Uint8Array(8 * 8 * 4)
      for (let index = 0; index < pixels.length; index += 4) {
        pixels[index] = 180
        pixels[index + 3] = 255
      }
      const source = new photon.PhotonImage(pixels, 8, 8)
      const encoded = Buffer.from(source.get_bytes())
      source.free()

      const result = await resizeImage(new Uint8Array(encoded), 'image/png')
      expect(result?.wasResized).toBe(false)
      expect(result?.width).toBe(8)

      const processed = await processImage(new Uint8Array(encoded), 'image/png')
      expect(processed.ok).toBe(true)
      if (processed.ok) {
        expect(processed.mimeType).toBe('image/png')
        expect(processed.hints.length).toBe(0)
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports rather than throws when the bytes are not an image', async () => {
    // Some bytes decode and some panic the wasm module. Both have to come back
    // as a sentence, because a file that cannot be shown is still worth
    // reporting.
    for (const input of [new Uint8Array([1, 2, 3]), bytes('ffd8ffe000104a4649'), new Uint8Array(0)]) {
      const result = await processImage(input, 'image/bmp')
      expect(result.ok).toBe(false)
    }
  })
})
