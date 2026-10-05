// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as results from "@eserstack/primitives/results";
import type * as types from "./types.ts";
import * as errors from "./errors.ts";

// =============================================================================
// Generation Options
// =============================================================================

export type ToolChoice = "auto" | "none" | "required";

/**
 * Why generation stopped.
 *
 * - `"refusal"`: the model declined the request, or a provider's content filter
 *   withheld the answer. The content, if any, explains the refusal or was cut
 *   off by the filter; it is not an answer.
 * - `"max_tokens"`: the reply was cut off, by the output token limit or, on
 *   `anthropic`, by a full context window.
 * - `"stop"`: a stop sequence, or a provider reason with no closer match.
 */
export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "tool_use"
  | "stop"
  | "refusal";

/**
 * Asks for a JSON reply. `"json_schema"` constrains it to `jsonSchema`,
 * `"json_object"` asks for any JSON object, and `"text"` for plain text.
 *
 * On `anthropic`, `"json_schema"` is sent as `output_config.format`, and on
 * `claude-code` as the CLI's `--json-schema` flag; both need a `jsonSchema`.
 * Claude has no JSON mode without a schema, so both ignore `"json_object"` and
 * `"text"`, and neither has a field for `name`.
 */
export type ResponseFormat = {
  readonly type: "json_schema" | "json_object" | "text";
  readonly name?: string;
  readonly jsonSchema?: Record<string, unknown>;
};

/**
 * Returns the schema of a `json_schema` response format, for an adapter that
 * sends it. A missing or non-object schema fails before any request is sent,
 * since the provider would reject it with a less specific message or answer
 * without it. Not part of the package API.
 *
 * @throws {errors.BadRequestError} when `jsonSchema` is missing or is not an
 * object.
 */
export const requireJsonSchema = (
  responseFormat: ResponseFormat,
  provider: string,
): Record<string, unknown> => {
  const schema: unknown = responseFormat.jsonSchema;

  if (schema === undefined) {
    throw new errors.BadRequestError(
      'response format "json_schema" has no jsonSchema; set jsonSchema to a JSON Schema object',
      { provider },
    );
  }

  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    throw new errors.BadRequestError(
      'response format "json_schema" has a jsonSchema that is not an object; set jsonSchema to a JSON Schema object',
      { provider },
    );
  }

  return schema as Record<string, unknown>;
};

/**
 * How much the model thinks and how many tokens it spends on a reply. Lower
 * effort answers faster and cheaper. Leave it unset for the provider default.
 *
 * - `anthropic`: sent as `output_config.effort`.
 * - `openai`: sent as `reasoning_effort`; a model that lacks the level rejects
 *   the request.
 * - `claude-code`: sent as the CLI's `--effort` flag.
 * - `gemini`, `vertexai`: sent as `thinkingConfig.thinkingLevel`, unchecked
 *   against the levels the model takes; `"xhigh"` and `"max"` send `HIGH`,
 *   Gemini's highest level.
 * - `ollama`, `opencode`, `kiro`: ignored.
 */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

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
  /**
   * Overrides the effort level that `thinkingBudget` maps to. On `gemini` and
   * `vertexai`, the budget is then left out of the request.
   */
  readonly effort?: Effort;
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

/**
 * One finished thinking block. A streamed answer replays it in the next
 * request like a generated one; it is never part of the answer text.
 */
export type ThinkingEvent = {
  readonly kind: "thinking";
  readonly thinking: types.ThinkingPart;
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
  | ThinkingEvent
  | MessageDoneEvent
  | StreamErrorEvent;

// =============================================================================
// Stream Collector
// =============================================================================

/**
 * Collects a stream into one result. Blocks come out in the order the provider
 * produced them: thinking, then text, then tool calls. Anthropic rejects a
 * replayed assistant turn whose tool calls are not preceded by their thinking.
 */
export const collectStream = async (
  stream: AsyncIterable<StreamEvent>,
  modelId: string = "unknown",
): Promise<GenerateTextResult> => {
  const thinkingBlocks: types.ThinkingBlock[] = [];
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
      case "thinking": {
        thinkingBlocks.push({ kind: "thinking", thinking: event.thinking });
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
    content: [...thinkingBlocks, ...contentBlocks],
    stopReason,
    usage,
    modelId,
  };
};
