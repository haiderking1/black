import * as Schema from 'effect/Schema'

export const InstructionsInput = Schema.Struct({ workingDirectory: Schema.optional(Schema.String) })
export const InstructionFile = Schema.Struct({ path: Schema.String, scope: Schema.String, content: Schema.String, revision: Schema.String })
export const InstructionsResult = Schema.Struct({ files: Schema.Array(InstructionFile), globalExcluded: Schema.Boolean })
export type InstructionFile = typeof InstructionFile.Type
export const SaveInstructionInput = Schema.Struct({ workingDirectory: Schema.optional(Schema.String), path: Schema.String, content: Schema.String, revision: Schema.String })
