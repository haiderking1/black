import * as Schema from 'effect/Schema'

export const Workflow = Schema.Literals(['compute', 'standard'])
export type Workflow = typeof Workflow.Type
