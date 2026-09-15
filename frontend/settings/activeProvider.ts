import type { ProviderStatus } from '../../contracts/providers'

/** Enabled providers on the model-picker rail, keyed or not. */
export function pickerRail(
  providers: readonly ProviderStatus[],
): Array<{ id: string; name: string }> {
  return providers
    .filter((entry) => entry.enabled)
    .map((entry) => ({ id: entry.id, name: entry.name }))
}

/** Provider the composer should talk to right now. */
export function activeProviderId(
  selected: string | null,
  providers: readonly ProviderStatus[],
): string {
  const enabled = providers.filter((entry) => entry.enabled)
  if (selected !== null && enabled.some((entry) => entry.id === selected)) return selected
  // Status has not arrived yet. Keep the saved id rather than flashing OpenCode
  // and writing that catalog's first model over the stored one.
  if (providers.length === 0 && selected !== null && selected !== '') return selected
  const usable = enabled.filter((entry) => entry.authenticated)
  return usable[0]?.id ?? enabled[0]?.id ?? 'opencode-go'
}

export function providerDisplayName(
  providerId: string,
  providers: readonly ProviderStatus[],
): string | undefined {
  return providers.find((entry) => entry.id === providerId)?.name
}
