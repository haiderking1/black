export interface MarkdownAstNode {
  type?: string
  meta?: unknown
  url?: string
  data?: {
    hProperties?: Record<string, unknown>
  }
  children?: MarkdownAstNode[]
}

const FENCE_TITLE_ATTR_REGEX = /(?:^|\s)(?:title|file(?:name)?)=(?:"([^"]+)"|'([^']+)'|(\S+))/i
const FENCE_FILENAME_TOKEN_REGEX = /^[\w@][\w@./-]*\.[A-Za-z0-9]+$/

/**
 * Pulls a filename out of fence meta:
 * ```ts title="x.ts"
 * ```ts filename="x.ts"
 * ```ts src/main.ts
 */
export function extractFenceTitle(meta: string | undefined): string | null {
  if (!meta) return null
  const attrMatch = FENCE_TITLE_ATTR_REGEX.exec(meta)
  const attrTitle = attrMatch?.[1] ?? attrMatch?.[2] ?? attrMatch?.[3]
  if (attrTitle) return attrTitle
  return meta.split(/\s+/).find((candidate) => FENCE_FILENAME_TOKEN_REGEX.test(candidate)) ?? null
}

/**
 * Remark plugin to attach code block fence meta to HAST properties
 * so that ReactMarkdown passes it down to custom code block renderers.
 */
export function remarkPreserveCodeMeta() {
  return (tree: MarkdownAstNode) => {
    const visit = (node: MarkdownAstNode) => {
      if (node.type === 'code' && typeof node.meta === 'string' && node.meta.trim().length > 0) {
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            dataCodeMeta: node.meta.trim(),
          },
        }
      }
      node.children?.forEach(visit)
    }

    visit(tree)
  }
}
