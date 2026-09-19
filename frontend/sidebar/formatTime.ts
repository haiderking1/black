/**
 * Formats a unix timestamp into a compact relative time string:
 * now, 12m, 3h, 2d, etc.
 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  if (!timestamp || !Number.isFinite(timestamp)) return ''
  const diffMs = Math.max(0, now - timestamp)
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo`
  return `${Math.floor(diffMonths / 12)}y`
}
