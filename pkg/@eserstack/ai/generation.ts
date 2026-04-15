// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as results from "@eserstack/primitives/results";
import type * as types from "./types.ts";
import type * as errors from "./errors.ts";

// =============================================================================
// Generation Options
// =============================================================================

export type ToolChoice = "auto" | "none" | "required";

export type StopReason = "end_turn" | "max_tokens" | "tool_use" | "stop";

export type ResponseFormat = {
  readonly type: "json_schema" | "json_object" | "text";
  readonly name?: string;
  readonly jsonSchema?: Record<string, unknown>;
};

export type SafetySetting = {
  readonly category: string;
  readonly threshold: string;
};

export type GenerateTextOptions = {
  readonly messages: readonly types.Message[];
  readonly tools?: readonly types.ToolDefinition[];
  readonly system?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly stopWords?: readonly string[];
  readonly toolChoice?: ToolChoice;
  readonly responseFormat?: ResponseFormat;
  readonly thinkingBudget?: number;
  readonly safetySettings?: readonly SafetySetting[];
  readonly extensions?: Record<string, unknown>;
};

// =============================================================================
// Usage
// =============================================================================

export type Usage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly thinkingTokens?: number;
};

// =============================================================================
// Generation Result
// =============================================================================

export type GenerateTextResult = {
  readonly content: readonly types.ContentBlock[];
  readonly stopReason: StopReason;
  readonly usage: Usage;
  readonly modelId: string;
  readonly rawRequest?: unknown;
  readonly rawResponse?: unknown;
};

// =============================================================================
// Result Helpers
// =============================================================================

export const text = (result: GenerateTextResult): string => {
  const textParts: string[] = [];

  for (const block of result.content) {
    if (block.kind === "text") {
      textParts.push(block.text);
    }
  }

  return textParts.join("");
};

export const textResult = (
  result: results.Result<GenerateTextResult, errors.AiError>,
): results.Result<string, errors.AiError> => {
  return results.map(result, text);
};

export const toolCalls = (
  result: GenerateTextResult,
): readonly types.ToolCall[] => {
  const calls: types.ToolCall[] = [];

  for (const block of result.content) {
    if (block.kind === "tool_call") {
      calls.push(block.toolCall);
    }
  }

  return calls;
};

// =============================================================================
// Stream Events (Discriminated Union)
// =============================================================================

export type ContentDeltaEvent = {
  readonly kind: "content_delta";
  readonly textDelta: string;
};

export type ToolCallDeltaEvent = {
  readonly kind: "tool_call_delta";
  readonly textDelta?: string;
  readonly toolCall?: types.ToolCall;
};

export type MessageDoneEvent = {
  readonly kind: "message_done";
  readonly stopReason: StopReason;
  readonly usage: Usage;
};

export type StreamErrorEvent = {
  readonly kind: "error";
  readonly error: Error;
};

export type StreamEvent =
  | ContentDeltaEvent
  | ToolCallDeltaEvent
  | MessageDoneEvent
  | StreamErrorEvent;

// =============================================================================
// Stream Collector
// =============================================================================

export const collectStream = async (
  stream: AsyncIterable<StreamEvent>,
  modelId: string = "unknown",
): Promise<GenerateTextResult> => {
  const contentBlocks: types.ContentBlock[] = [];
  let accumulatedText = "";
  let stopReason: StopReason = "end_turn";
  let usage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  for await (const event of stream) {
    switch (event.kind) {
      case "content_delta": {
        accumulatedText += event.textDelta;
        break;
      }
      case "tool_call_delta": {
        if (event.toolCall !== undefined) {
          contentBlocks.push({ kind: "tool_call", toolCall: event.toolCall });
        }
        break;
      }
      case "message_done": {
        stopReason = event.stopReason;
        usage = event.usage;
        break;
      }
      case "error": {
        throw event.error;
      }
    }
  }

  if (accumulatedText.length > 0) {
    contentBlocks.unshift({ kind: "text", text: accumulatedText });
  }

  return {
    content: contentBlocks,
    stopReason,
    usage,
    modelId,
  };
};
