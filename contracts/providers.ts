import * as Schema from 'effect/Schema'

/**
 * Provider configuration contracts.
 *
 * A provider's credentials live on the server, never in the renderer, so the
 * settings screen reads status over the wire and writes keys over the wire. The
 * renderer never sees a key it did not just type, because nothing reads one back.
 */

export const ProviderStatus = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  baseUrl: Schema.String,
  enabled: Schema.Boolean,
  /** Whether a usable key is configured. A key value is never returned. */
  authenticated: Schema.Boolean,
  /** Models the vendor reports, or null when the catalog could not be read. */
  modelCount: Schema.NullOr(Schema.Int),
  /** How this provider is signed in. Absent means a pasted API key. */
  authKind: Schema.optional(Schema.Literals(['api_key', 'oauth'])),
  /** Absent means chat. A service holds a key and never appears on the picker. */
  role: Schema.optional(Schema.Literals(['chat', 'service'])),
})

/**
 * The decoded shape. Effect schemas are values, so the type is derived from the
 * schema rather than declared twice and allowed to drift.
 */
export type ProviderStatus = typeof ProviderStatus.Type

export function isChatProvider(role: ProviderStatus['role']): boolean {
  return role !== 'service'
}

/**
 * One model as the vendor reports it. The catalog is the vendor's, so this is
 * whatever it currently serves rather than a list baked into this build.
 */
export const ModelInfo = Schema.Struct({
  id: Schema.String,
  ownedBy: Schema.String,
  created: Schema.Number,
  /** Display name when the vendor publishes one distinct from the id. */
  name: Schema.optional(Schema.String),
  /** Omitted when the model is not in the limits catalog. */
  reasoning: Schema.optional(Schema.Boolean),
  /**
   * How the model exposes reasoning. 'effort' accepts one of thinkingLevels,
   * 'toggle' is on or off, 'none' reasons with no control, and 'unknown' means
   * the model is unlisted so no thinking parameter should be sent.
   */
  thinkingKind: Schema.optional(Schema.Literals(['effort', 'toggle', 'none', 'unknown'])),
  /** Effort values the model accepts, when thinkingKind is 'effort'. */
  thinkingLevels: Schema.optional(Schema.Array(Schema.String)),
})

export type ModelInfo = typeof ModelInfo.Type

/**
 * How much reasoning a model should spend.
 *
 * Declared here because the choice has to cross the wire with the message that
 * uses it. 'off' through 'max' match what the vendors accept.
 */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

export const ListModelsInput = Schema.Struct({
  providerId: Schema.NonEmptyString,
})

export const ListEndpointsInput = Schema.Struct({
  providerId: Schema.NonEmptyString,
  model: Schema.NonEmptyString,
})

export const ModelEndpoint = Schema.Struct({
  tag: Schema.String,
  providerName: Schema.String,
  contextLength: Schema.Int,
  latencyMs: Schema.optional(Schema.Number),
  throughput: Schema.optional(Schema.Number),
  uptime: Schema.optional(Schema.Number),
  status: Schema.Number,
  promptPrice: Schema.optional(Schema.Number),
  completionPrice: Schema.optional(Schema.Number),
  discount: Schema.optional(Schema.Number),
  quantization: Schema.optional(Schema.String),
})

export type ModelEndpoint = typeof ModelEndpoint.Type
export type ListEndpointsInput = typeof ListEndpointsInput.Type

export const SetApiKeyInput = Schema.Struct({
  providerId: Schema.NonEmptyString,
  apiKey: Schema.NonEmptyString,
})

export const ProviderIdInput = Schema.Struct({
  providerId: Schema.NonEmptyString,
})

export const SetProviderEnabledInput = Schema.Struct({
  providerId: Schema.NonEmptyString,
  enabled: Schema.Boolean,
})

export const SubmitOAuthCodeInput = Schema.Struct({
  providerId: Schema.NonEmptyString,
  input: Schema.NonEmptyString,
})
