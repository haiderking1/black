/**
 * Limits for ClinePass rows the live `/models` router has not listed yet.
 *
 * The picker feed can ship a new slug before the router dump does. models.dev
 * already publishes that ClinePass row, so a stub must not invent 128k and
 * "no thinking".
 */

import { createLimitsSource, type LimitsSource, type ModelLimits } from '../opencode/limits'
import { CLINE_PASS_PREFIX } from './pass'

export type { LimitsSource, ModelLimits }

let shared: LimitsSource | undefined

export function defaultClineLimitsSource(): LimitsSource {
  shared ??= createLimitsSource({ providerKeys: ['cline-pass'] })
  return shared
}

/** Tests must not inherit a process-wide models.dev cache. */
export function resetClineLimitsSource(): void {
  shared = undefined
}

function slugOf(modelId: string): string {
  const slash = modelId.lastIndexOf('/')
  return slash >= 0 ? modelId.slice(slash + 1) : modelId
}

export function lookupPassLimits(
  published: Map<string, ModelLimits>,
  modelId: string,
): ModelLimits | undefined {
  const slug = slugOf(modelId)
  return published.get(modelId) ?? published.get(CLINE_PASS_PREFIX + slug) ?? published.get(slug)
}
