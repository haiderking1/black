import * as Schema from 'effect/Schema'

/**
 * Errors that cross the wire.
 *
 * A failure travels as a decoded value rather than a thrown object, so the
 * renderer can branch on the tag without parsing a message. Every error a
 * method can produce is declared on that method, which is what makes the
 * failure case typed instead of unknown.
 */

export class FsError extends Schema.TaggedError<FsError>()('FsError', {
  message: Schema.String,
}) {}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()('NotFoundError', {
  message: Schema.String,
}) {}

/** A provider's configuration could not be read or changed. */
export class ProviderConfigError extends Schema.TaggedError<ProviderConfigError>()('ProviderConfigError', {
  message: Schema.String,
}) {}
