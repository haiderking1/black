import * as Schema from 'effect/Schema'
import * as Rpc from 'effect/unstable/rpc/Rpc'
import * as RpcGroup from 'effect/unstable/rpc/RpcGroup'

import { FsError, ProviderConfigError } from './errors'
import { CodexUsage } from './codexUsage'
import { DirectoryResult, GitBranchInput, GitBranchResult, ListDirectoryInput, OpenInFilesInput } from './fs'
import {
  ChatCancelInput,
  ChatCancelResult,
  ChatCompleteInput,
  ChatCompleteResult,
  ChatCompactInput,
  ChatCompactResult,
  ChatContextUsageInput,
  ChatContextUsageResult,
  ChatStreamEvent,
} from './chat'
import { METHODS } from './methods'
import { InstructionsInput, InstructionsResult, SaveInstructionInput } from './instructions'
import {
  ListEndpointsInput,
  ListModelsInput,
  ModelEndpoint,
  ModelInfo,
  ProviderIdInput,
  ProviderStatus,
  SetApiKeyInput,
  SetProviderEnabledInput,
  SubmitOAuthCodeInput,
} from './providers'

/**
 * The method surface.
 *
 * Each method declares its payload, its success value, and every error it can
 * fail with. That declaration is the whole contract: the server cannot answer
 * with a shape the client does not expect, and the client cannot call a method
 * the server does not serve.
 */

const ListDirectoryRpc = Rpc.make(METHODS.listDirectory, {
  payload: ListDirectoryInput,
  success: DirectoryResult,
  error: FsError,
})

const OpenDirectoryDialogRpc = Rpc.make(METHODS.openDirectoryDialog, {
  success: Schema.NullOr(Schema.String),
  error: FsError,
})

const OpenInFilesRpc = Rpc.make(METHODS.openInFiles, {
  payload: OpenInFilesInput,
  success: Schema.String,
  error: FsError,
})

const GetGitBranchRpc = Rpc.make(METHODS.getGitBranch, {
  payload: GitBranchInput,
  success: GitBranchResult,
  error: FsError,
})


const GetHomeDirRpc = Rpc.make(METHODS.getHomeDir, {
  success: Schema.String,
})

const GetCwdRpc = Rpc.make(METHODS.getCwd, {
  success: Schema.String,
})

const ListProvidersRpc = Rpc.make(METHODS.listProviders, {
  success: Schema.Array(ProviderStatus),
})

const CodexUsageRpc = Rpc.make(METHODS.codexUsage, {
  success: CodexUsage,
  error: ProviderConfigError,
})

const SetApiKeyRpc = Rpc.make(METHODS.setApiKey, {
  payload: SetApiKeyInput,
  success: ProviderStatus,
  error: ProviderConfigError,
})

const ClearApiKeyRpc = Rpc.make(METHODS.clearApiKey, {
  payload: ProviderIdInput,
  success: ProviderStatus,
  error: ProviderConfigError,
})

const SetEnabledRpc = Rpc.make(METHODS.setEnabled, {
  payload: SetProviderEnabledInput,
  success: ProviderStatus,
  error: ProviderConfigError,
})

const ListModelsRpc = Rpc.make(METHODS.listModels, {
  payload: ListModelsInput,
  success: Schema.Array(ModelInfo),
  error: ProviderConfigError,
})

const ListEndpointsRpc = Rpc.make(METHODS.listEndpoints, {
  payload: ListEndpointsInput,
  success: Schema.Array(ModelEndpoint),
  error: ProviderConfigError,
})

const StartOAuthRpc = Rpc.make(METHODS.startOAuth, {
  payload: ProviderIdInput,
  success: ProviderStatus,
  error: ProviderConfigError,
})

const CancelOAuthRpc = Rpc.make(METHODS.cancelOAuth, {
  payload: ProviderIdInput,
  success: Schema.Void,
  error: ProviderConfigError,
})

const SubmitOAuthCodeRpc = Rpc.make(METHODS.submitOAuthCode, {
  payload: SubmitOAuthCodeInput,
  success: Schema.Void,
  error: ProviderConfigError,
})

const ChatTitleRpc = Rpc.make(METHODS.title, {
  payload: Schema.Struct({ providerId: Schema.NonEmptyString, model: Schema.NonEmptyString, message: Schema.String, sessionId: Schema.NonEmptyString }),
  success: Schema.Struct({ title: Schema.NonEmptyString }),
  error: ProviderConfigError,
})

const ChatCompleteRpc = Rpc.make(METHODS.complete, {
  payload: ChatCompleteInput,
  success: ChatCompleteResult,
  error: ProviderConfigError,
})

// `stream: true` makes the success value a Stream, so the client receives events
// as they arrive rather than waiting for the whole reply.
const ChatStreamRpc = Rpc.make(METHODS.stream, {
  payload: ChatCompleteInput,
  success: ChatStreamEvent,
  stream: true,
})

// Separate from the stream because a stream cannot stop itself: the reader
// dropping the socket does not stop the request upstream, which keeps
// generating. Ending one takes a call from the other direction.
const ChatCancelRpc = Rpc.make(METHODS.cancel, {
  payload: ChatCancelInput,
  success: ChatCancelResult,
})

// Measured on demand rather than reported alongside a turn, so the gauge has a
// reading as soon as a conversation is open.
const ChatContextUsageRpc = Rpc.make(METHODS.contextUsage, {
  payload: ChatContextUsageInput,
  success: ChatContextUsageResult,
  error: ProviderConfigError,
})

// Forces a checkpoint rather than waiting for the window to fill, so the reader
// can make room before a turn they know is going to be large.
const ChatCompactRpc = Rpc.make(METHODS.compact, {
  payload: ChatCompactInput,
  success: ChatCompactResult,
  error: ProviderConfigError,
})

export const ServerRpcs = RpcGroup.make(
  Rpc.make(METHODS.listInstructions, { payload: InstructionsInput, success: InstructionsResult, error: FsError }),
  Rpc.make(METHODS.saveInstruction, { payload: SaveInstructionInput, success: InstructionsResult, error: FsError }),
  ListDirectoryRpc,
  OpenDirectoryDialogRpc,
  OpenInFilesRpc,
  GetGitBranchRpc,
  GetHomeDirRpc,
  GetCwdRpc,
  ListProvidersRpc,
  CodexUsageRpc,
  SetApiKeyRpc,
  ClearApiKeyRpc,
  SetEnabledRpc,
  ListModelsRpc,
  ListEndpointsRpc,
  StartOAuthRpc,
  CancelOAuthRpc,
  SubmitOAuthCodeRpc,
  ChatTitleRpc,
  ChatCompleteRpc,
  ChatStreamRpc,
  ChatCancelRpc,
  ChatContextUsageRpc,
  ChatCompactRpc,
)
