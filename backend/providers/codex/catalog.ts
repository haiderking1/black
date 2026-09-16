import type { ModelInfo, ThinkingSupport } from '../types'

export interface CodexModel {
  id: string
  name: string
  ownedBy: string
  created: number
  context: number
  images: boolean
  tools: boolean
  thinking: ThinkingSupport
}

const EFFORT = (levels: string[]): ThinkingSupport => ({
  reasoning: true,
  kind: 'effort',
  levels,
})

const STANDARD_EFFORT = ['low', 'medium', 'high', 'xhigh']
const MAX_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max']

/**
 * Models the ChatGPT Codex backend currently serves.
 *
 * The vendor does not publish a public catalog for this subscription path, so
 * the list is the one Codex itself accepts. A model added here shows up in the
 * picker; one removed here is dropped.
 */
export const CODEX_MODELS: readonly CodexModel[] = [
  {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    ownedBy: 'openai',
    created: 0,
    context: 272_000,
    images: true,
    tools: true,
    thinking: EFFORT(STANDARD_EFFORT),
  },
  {
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    ownedBy: 'openai',
    created: 0,
    context: 272_000,
    images: true,
    tools: true,
    thinking: EFFORT(MAX_EFFORT),
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    ownedBy: 'openai',
    created: 0,
    context: 272_000,
    images: true,
    tools: true,
    thinking: EFFORT(MAX_EFFORT),
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    ownedBy: 'openai',
    created: 0,
    context: 272_000,
    images: true,
    tools: true,
    thinking: EFFORT(MAX_EFFORT),
  },
  {
    id: 'gpt-6-astra',
    name: 'GPT-6 Astra',
    ownedBy: 'openai',
    created: 0,
    context: 272_000,
    images: true,
    tools: true,
    thinking: EFFORT(MAX_EFFORT),
  },
  {
    id: 'gpt-5.3-codex-spark',
    name: 'GPT-5.3 Codex Spark',
    ownedBy: 'openai',
    created: 0,
    context: 128_000,
    images: false,
    tools: true,
    thinking: EFFORT(STANDARD_EFFORT),
  },
]

const UNKNOWN: ThinkingSupport = { reasoning: false, kind: 'unknown', levels: [] }

export function modelById(id: string): CodexModel | undefined {
  return CODEX_MODELS.find((model) => model.id === id)
}

export function listCodexModels(): ModelInfo[] {
  return CODEX_MODELS.map((model) => ({
    id: model.id,
    ownedBy: model.ownedBy,
    created: model.created,
    name: model.name,
  }))
}

export function thinkingFor(modelId: string): ThinkingSupport {
  return modelById(modelId)?.thinking ?? UNKNOWN
}

export function contextWindowFor(modelId: string): number {
  return modelById(modelId)?.context ?? 272_000
}

export function imagesFor(modelId: string): boolean {
  return modelById(modelId)?.images ?? false
}

export function toolsFor(modelId: string): boolean {
  return modelById(modelId)?.tools ?? false
}
