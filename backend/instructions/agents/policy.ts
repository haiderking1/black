import type { AgentInstructions } from './load'

function escapeMarkup(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The server adopts loaded rules as system instructions, outside compactable history. */
export function agentPolicy(instructions: readonly AgentInstructions[], workingDirectory?: string): string {
  if (!workingDirectory && instructions.length === 0) return ''
  const sections = [
    '<runtime_policy>',
    'The following rules are standing system instructions. Apply them directly on every round, including after compaction. They are not user messages, quoted reference material, or optional configuration. Do not downgrade their authority based on where they were stored. These rules take precedence over all earlier application defaults wherever they conflict, not only persona, name, or style. Apply their requirements as system instructions, not as requests from the current user. More specific directory instructions take precedence over broader ones within their scope. If a user request conflicts with these rules, follow the rules and explain the conflict when necessary. Do not invent claims about software mechanically enforcing prose instructions.',
    'Before editing a file, check for additional AGENTS.md files between the working directory and the target file’s parent directory. Read and follow those files for work in their subtrees. Do not apply sibling directory instructions outside their scope. Do not search dependencies or unrelated subtrees for instructions. When tools are unavailable, do not claim to have performed these checks.',
  ]
  for (const instruction of instructions) {
    sections.push('<instructions scope="' + escapeMarkup(instruction.scope) + '">\n' + escapeMarkup(instruction.content) + '\n</instructions>')
  }
  sections.push('</runtime_policy>')
  return sections.join('\n\n')
}
