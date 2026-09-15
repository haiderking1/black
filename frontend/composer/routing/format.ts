/**
 * How OpenRouter host stats are shown.
 *
 * Prices on the wire are USD per token. The picker shows dollars per million,
 * which is how OpenRouter itself lists them.
 */

export function formatTps(tps: number): string {
  const rounded = tps >= 10 ? Math.round(tps) : Math.round(tps * 10) / 10
  return String(rounded) + ' tps'
}

export function formatLatency(ms: number): string {
  const millis = ms > 0 && ms < 1 ? ms * 1000 : ms
  if (millis >= 1000) {
    const seconds = millis / 1000
    const text = seconds >= 10 ? String(Math.round(seconds)) : String(Math.round(seconds * 10) / 10)
    return text + 's'
  }
  return String(Math.round(millis)) + 'ms'
}

export function formatUsdPerMillion(perToken: number): string {
  const perM = perToken * 1_000_000
  if (perM === 0) return '$0'
  if (perM >= 100) return '$' + perM.toFixed(0)
  if (perM >= 10) return '$' + (Number.isInteger(perM) ? String(perM) : perM.toFixed(1).replace(/\.0$/, ''))
  if (perM >= 1) return '$' + (Number.isInteger(perM) ? String(perM) : perM.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''))
  if (perM >= 0.01) return '$' + perM.toFixed(2)
  return '$' + perM.toPrecision(2)
}

export function formatPricePair(prompt?: number, completion?: number): string | null {
  if (prompt === undefined && completion === undefined) return null
  const inPrice = prompt ?? 0
  const outPrice = completion ?? 0
  if (inPrice === 0 && outPrice === 0) return 'Free'
  return formatUsdPerMillion(inPrice) + ' / ' + formatUsdPerMillion(outPrice)
}

/** OpenRouter discount is a fraction: 0.2 is 20% off, 1 is free. */
export function formatDiscount(discount?: number): string | null {
  if (discount === undefined || discount <= 0) return null
  if (discount >= 1) return 'Free'
  return '\u2212' + String(Math.round(discount * 100)) + '%'
}
