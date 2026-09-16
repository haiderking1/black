export { PierreEntryIcon } from './PierreEntryIcon'
export type { PierreEntryIconProps } from './PierreEntryIcon'
export {
  resolvePierreIconForEntry,
  hasSpecificPierreIconForFileName,
  syntheticFileNameForLanguageId,
  basenameOfPath,
  inferEntryKindFromPath,
  BLACK_PIERRE_ICONS,
  VIDEO_FILE_EXTENSIONS,
} from './resolver'
export { ICON_COLORS, getIconColor } from './colors'
export { ensurePierreIconSprite, PIERRE_ICON_SPRITE_ID, CUSTOM_FILE_ICON_SPRITE } from './sprite'
export type { PierreIconResolution, EntryKind, IconThemeMode } from './types'
