import * as Schema from 'effect/Schema'

export const CodexUsageWindow = Schema.Struct({
  usedPercent: Schema.Number,
  windowSeconds: Schema.Int,
  resetAt: Schema.NullOr(Schema.Number),
})
export type CodexUsageWindow = typeof CodexUsageWindow.Type

export const CodexUsage = Schema.Struct({
  planType: Schema.NullOr(Schema.String),
  fetchedAt: Schema.Number,
  weekly: Schema.NullOr(CodexUsageWindow),
  fiveHour: Schema.NullOr(CodexUsageWindow),
})
export type CodexUsage = typeof CodexUsage.Type
