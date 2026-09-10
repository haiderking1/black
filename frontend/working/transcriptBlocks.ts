import type { WorkPart } from './model'

export type TranscriptBlock =
  | { type: 'text'; key: string; text: string }
  | { type: 'work'; key: string; parts: WorkPart[] }

/** One activity group per turn. Spoken text keeps its original key and never moves into it. */
export function transcriptBlocks(parts: readonly WorkPart[]): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = []
  let work: Extract<TranscriptBlock, { type: 'work' }> | undefined
  for (const [index, part] of parts.entries()) {
    if (part.type === 'text') {
      if (part.text !== '') blocks.push({ type: 'text', key: 'text:' + index, text: part.text })
      continue
    }
    if (part.type === 'thinking' && part.text === '') continue
    if (work) work.parts.push(part)
    else {
      work = { type: 'work', key: 'work:' + index, parts: [part] }
      blocks.push(work)
    }
  }
  return blocks
}
