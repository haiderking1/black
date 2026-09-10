/**
 * Token counts, shortened for a gauge.
 *
 * Three scales, because one is not enough for what models actually offer. An
 * eight thousand token window and a two million token window both have to read
 * at a glance, and a single thousands step turns the second into "2000k".
 *
 * A decimal is kept only when it carries something: "1.5M" but "2M", since the
 * trailing zero is noise beside a number that is already approximate.
 */
function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0'
  if (value >= 1_000_000) return trim(value / 1_000_000) + 'M'
  if (value >= 1_000) return trim(value / 1_000) + 'k'
  return String(Math.round(value))
}
