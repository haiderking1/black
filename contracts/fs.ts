import * as Schema from 'effect/Schema'

/**
 * Filesystem contracts.
 *
 * These are the wire shapes, shared by the server that answers and the renderer
 * that asks. The schema is the single definition: the TypeScript type is
 * derived from it, so a field cannot drift between what is sent and what is
 * expected.
 */

/**
 * A struct rather than a class: this crosses the wire, and Effect RPC decodes
 * the response on the way back in. A class schema does not survive that decode,
 * which surfaced as "Expected DirectoryEntry" on every listing.
 */
export const DirectoryEntry = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  isDirectory: Schema.Boolean,
  isHidden: Schema.Boolean,
})

export type DirectoryEntry = typeof DirectoryEntry.Type

export const ListDirectoryInput = Schema.Struct({
  /** Directory to list. Defaults to the process working directory. */
  path: Schema.optional(Schema.String),
})

export const DirectoryResult = Schema.Struct({
  /** The resolved directory the listing describes. */
  currentPath: Schema.String,
  /** Parent directory, or null at a filesystem root. */
  parentPath: Schema.NullOr(Schema.String),
  entries: Schema.Array(DirectoryEntry),
  /** Why the listing failed. Entries stay empty in that case. */
  error: Schema.optional(Schema.String),
})

export type DirectoryResult = typeof DirectoryResult.Type

export const OpenInFilesInput = Schema.Struct({
  path: Schema.NonEmptyString,
})
