/**
 * Formats a model ID or catalog name into a clean, human-readable display name.
 * e.g. "anthropic/claude-3.5-sonnet" -> "claude-sonnet"
 *      "openai/gpt-4o" -> "gpt-4o"
 *      "gpt-5" -> "gpt-5"
 */
export function formatModelName(modelId?: string, catalogName?: string): string {
  if (catalogName && catalogName.trim() !== '') {
    return catalogName.trim()
  }

  if (!modelId || modelId.trim() === '') {
    return 'model'
  }

  const trimmed = modelId.trim()
  const slashIndex = trimmed.indexOf('/')
  const base = slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed

  // Clean common trailing date stamps (e.g. -20241022)
  const dateStripped = base.replace(/-\d{8}$/, '')

  return dateStripped
}
