import { applyExifOrientation } from './exif'
import { loadPhoton } from './photon'

/**
 * Decode whatever this is and hand back PNG bytes.
 *
 * Needed for the formats a model can be shown but an inline request will not
 * take, and for anything whose type could not be read but which turns out to be
 * a decodable image anyway.
 *
 * Returns null rather than throwing when the bytes are not an image, because
 * the caller's next move is the same either way: report the file instead of
 * sending it.
 */
export async function convertImageBytesToPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  const photon = await loadPhoton()
  if (photon === null) {
    return null
  }

  try {
    const rawImage = photon.PhotonImage.new_from_byteslice(bytes)
    const image = applyExifOrientation(photon, rawImage, bytes)
    if (image !== rawImage) {
      rawImage.free()
    }
    try {
      return new Uint8Array(image.get_bytes())
    } finally {
      image.free()
    }
  } catch {
    return null
  }
}
