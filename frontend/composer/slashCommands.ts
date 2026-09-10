/**
 * The commands the composer understands.
 *
 * Only what black can actually do. A menu of plausible entries that do nothing
 * is worse than a short one, because the first thing anyone does with a command
 * menu is try the commands.
 */
export interface SlashCommand {
  /** What gets typed, leading slash included. */
  name: string
  /** One line under the name, saying what it does. */
  description: string
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    name: '/compact',
    description: 'Summarize the older turns so the context keeps fitting'
  }
]

/**
 * Whether the composer holds a command being typed rather than a message.
 *
 * Only at the very start of the input. A slash inside a sentence is a path or a
 * date, and opening a menu over it would be wrong far more often than right.
 */
export function isCommandQuery(text: string): boolean {
  return text.startsWith('/') && !text.includes('\n')
}

/** Commands matching what has been typed so far. */
export function matchCommands(text: string): readonly SlashCommand[] {
  if (!isCommandQuery(text)) return []

  const needle = text.slice(1).toLowerCase()
  return SLASH_COMMANDS.filter((command) => command.name.slice(1).toLowerCase().startsWith(needle))
}

/** The command an input names exactly, or null when it is an ordinary message. */
export function commandFor(text: string): SlashCommand | null {
  const trimmed = text.trim().toLowerCase()
  return SLASH_COMMANDS.find((command) => command.name === trimmed) ?? null
}
