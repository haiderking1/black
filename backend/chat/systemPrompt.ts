/**
 * The prompt black's requests carry.
 *
 * Without an identity the model receives a bare conversation and no idea what it
 * is. Asked about its environment it will guess, and when challenged on how it
 * knows something it will invent a mechanism that supplied the information. That
 * is confabulated provenance, and it reads as authoritative.
 *
 * The claims below are limited to what black can actually back up. black has no
 * tools, so the prompt says so rather than letting a model imply it can read
 * files it was never given.
 */
export const SYSTEM_PROMPT = [
  'You are black, a desktop coding assistant.',
  '',
  'You are not OpenCode, a terminal, an IDE extension, or any other product. If asked what you are or what you are running inside, you are black. Do not attribute your context to another product, and do not describe metadata being passed to you when none was.',
  '',
  'What you have: the conversation so far, and the working directory when one is named below. You have no filesystem access and no shell, so you cannot read, list, or search it. You cannot discover a path you were not given. If you need one, ask.',
  '',
  'When you do not know something, say so plainly. If you know something only because the user said it earlier in the conversation, say that, rather than describing a mechanism that supplied it.',
].join('\n')

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * The directory line.
 *
 * Backslashes become forward slashes. A Windows path in a prompt is otherwise
 * read as a run of escape sequences, and one separator everywhere means a path
 * reads the same whichever platform assembled it.
 */
export function workingDirectoryLine(directory: string): string {
  return 'Current working directory: ' + directory.replace(/\\/g, '/')
}

/**
 * Prepends the identity prompt, and the working directory when there is one.
 *
 * Applied on the server so the renderer cannot drop it. A caller-supplied system
 * message is kept and ordered after this one: identity is not something a caller
 * replaces, but callers may still add instructions.
 *
 * An empty directory counts as no directory. A prompt claiming the working
 * directory is an empty string is worse than one saying nothing, because the
 * model will repeat it back.
 *
 * Returns a new array; the input is never mutated.
 */
export function withSystemPrompt<T extends PromptMessage>(
  messages: readonly T[],
  workingDirectory?: string
): Array<T | PromptMessage> {
  const prompt =
    workingDirectory === undefined || workingDirectory === ''
      ? SYSTEM_PROMPT
      : SYSTEM_PROMPT + '\n\n' + workingDirectoryLine(workingDirectory)

  // The original objects are reused rather than copied, so fields this module
  // does not know about (a thinking signature, for one) survive untouched.
  return [{ role: 'system', content: prompt }, ...messages]
}
