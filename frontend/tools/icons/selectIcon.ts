import { File, FileCode, FileImage, FileJson, FileText, Settings, type LucideIcon } from 'lucide-react'
import { baseName } from '../filePath'
import typescript from './typescript.svg'
import javascript from './javascript.svg'

export function markFor(path: string): string | LucideIcon {
  const name = baseName(path).toLowerCase()
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  if (['ts', 'tsx', 'mts', 'cts'].includes(extension)) return typescript
  if (['js', 'jsx', 'mjs', 'cjs'].includes(extension)) return javascript
  if (['json', 'jsonc'].includes(extension)) return FileJson
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif'].includes(extension)) return FileImage
  if (['md', 'mdx', 'txt', 'log'].includes(extension)) return FileText
  if (['css', 'scss', 'html', 'py', 'rs', 'go', 'c', 'cpp', 'h', 'java', 'rb', 'sh'].includes(extension)) return FileCode
  if (['yaml', 'yml', 'toml', 'ini', 'conf'].includes(extension) || name === '.env') return Settings
  return File
}
