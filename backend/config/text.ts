/** Remove a leading UTF-8 byte-order mark if present. */
export function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
}
