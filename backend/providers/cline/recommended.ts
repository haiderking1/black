/**
 * Cline's recommended-models feed.
 *
 * ClinePass's own picker is `clinePass` plus `free`. `recommended` is the
 * pay-as-you-go router and stays out.
 */

import { isClinePassId } from './pass'

export interface ClinePassFeedEntry {
  id: string
  name?: string
}

function parseEntries(raw: unknown): ClinePassFeedEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: ClinePassFeedEntry[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (typeof record['id'] !== 'string' || record['id'] === '') continue
    const name = typeof record['name'] === 'string' && record['name'] !== '' ? record['name'] : undefined
    entries.push({
      id: record['id'],
      ...(name === undefined ? {} : { name }),
    })
  }
  return entries
}

export function parseClinePassFeed(body: unknown): ClinePassFeedEntry[] {
  if (typeof body !== 'object' || body === null) return []
  return parseEntries((body as { clinePass?: unknown }).clinePass).filter((entry) => isClinePassId(entry.id))
}

export function parseClineFreeFeed(body: unknown): ClinePassFeedEntry[] {
  if (typeof body !== 'object' || body === null) return []
  return parseEntries((body as { free?: unknown }).free)
}

/** Stable id of the live ClinePass + free lists. Order is part of the list. */
export function feedFingerprint(pass: ClinePassFeedEntry[], free: ClinePassFeedEntry[]): string {
  const row = (entry: ClinePassFeedEntry): string => entry.id + '\t' + (entry.name ?? '')
  return pass.map(row).join('\n') + '\n--\n' + free.map(row).join('\n')
}
