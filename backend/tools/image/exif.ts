import type { Photon } from './photon'
import type { PhotonImage as PhotonImageType } from '@silvia-odwyer/photon-node'

/**
 * The rotation a camera recorded but did not apply.
 *
 * A phone stores a portrait photo as landscape pixels plus one number saying
 * which way up it is. Every viewer applies it; raw bytes do not. Send the bytes
 * as they are and the model is looking at a sideways picture while reasoning
 * about coordinates that are wrong in both axes.
 *
 * The number lives in a TIFF header, reachable through a JPEG APP1 segment or a
 * WebP EXIF chunk. Both are parsed here, because both turn up in practice.
 */

function readOrientationFromTiff(bytes: Uint8Array, tiffStart: number): number {
  if (tiffStart + 8 > bytes.length) return 1

  const byteOrder = ((bytes[tiffStart] ?? 0) << 8) | (bytes[tiffStart + 1] ?? 0)
  const littleEndian = byteOrder === 0x4949

  const read16 = (position: number): number => {
    if (littleEndian) {
      return (bytes[position] ?? 0) | ((bytes[position + 1] ?? 0) << 8)
    }
    return ((bytes[position] ?? 0) << 8) | (bytes[position + 1] ?? 0)
  }

  const read32 = (position: number): number => {
    if (littleEndian) {
      return (
        (bytes[position] ?? 0) |
        ((bytes[position + 1] ?? 0) << 8) |
        ((bytes[position + 2] ?? 0) << 16) |
        ((bytes[position + 3] ?? 0) << 24)
      )
    }
    return (
      (((bytes[position] ?? 0) << 24) |
        ((bytes[position + 1] ?? 0) << 16) |
        ((bytes[position + 2] ?? 0) << 8) |
        (bytes[position + 3] ?? 0)) >>>
      0
    )
  }

  const ifdOffset = read32(tiffStart + 4)
  const ifdStart = tiffStart + ifdOffset
  if (ifdStart + 2 > bytes.length) return 1

  const entryCount = read16(ifdStart)
  for (let index = 0; index < entryCount; index++) {
    const entryPosition = ifdStart + 2 + index * 12
    if (entryPosition + 12 > bytes.length) return 1

    // 0x0112 is the orientation tag.
    if (read16(entryPosition) === 0x0112) {
      const value = read16(entryPosition + 8)
      return value >= 1 && value <= 8 ? value : 1
    }
  }

  return 1
}

function hasExifHeader(bytes: Uint8Array, offset: number): boolean {
  return (
    bytes[offset] === 0x45 &&
    bytes[offset + 1] === 0x78 &&
    bytes[offset + 2] === 0x69 &&
    bytes[offset + 3] === 0x66 &&
    bytes[offset + 4] === 0x00 &&
    bytes[offset + 5] === 0x00
  )
}

/** Walk the JPEG segment chain looking for the APP1 that holds Exif. */
function findJpegTiffOffset(bytes: Uint8Array): number {
  let offset = 2
  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) return -1
    const marker = bytes[offset + 1]
    // A run of 0xff bytes is padding before the real marker.
    if (marker === 0xff) {
      offset++
      continue
    }

    if (marker === 0xe1) {
      if (offset + 4 >= bytes.length) return -1
      const segmentStart = offset + 4
      if (segmentStart + 6 > bytes.length) return -1
      if (hasExifHeader(bytes, segmentStart)) return segmentStart + 6
    }

    if (offset + 4 > bytes.length) return -1
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)
    offset += 2 + length
  }
  return -1
}

function findWebpTiffOffset(bytes: Uint8Array): number {
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(
      bytes[offset] ?? 0,
      bytes[offset + 1] ?? 0,
      bytes[offset + 2] ?? 0,
      bytes[offset + 3] ?? 0
    )
    const chunkSize =
      (bytes[offset + 4] ?? 0) |
      ((bytes[offset + 5] ?? 0) << 8) |
      ((bytes[offset + 6] ?? 0) << 16) |
      ((bytes[offset + 7] ?? 0) << 24)
    const dataStart = offset + 8

    if (chunkId === 'EXIF') {
      if (dataStart + chunkSize > bytes.length) return -1
      // Some writers prefix the TIFF header with an "Exif\0\0" marker and some
      // do not, so both are checked rather than assuming one.
      const tiffStart = chunkSize >= 6 && hasExifHeader(bytes, dataStart) ? dataStart + 6 : dataStart
      return tiffStart
    }

    // RIFF chunks are padded to an even size.
    offset = dataStart + chunkSize + (chunkSize % 2)
  }
  return -1
}

export function readExifOrientation(bytes: Uint8Array): number {
  const isJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8
  const isWebp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50

  let tiffOffset = -1
  if (isJpeg) {
    tiffOffset = findJpegTiffOffset(bytes)
  } else if (isWebp) {
    tiffOffset = findWebpTiffOffset(bytes)
  }

  if (tiffOffset === -1) return 1
  return readOrientationFromTiff(bytes, tiffOffset)
}

type DestinationIndex = (x: number, y: number, width: number, height: number) => number

function rotate90(photon: Photon, image: PhotonImageType, destinationIndex: DestinationIndex): PhotonImageType {
  const width = image.get_width()
  const height = image.get_height()
  const source = image.get_raw_pixels()
  const destination = new Uint8Array(source.length)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceIndex = (y * width + x) * 4
      const targetIndex = destinationIndex(x, y, width, height) * 4
      destination[targetIndex] = source[sourceIndex] ?? 0
      destination[targetIndex + 1] = source[sourceIndex + 1] ?? 0
      destination[targetIndex + 2] = source[sourceIndex + 2] ?? 0
      destination[targetIndex + 3] = source[sourceIndex + 3] ?? 0
    }
  }

  // The dimensions swap, which is the whole point of a quarter turn.
  return new photon.PhotonImage(destination, height, width)
}

/**
 * Apply the recorded orientation.
 *
 * Flips mutate in place and return the same image. Rotations build a new one,
 * and the caller frees the old, which is why the result is returned rather than
 * assumed to be the argument.
 */
export function applyExifOrientation(
  photon: Photon,
  image: PhotonImageType,
  originalBytes: Uint8Array
): PhotonImageType {
  const orientation = readExifOrientation(originalBytes)
  if (orientation === 1) return image

  switch (orientation) {
    case 2:
      photon.fliph(image)
      return image
    case 3:
      photon.fliph(image)
      photon.flipv(image)
      return image
    case 4:
      photon.flipv(image)
      return image
    case 5: {
      const rotated = rotate90(photon, image, (x, y, _width, height) => x * height + (height - 1 - y))
      photon.fliph(rotated)
      return rotated
    }
    case 6:
      return rotate90(photon, image, (x, y, _width, height) => x * height + (height - 1 - y))
    case 7: {
      const rotated = rotate90(photon, image, (x, y, width, height) => (width - 1 - x) * height + y)
      photon.fliph(rotated)
      return rotated
    }
    case 8:
      return rotate90(photon, image, (x, y, width, height) => (width - 1 - x) * height + y)
    default:
      return image
  }
}
