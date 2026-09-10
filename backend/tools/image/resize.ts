import { applyExifOrientation } from './exif'
import { loadPhoton } from './photon'

/**
 * Shrinking an image until a model will accept it.
 *
 * Two limits, and the size one is the awkward half. A request carries the image
 * as base64, which is a third larger than the file, and the provider's ceiling
 * is on the encoded payload rather than on pixels. A small file can still be
 * too large to send.
 *
 * So the ladder: fit the dimensions first, then try PNG against JPEG, then walk
 * JPEG quality down, then shrink the dimensions and start again. PNG wins on
 * screenshots and JPEG wins on photographs, and which one a given image is
 * cannot be known without measuring both.
 *
 * Resizing runs here rather than in a worker. It is synchronous CPU work inside
 * the wasm module, and in an Electron app the interface is a separate process,
 * so a slow resize delays the server and not the window.
 */

export interface ImageResizeOptions {
  maxWidth?: number
  maxHeight?: number
  /** Ceiling on the base64 payload, which is what a provider actually limits. */
  maxBytes?: number
  jpegQuality?: number
}

export interface ResizedImage {
  /** Base64, without a data url prefix. */
  data: string
  mimeType: string
  originalWidth: number
  originalHeight: number
  width: number
  height: number
  wasResized: boolean
}

// Below the five megabyte limit providers tend to enforce, with room for the
// rest of the request.
const DEFAULT_MAX_BYTES = 4.5 * 1024 * 1024

const DEFAULT_OPTIONS: Required<ImageResizeOptions> = {
  maxWidth: 2000,
  maxHeight: 2000,
  maxBytes: DEFAULT_MAX_BYTES,
  jpegQuality: 80
}

interface EncodedCandidate {
  data: string
  encodedSize: number
  mimeType: string
}

function encodeCandidate(buffer: Uint8Array, mimeType: string): EncodedCandidate {
  const data = Buffer.from(buffer).toString('base64')
  return { data, encodedSize: Buffer.byteLength(data, 'utf-8'), mimeType }
}

/** Base64 length without building the string, for the early already-fits check. */
function base64Size(bytes: number): number {
  return Math.ceil(bytes / 3) * 4
}

export async function resizeImage(
  inputBytes: Uint8Array,
  mimeType: string,
  options?: ImageResizeOptions
): Promise<ResizedImage | null> {
  const settings = { ...DEFAULT_OPTIONS, ...options }
  const photon = await loadPhoton()
  if (photon === null) {
    return null
  }

  let image: ReturnType<typeof photon.PhotonImage.new_from_byteslice> | undefined
  try {
    const rawImage = photon.PhotonImage.new_from_byteslice(inputBytes)
    image = applyExifOrientation(photon, rawImage, inputBytes)
    if (image !== rawImage) {
      rawImage.free()
    }

    const originalWidth = image.get_width()
    const originalHeight = image.get_height()

    // Already inside every limit, so the original bytes are sent untouched
    // rather than re-encoded into something that was never the problem.
    if (
      originalWidth <= settings.maxWidth &&
      originalHeight <= settings.maxHeight &&
      base64Size(inputBytes.byteLength) < settings.maxBytes
    ) {
      return {
        data: Buffer.from(inputBytes).toString('base64'),
        mimeType,
        originalWidth,
        originalHeight,
        width: originalWidth,
        height: originalHeight,
        wasResized: false
      }
    }

    let targetWidth = originalWidth
    let targetHeight = originalHeight
    if (targetWidth > settings.maxWidth) {
      targetHeight = Math.round((targetHeight * settings.maxWidth) / targetWidth)
      targetWidth = settings.maxWidth
    }
    if (targetHeight > settings.maxHeight) {
      targetWidth = Math.round((targetWidth * settings.maxHeight) / targetHeight)
      targetHeight = settings.maxHeight
    }

    const encodeAt = (width: number, height: number, qualities: number[]): EncodedCandidate[] => {
      const resized = photon.resize(image as NonNullable<typeof image>, width, height, photon.SamplingFilter.Lanczos3)
      try {
        const candidates = [encodeCandidate(resized.get_bytes(), 'image/png')]
        for (const quality of qualities) {
          candidates.push(encodeCandidate(resized.get_bytes_jpeg(quality), 'image/jpeg'))
        }
        return candidates
      } finally {
        resized.free()
      }
    }

    const qualities = [...new Set([settings.jpegQuality, 85, 70, 55, 40])]
    let currentWidth = targetWidth
    let currentHeight = targetHeight

    for (;;) {
      for (const candidate of encodeAt(currentWidth, currentHeight, qualities)) {
        if (candidate.encodedSize < settings.maxBytes) {
          return {
            data: candidate.data,
            mimeType: candidate.mimeType,
            originalWidth,
            originalHeight,
            width: currentWidth,
            height: currentHeight,
            wasResized: true
          }
        }
      }

      if (currentWidth === 1 && currentHeight === 1) {
        break
      }

      const nextWidth = currentWidth === 1 ? 1 : Math.max(1, Math.floor(currentWidth * 0.75))
      const nextHeight = currentHeight === 1 ? 1 : Math.max(1, Math.floor(currentHeight * 0.75))
      if (nextWidth === currentWidth && nextHeight === currentHeight) {
        break
      }

      currentWidth = nextWidth
      currentHeight = nextHeight
    }

    return null
  } catch {
    return null
  } finally {
    if (image !== undefined) {
      image.free()
    }
  }
}

/**
 * Tell the model the coordinates it is looking at are not the original.
 *
 * A model that sees a shrunken image and is asked to point at something in it
 * will answer in the coordinates it was given. Without this it never knows they
 * need mapping back, and every answer is off by the resize factor.
 */
export function formatDimensionNote(result: ResizedImage): string | undefined {
  if (!result.wasResized) {
    return undefined
  }
  const scale = result.originalWidth / result.width
  return (
    '[Image: original ' +
    String(result.originalWidth) +
    'x' +
    String(result.originalHeight) +
    ', displayed at ' +
    String(result.width) +
    'x' +
    String(result.height) +
    '. Multiply coordinates by ' +
    scale.toFixed(2) +
    ' to map to original image.]'
  )
}
