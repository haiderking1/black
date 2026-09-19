/** ClinePass subscription slugs. The full Cline catalog also lists routed labs. */
export const CLINE_PASS_PREFIX = 'cline-pass/'

export function isClinePassId(modelId: string): boolean {
  return modelId.startsWith(CLINE_PASS_PREFIX)
}
