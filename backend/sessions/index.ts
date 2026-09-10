/**
 * Session file persistence: JSONL session format v3. The core module is
 * Electron-free so tests can run it under bun.
 */
export { SessionManager, type AppendableMessage } from './manager'
export { CURRENT_SESSION_VERSION } from './types'
export { assertValidSessionId, SESSION_ID_PATTERN, generateEntryId, uuidv7 } from './ids'
export {
  encodeCwdToDirName,
  getDefaultSessionDir,
  getDefaultSessionDirPath,
  getDefaultSessionsParentDir,
  normalizePath,
  resolvePath,
  sessionFileName,
} from './paths'
export {
  isSessionHeader,
  loadEntriesFromFile,
  MAX_SESSION_HEADER_SCAN_BYTES,
  parseSessionEntries,
  parseSessionEntryLine,
  readSessionHeader,
  readSessionHeaderForDiscovery,
  SessionHeaderScanLimitError,
  SESSION_HEADER_READ_BUFFER_SIZE,
  SESSION_READ_BUFFER_SIZE,
} from './parse'
export { migrateSessionEntries, migrateToCurrentVersion } from './migrations'
export {
  bashExecutionToText,
  BRANCH_SUMMARY_PREFIX,
  BRANCH_SUMMARY_SUFFIX,
  COMPACTION_SUMMARY_PREFIX,
  COMPACTION_SUMMARY_SUFFIX,
  convertToLlm,
  createBranchSummaryMessage,
  createCompactionSummaryMessage,
  createCustomMessage,
  sumUsage,
} from './messages'
export {
  buildContextEntries,
  buildSessionPath,
  buildSessionContext,
  getLatestCompactionEntry,
  sessionEntryToContextMessages,
} from './context'
export {
  buildSessionInfo,
  findMostRecentSession,
  listSessionsFromDir,
  listAllSessionsFromParent,
  sortSessionsByModified,
  sessionCwdMatches,
} from './info'
export { deleteSessionFile, type DeleteSessionResult } from './delete'
export {
  assertSessionCwdExists,
  getMissingSessionCwdIssue,
  MissingSessionCwdError,
  type SessionCwdIssue,
} from './cwd'
export * from './types'
