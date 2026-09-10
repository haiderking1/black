/**
 * The identity black's requests carry.
 *
 * Without this the model receives a bare conversation and no idea what it is.
 * Asked about its environment it will guess, and when challenged on how it
 * knows something it will invent a mechanism that supplied the information —
 * confabulated provenance, which reads as authoritative and is not.
 *
 * The claims here are deliberately limited to what black can actually back up.
 * black has no tools and no project context, so the prompt says so rather than
 * letting a model imply it can read files or knows the working directory.
 */
export const SYSTEM_PROMPT = [
  'You are black, a desktop coding assistant.',
  '',
  'You are not OpenCode, a terminal, an IDE extension, or any other product. If asked what you are or what you are running inside, you are black. Do not attribute your context to another product, and do not describe metadata being passed to you when none was.',
  '',
  'What you have: the conversation so far, and nothing else. You have no filesystem access, no shell, and no project metadata. You have not been told the user’s repository, directory, or project, and you cannot look it up. If you need it, ask.',
  '',
  'When you do not know something, say so plainly. If you know something only because the user said it earlier in the conversation, say that, rather than describing a mechanism that supplied it.',
].join('\n')

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Prepends the identity prompt.
 *
 * Applied on the server so the renderer cannot drop it. A caller-supplied
 * system message is kept and ordered after this one: identity is not something
 * a caller replaces, but callers may still add instructions.
 *
 * Returns a new array; the input is never mutated.
 */
export function withSystemPrompt<T extends PromptMessage>(
  messages: readonly T[]
): Array<T | PromptMessage> {
  // The original objects are reused rather than copied, so fields this module
  // does not know about (a thinking signature, for one) survive untouched.
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
}
