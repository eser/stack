// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Core types
export type {
  AudioBlock,
  AudioPart,
  ContentBlock,
  FileBlock,
  FilePart,
  ImageBlock,
  ImageDetail,
  ImagePart,
  Message,
  ProviderCapability,
  Role,
  TextBlock,
  ToolCall,
  ToolCallBlock,
  ToolDefinition,
  ToolResult,
  ToolResultBlock,
} from "./types.ts";

// Content helpers
export {
  audioMessage,
  decodeDataUrl,
  detectMimeFromUrl,
  imageMessage,
  isDataUrl,
  textBlock,
  textMessage,
  toolCallBlock,
  toolResultBlock,
  toolResultMessage,
} from "./content.ts";

// Configuration
export type { Config, ConfigTarget, ResolvedConfigTarget } from "./config.ts";
export { withDefaults } from "./config.ts";

// Errors
export type { AiErrorOptions } from "./errors.ts";
export {
  AiError,
  AuthFailedError,
  BadRequestError,
  classifyAndWrap,
  classifyStatusCode,
  InsufficientCreditsError,
  ModelAlreadyExistsError,
  ModelNotFoundError,
  RateLimitedError,
  ServiceUnavailableError,
  UnsupportedProviderError,
} from "./errors.ts";

// Generation
export type {
  ContentDeltaEvent,
  GenerateTextOptions,
  GenerateTextResult,
  MessageDoneEvent,
  ResponseFormat,
  SafetySetting,
  StopReason,
  StreamErrorEvent,
  StreamEvent,
  ToolCallDeltaEvent,
  ToolChoice,
  Usage,
} from "./generation.ts";
export { collectStream, text, toolCalls } from "./generation.ts";

// Batch
export type {
  BatchJob,
  BatchRequest,
  BatchRequestItem,
  BatchResult,
  BatchStatus,
  BatchStorage,
  ListBatchOptions,
} from "./batch.ts";

// Model
export type {
  BatchCapableModel,
  LanguageModel,
  ProviderFactory,
} from "./model.ts";
export { isBatchCapable } from "./model.ts";

// Registry
export type { RegistryOptions } from "./registry.ts";
export { Registry } from "./registry.ts";
