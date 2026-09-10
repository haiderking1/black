/**
 * Prompt text for the summarization calls.
 *
 * The section headings are a contract rather than a style choice: an updated
 * summary keeps the shape of the summary it replaces, so a session can be
 * compacted repeatedly without information drifting between sections.
 *
 * Derived from pi (https://github.com/earendil-works/pi, MIT, Mario Zechner).
 */

export const SUMMARIZATION_SYSTEM_PROMPT =
  'You summarize conversations between a user and an AI coding assistant. ' +
  'Output only the structured summary the request describes. ' +
  'Do not continue the conversation, answer its questions, or comment on it.'

/** The sections every summary carries, and what belongs in each. */
const SUMMARY_FORMAT = `Use this exact format:

## Goal
[What the user is trying to accomplish. More than one item when the session covers several tasks.]

## Constraints & Preferences
- [Constraints, preferences, or requirements the user stated]
- [(none) when none came up]

## Progress
### Done
- [x] [Finished work]

### In Progress
- [ ] [Work under way]

### Blocked
- [Problems preventing progress, if any]

## Key Decisions
- **[Decision]**: [Why it was made]

## Next Steps
1. [What should happen next, in order]

## Critical Context
- [Data, examples, or references needed to continue]
- [(none) when nothing qualifies]`;

export const SUMMARIZATION_PROMPT = `The messages above are a conversation to summarize. Write a context checkpoint another assistant can use to pick the work up.

${SUMMARY_FORMAT}

Keep every section short. Copy file paths, function names, and error messages exactly as they appear.`

export const UPDATE_SUMMARIZATION_PROMPT = `The messages above are new turns to fold into the summary given in the <previous-summary> tags.

Rules:
- Keep every fact already in the previous summary.
- Add the new progress, decisions, and context.
- Move finished items from In Progress to Done.
- Rewrite Next Steps to match where the work now stands.
- Copy file paths, function names, and error messages exactly.
- Drop anything that no longer applies.

${SUMMARY_FORMAT}

Keep every section short.`

export const TURN_PREFIX_SUMMARIZATION_PROMPT = `The text above is the opening PREFIX of a single turn too large to keep whole. The recent end of that turn is retained separately.

Summarize the prefix so the retained part can be understood without it:

## Original Request
[What the user asked for in this turn]

## Early Progress
- [Decisions and work from the prefix]

## Context for Suffix
- [What the retained part needs from the prefix]

Be brief. Cover only what the retained part depends on.`

/** Marks a summary as coming from a branch the user left and came back from. */
export const BRANCH_SUMMARY_PREAMBLE =
  'The user explored a different conversation branch before returning here.\n' +
  'Summary of that exploration:\n\n'

/** Branch summaries carry no Critical Context section; they are shorter by design. */
const BRANCH_SUMMARY_FORMAT = `## Goal
[What the user was trying to accomplish in this branch]

## Constraints & Preferences
- [Constraints, preferences, or requirements the user stated]
- [(none) when none came up]

## Progress
### Done
- [x] [Finished work]

### In Progress
- [ ] [Work started but not finished]

### Blocked
- [Problems preventing progress, if any]

## Key Decisions
- **[Decision]**: [Why it was made]

## Next Steps
1. [What should happen next to continue this work]`

export const BRANCH_SUMMARY_PROMPT = `Write a summary of this conversation branch, so the work done in it is not lost when the conversation returns to another branch.

Use this exact format:

${BRANCH_SUMMARY_FORMAT}

Keep every section short. Copy file paths, function names, and error messages exactly as they appear.`
