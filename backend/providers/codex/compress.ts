import type * as NodeZlib from 'node:zlib'

type ProcessWithBuiltin = typeof process & {
  getBuiltinModule?: (id: 'node:zlib') => typeof NodeZlib
}

const ZSTD_LEVEL = 3

export function compressRequestBodyZstd(bodyJson: string): Uint8Array | null {
  if (typeof process === 'undefined' || !(process.versions.node || process.versions.bun)) {
    return null
  }
  const zlib = (process as ProcessWithBuiltin).getBuiltinModule?.('node:zlib')
  if (zlib === undefined || typeof zlib.zstdCompressSync !== 'function') return null
  try {
    const compressed = zlib.zstdCompressSync(bodyJson, {
      params: { [zlib.constants.ZSTD_c_compressionLevel]: ZSTD_LEVEL },
    })
    return new Uint8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength)
  } catch {
    return null
  }
}
