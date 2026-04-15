// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// =============================================================================
// Roles
// =============================================================================

export type Role = "user" | "assistant" | "system" | "tool";

// =============================================================================
// Content Block Parts
// =============================================================================

export type ImageDetail = "low" | "high" | "auto";

export type ImagePart = {
  readonly url?: string;
  readonly data?: Uint8Array;
  readonly mimeType?: string;
  readonly detail?: ImageDetail;
};

export type AudioPart = {
  readonly url?: string;
  readonly data?: Uint8Array;
  readonly mimeType?: string;
};

export type FilePart = {
  readonly uri: string;
  readonly mimeType?: string;
};

export type ToolCall = {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
};

export type ToolResult = {
  readonly toolCallId: string;
  readonly content: string;
  readonly isError: boolean;
};

// =============================================================================
// Content Blocks (Discriminated Union)
// =============================================================================

export type TextBlock = {
  readonly kind: "text";
  readonly text: string;
};

export type ImageBlock = {
  readonly kind: "image";
  readonly image: ImagePart;
};

export type AudioBlock = {
  readonly kind: "audio";
  readonly audio: AudioPart;
};

export type FileBlock = {
  readonly kind: "file";
  readonly file: FilePart;
};

export type ToolCallBlock = {
  readonly kind: "tool_call";
  readonly toolCall: ToolCall;
};

export type ToolResultBlock = {
  readonly kind: "tool_result";
  readonly toolResult: ToolResult;
};

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | AudioBlock
  | FileBlock
  | ToolCallBlock
  | ToolResultBlock;

// =============================================================================
// Messages
// =============================================================================

export type Message = {
  readonly role: Role;
  readonly content: readonly ContentBlock[];
};

// =============================================================================
// Tool Definitions
// =============================================================================

export type ToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly parameters?: Record<string, unknown>;
};

// =============================================================================
// Provider Capabilities
// =============================================================================

export type ProviderCapability =
  | "text_generation"
  | "streaming"
  | "tool_calling"
  | "vision"
  | "audio"
  | "batch_processing"
  | "structured_output"
  | "reasoning";
