import * as Effect from 'effect/Effect'
import { FsError } from '../../../contracts/errors'
import { listInstructions, saveInstruction } from '../../instructions/agents/settings'

const failure = (error: unknown) => new FsError({ message: error instanceof Error ? error.message : String(error) })
export function instructionHandlers() {
  return {
    'instructions.list': (input: { workingDirectory?: string }) => Effect.tryPromise({ try: () => listInstructions(input.workingDirectory), catch: failure }),
    'instructions.save': (input: { workingDirectory?: string; path: string; content: string; revision: string }) => Effect.tryPromise({ try: () => saveInstruction(input), catch: failure }),
  }
}
