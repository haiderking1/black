import { randomUUID } from 'node:crypto'

/**
 * Time-ordered UUIDv7 generator.
 *
 * Uses a monotonically advancing timestamp and an incrementing sequence
 * counter, so ids generated in the same millisecond still sort in creation
 * order. A supplied timestamp is preserved for follower ids instead of being
 * clamped.
 */
const MAX_UUID_V7_TIMESTAMP = 0xffffffffffff
const MAX_SEQUENCE = (1n << 41n) - 1n

let lastOrdinaryTimestamp = -1
let sequence: bigint | undefined

export function uuidv7(timestampMs?: number): string {
  const requestedTimestamp = timestampMs ?? Date.now()
  if (
    !Number.isInteger(requestedTimestamp) ||
    requestedTimestamp < 0 ||
    requestedTimestamp > MAX_UUID_V7_TIMESTAMP
  ) {
    throw new RangeError(
      'UUIDv7 timestamp must be an integer between 0 and ' + MAX_UUID_V7_TIMESTAMP,
    )
  }

  const effectiveTimestamp =
    timestampMs === undefined ? Math.max(requestedTimestamp, lastOrdinaryTimestamp) : requestedTimestamp
  if (timestampMs === undefined) lastOrdinaryTimestamp = effectiveTimestamp

  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  if (sequence === undefined) {
    sequence =
      (BigInt(bytes[1] ?? 0) << 32n) |
      (BigInt(bytes[2] ?? 0) << 24n) |
      (BigInt(bytes[3] ?? 0) << 16n) |
      (BigInt(bytes[4] ?? 0) << 8n) |
      BigInt(bytes[5] ?? 0)
  } else {
    if (sequence === MAX_SEQUENCE) throw new RangeError('UUIDv7 generator sequence exhausted')
    sequence++
  }

  const timestamp = BigInt(effectiveTimestamp)
  for (let index = 5; index >= 0; index--) {
    if (bytes[index] !== undefined) {
      bytes[index] = Number(timestamp >> BigInt((5 - index) * 8)) & 0xff
    }
  }
  bytes[6] = 0x70 | Number((sequence >> 37n) & 0x0fn)
  bytes[7] = Number((sequence >> 29n) & 0xffn)
  bytes[8] = 0x80 | Number((sequence >> 23n) & 0x3fn)
  bytes[9] = Number((sequence >> 15n) & 0xffn)
  bytes[10] = Number((sequence >> 7n) & 0xffn)
  const currentEleven = bytes[11] ?? 0
  bytes[11] = Number(sequence & 0x7fn) * 2 + (currentEleven & 0x01)
  if (bytes[11] !== undefined && bytes[11] > 0xff) {
    // Carry is impossible: the low 7 sequence bits plus one bit fit in a byte.
    bytes[11] = bytes[11] & 0xff
  }

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-')
}

/** Session ids must be safe to embed in file names and partial-match lookups. */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/

export function assertValidSessionId(id: string): void {
  if (!SESSION_ID_PATTERN.test(id)) {
    throw new Error(
      'Session id must be non-empty, contain only alphanumeric characters, ' +
        '"-", "_", and ".", and start and end with an alphanumeric character',
    )
  }
}

/**
 * Generate a unique short id (8 hex chars, collision-checked against the ids
 * already in the session). Falls back to a full uuid if 100 attempts all
 * collide, which should never happen for honest 32-bit prefixes.
 */
export function generateEntryId(byId: { has(id: string): boolean }): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = randomUUID().slice(0, 8)
    if (!byId.has(id)) return id
  }
  return randomUUID()
}
