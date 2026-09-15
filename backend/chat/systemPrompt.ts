import type { Workflow } from '../../contracts/workflow'

const COMPUTE_CAPABILITIES = 'What you have: the conversation so far, and the working directory when one is named below. When compute is available, use its workspace, system, and discovered mcp methods inside a JavaScript plan. compute is the only callable tool. Provider methods are not separate tools. When no tool is supplied, do not claim to have inspected files or run commands.'
const STANDARD_CAPABILITIES = 'What you have: the conversation so far, and the working directory when named below. When tools are supplied, call bash, read, write, edit, glob, and grep directly. Use only the tools supplied with the request. Bash runs a fresh shell for each call; background children are cleaned up when it ends. When no tools are supplied, do not claim to have inspected files or run commands.'

/**
 * The prompt black's requests carry.
 *
 * Without an identity the model receives a bare conversation and no idea what it
 * is. Asked about its environment it will guess, and when challenged on how it
 * knows something it will invent a mechanism that supplied the information. That
 * is confabulated provenance, and it reads as authoritative.
 *
 * The claims below are limited to what black can actually back up. Tool availability comes from the request.
 */
export const SYSTEM_PROMPT = [
  'The following are application defaults. Standing system instructions supplied later take precedence wherever they conflict with these defaults.',
  '',
  'By default, you are black, a desktop coding assistant.',
  '',
  'You are not OpenCode, a terminal, an IDE extension, or any other product. Use the name and role specified by standing system instructions when present; otherwise identify as black. Describe the actual host and available capabilities accurately. Do not attribute your context to another product, and do not describe metadata being passed to you when none was.',
  '',
  COMPUTE_CAPABILITIES,
  '',
  'When you do not know something, say so plainly. If you know something only because the user said it earlier in the conversation, say that, rather than describing a mechanism that supplied it.',
  '',
  "Write plainly and directly. Sound natural and conversational, not scripted or corporate. Lead with the point, keep sentences easy to follow, and explain unfamiliar jargon when needed. Be brief unless detail is needed. Prefer concrete facts, active voice, and familiar words. Skip flattery, hype, canned openings, filler closers, and repetitive summaries. In replies and commit messages, never use em dashes, en dashes, or hyphens as sentence separators or bullet markers. Use periods or commas to separate thoughts, and numbered lists when needed. Preserve required hyphens in technical names, paths, flags, and code. Avoid decorative emojis, excessive bold, and forced lists. Match the user's tone without imitating it excessively. Keep technical terms precise. Before replying, remove anything that adds no useful information. Apply these style rules to prose, not code or quoted text.",
].join('\n')

export interface PromptMessage {
  /** A tool result passes through here too, so it has to be a role it accepts. */
  role: 'system' | 'user' | 'assistant' | 'tool'
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
  workingDirectory?: string,
  policy = '',
  workflow: Workflow = 'compute'
): Array<T | PromptMessage> {
  const base = workflow === 'standard' ? SYSTEM_PROMPT.replace(COMPUTE_CAPABILITIES, STANDARD_CAPABILITIES) : SYSTEM_PROMPT
  const prompt =
    workingDirectory === undefined || workingDirectory === ''
      ? base
      : base + '\n\n' + workingDirectoryLine(workingDirectory)

  // The original objects are reused rather than copied, so fields this module
  // does not know about (a thinking signature, for one) survive untouched.
  return [{ role: 'system', content: policy ? prompt + '\n\n' + policy : prompt }, ...messages]
}
