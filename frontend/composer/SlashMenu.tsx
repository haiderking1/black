import React from 'react'

import type { SlashCommand } from './slashCommands'
import './slash.css'

export interface SlashMenuProps {
  commands: readonly SlashCommand[]
  /** Row the keyboard is on. Always a valid index into commands. */
  activeIndex: number
  /** Chosen by click or by Enter. */
  onSelect: (command: SlashCommand) => void
  /** Hovered, so the keyboard highlight follows the pointer. */
  onActivate: (index: number) => void
}

/**
 * Commands, offered as they are typed.
 *
 * Drawn as the top half of the composer, the way the queued turns are: same
 * fill, same border, tucked under it. Two things can appear in that slot and
 * they should not look like two unrelated widgets.
 */
export function SlashMenu({
  commands,
  activeIndex,
  onSelect,
  onActivate
}: SlashMenuProps): React.JSX.Element | null {
  if (commands.length === 0) return null

  return (
    <div className="slash-menu">
      <div className="slash-card">
        {commands.map((command, index) => (
          <button
            key={command.name}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={index === activeIndex ? 'slash-row active' : 'slash-row'}
            onMouseEnter={() => onActivate(index)}
            onClick={() => onSelect(command)}
          >
            <span className="slash-name">{command.name}</span>
            <span className="slash-description">{command.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
