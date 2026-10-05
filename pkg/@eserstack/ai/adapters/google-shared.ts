// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as types from "../types.ts";
import type * as config from "../config.ts";
import * as generation from "../generation.ts";
import * as content from "../content.ts";
import * as errors from "../errors.ts";

// =============================================================================
// Role Mapping
// =============================================================================

export const mapRoleToGenAI = (role: types.Role): string => {
  if (role === "assistant") {
    return "model";
  }
  if (role === "tool") {
    return "user";
  }

  // "user" stays "user", "system" is handled separately
  return role;
};

// =============================================================================
// Content Block Mapping → genai Parts
// =============================================================================

export const mapContentBlockToGenAIPart = (
  block: types.ContentBlock,
): Record<string, unknown> => {
  switch (block.kind) {
    case "text": {
      return { text: block.text };
    }
    case "image": {
      if (block.image.data !== undefined) {
        return {
          inlineData: {
            mimeType: block.image.mimeType ?? "image/png",
            data: encodeBase64(block.image.data),
          },
        };
      }
      if (block.image.url !== undefined) {
        if (content.isDataUrl(block.image.url)) {
          const decoded = content.decodeDataUrl(block.image.url);
          if (decoded !== null) {
            return {
              inlineData: {
                mimeType: decoded.mimeType,
                data: encodeBase64(decoded.data),
              },
            };
          }
        }
        return {
          fileData: {
            mimeType: block.image.mimeType ??
              content.detectMimeFromUrl(block.image.url) ?? "image/png",
            fileUri: block.image.url,
          },
        };
      }
      return { text: "[unsupported image]" };
    }
    case "audio": {
      if (block.audio.data !== undefined) {
        return {
          inlineData: {
            mimeType: block.audio.mimeType ?? "audio/mpeg",
            data: encodeBase64(block.audio.data),
          },
        };
      }
      if (block.audio.url !== undefined) {
        return {
          fileData: {
            mimeType: block.audio.mimeType ??
              content.detectMimeFromUrl(block.audio.url) ?? "audio/mpeg",
            fileUri: block.audio.url,
          },
        };
      }
      return { text: "[unsupported audio]" };
    }
    case "file": {
      return {
        fileData: {
          mimeType: block.file.mimeType ?? "application/octet-stream",
          fileUri: block.file.uri,
        },
      };
    }
    case "tool_call": {
      return {
        functionCall: {
          name: block.toolCall.name,
          args: block.toolCall.arguments,
        },
      };
    }
    case "tool_result": {
      return {
        functionResponse: {
          name: block.toolResult.toolCallId,
          response: { content: block.toolResult.content },
        },
      };
    }
    case "thinking": {
      return { text: block.thinking.text, thought: true };
    }
  }
};

// =============================================================================
// Message Mapping
// =============================================================================

export const mapMessagesToGenAI = (
  messages: readonly types.Message[],
): {
  readonly contents: readonly Record<string, unknown>[];
  readonly systemInstruction: string | null;
} => {
  let systemInstruction: string | null = null;
  const contents: Record<string, unknown>[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      const textParts: string[] = [];
      for (const block of message.content) {
        if (block.kind === "text") {
          textParts.push(block.text);
        }
      }
      systemInstruction = textParts.join("\n");
      continue;
    }

    // Thinking blocks are left out: they come from a provider whose signature
    // Gemini cannot check, and Gemini replays its own reasoning differently.
    const parts = message.content
      .filter((block) => block.kind !== "thinking")
      .map(mapContentBlockToGenAIPart);
    contents.push({
      role: mapRoleToGenAI(message.role),
      parts,
    });
  }

  return { contents, systemInstruction };
};

// =============================================================================
// Tool Definition Mapping
// =============================================================================

export const mapToolsToGenAI = (
  tools: readonly types.ToolDefinition[],
): readonly Record<string, unknown>[] => {
  return tools.map((tool) => ({
    functionDeclarations: [{
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }],
  }));
};

// =============================================================================
// Request Building
// =============================================================================

/** The `contents` and `config` of a genai `generateContent` request. */
export type GenAIRequest = {
  readonly contents: readonly Record<string, unknown>[];
  readonly config: Readonly<Record<string, unknown>>;
};

/**
 * Maps an effort level to a Gemini thinking level. Gemini's levels stop at
 * `HIGH`, so `"xhigh"` and `"max"` send `HIGH`. The levels a model takes differ
 * per model (gemini-3-pro-preview has no `MEDIUM`) and are not checked here;
 * the API answers for the model, as on `openai`.
 *
 * @throws {errors.BadRequestError} when `effort` is not one of the five
 * levels, which a JavaScript caller can pass.
 */
export const mapEffortToThinkingLevel = (
  effort: generation.Effort,
  provider: string,
): string => {
  switch (effort) {
    case "low":
      return "LOW";
    case "medium":
      return "MEDIUM";
    case "high":
    case "xhigh":
    case "max":
      return "HIGH";
    default:
      throw new errors.BadRequestError(
        `unknown effort level ${
          JSON.stringify(effort)
        }; use low, medium, high, xhigh or max, or leave it unset for the provider default`,
        { provider },
      );
  }
};

/**
 * Builds the genai `generateContent` request of `gemini` and `vertexai`. The
 * SDK reads the system instruction, tools, safety settings and abort signal
 * from `config` only, and drops a field set next to it without an error.
 *
 * An explicit `effort` is sent as `thinkingConfig.thinkingLevel` and wins over
 * `thinkingBudget`, since the API rejects a request that sets both.
 *
 * @throws {errors.BadRequestError} when a `json_schema` response format has no
 * object schema, or `effort` is not a level.
 */
export const buildGenAIRequest = (
  cfg: config.ResolvedConfigTarget,
  options: generation.GenerateTextOptions,
  provider: string,
  signal: AbortSignal | undefined,
): GenAIRequest => {
  const { contents, systemInstruction } = mapMessagesToGenAI(options.messages);

  const requestConfig: Record<string, unknown> = {
    maxOutputTokens: options.maxTokens ?? cfg.maxTokens,
  };

  if (options.temperature !== undefined) {
    requestConfig["temperature"] = options.temperature;
  }

  if (options.topP !== undefined) {
    requestConfig["topP"] = options.topP;
  }

  if (options.stopWords !== undefined) {
    requestConfig["stopSequences"] = options.stopWords;
  }

  // As in Go: json_schema is sent as responseJsonSchema, which takes the
  // schema as is (the API takes one of it and responseSchema), json_object as
  // the JSON MIME type alone, and text as the plain text MIME type.
  switch (options.responseFormat?.type) {
    case "json_schema":
      requestConfig["responseMimeType"] = "application/json";
      requestConfig["responseJsonSchema"] = generation.requireJsonSchema(
        options.responseFormat,
        provider,
      );
      break;
    case "json_object":
      requestConfig["responseMimeType"] = "application/json";
      break;
    case "text":
      requestConfig["responseMimeType"] = "text/plain";
      break;
  }

  if (options.effort !== undefined) {
    requestConfig["thinkingConfig"] = {
      thinkingLevel: mapEffortToThinkingLevel(options.effort, provider),
    };
  } else if (options.thinkingBudget !== undefined) {
    requestConfig["thinkingConfig"] = {
      thinkingBudget: options.thinkingBudget,
    };
  }

  const system = options.system ?? systemInstruction;
  if (system !== null) {
    requestConfig["systemInstruction"] = system;
  }

  if (options.tools !== undefined) {
    requestConfig["tools"] = mapToolsToGenAI(options.tools);
  }

  if (options.safetySettings !== undefined) {
    requestConfig["safetySettings"] = options.safetySettings;
  }

  if (signal !== undefined) {
    requestConfig["abortSignal"] = signal;
  }

  return { contents, config: requestConfig };
};

// =============================================================================
// Response Mapping
// =============================================================================

/**
 * The finish reasons of the content filters: safety, blocklist, prohibited
 * content, personal data, recitation and their image variants. Each one
 * withholds the answer, so it maps to `"refusal"`.
 */
const FILTER_FINISH_REASONS: ReadonlySet<string> = new Set([
  "SAFETY",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "RECITATION",
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
  "IMAGE_RECITATION",
]);

/**
 * Maps a genai finishReason. Gemini ends a turn that called a tool with
 * `STOP`, so `calledTool` turns that into `"tool_use"`. Any other reason has no
 * closer match than `"stop"`.
 */
export const mapGenAIFinishReason = (
  finishReason: string,
  calledTool: boolean,
): generation.StopReason => {
  if (finishReason === "STOP") {
    return calledTool ? "tool_use" : "end_turn";
  }
  if (finishReason === "MAX_TOKENS") {
    return "max_tokens";
  }
  if (FILTER_FINISH_REASONS.has(finishReason)) {
    return "refusal";
  }

  return "stop";
};

/**
 * Reports whether a filter blocked the prompt itself. The response then has no
 * candidates and names the filter in `promptFeedback.blockReason`.
 */
export const isGenAIPromptBlocked = (
  // The response is untyped vendor JSON; only the mapped fields are read.
  // deno-lint-ignore no-explicit-any
  response: any,
): boolean => {
  const reason = response?.promptFeedback?.blockReason;

  return typeof reason === "string" && reason !== "" &&
    reason !== "BLOCKED_REASON_UNSPECIFIED";
};

/** Maps a genai part's function call to a tool call. */
const mapFunctionCall = (
  // The call is untyped vendor JSON; only the mapped fields are read.
  // deno-lint-ignore no-explicit-any
  functionCall: any,
): types.ToolCall => ({
  id: functionCall.name,
  name: functionCall.name,
  arguments: functionCall.args ?? {},
});

export const mapGenAIResponseToResult = (
  // The response is untyped vendor JSON; only the mapped fields are read.
  // deno-lint-ignore no-explicit-any
  response: any,
  modelId: string,
): generation.GenerateTextResult => {
  const contentBlocks: types.ContentBlock[] = [];
  let stopReason: generation.StopReason = "end_turn";

  const candidate = response?.candidates?.[0];
  if (candidate === undefined || candidate === null) {
    // A blocked prompt gets no candidates.
    if (isGenAIPromptBlocked(response)) {
      stopReason = "refusal";
    }
  } else {
    let calledTool = false;

    for (const part of candidate.content?.parts ?? []) {
      if (part.text !== undefined) {
        contentBlocks.push({ kind: "text", text: part.text });
      }
      if (part.functionCall !== undefined) {
        contentBlocks.push({
          kind: "tool_call",
          toolCall: mapFunctionCall(part.functionCall),
        });
        calledTool = true;
      }
    }

    const finishReason = candidate.finishReason;
    if (typeof finishReason === "string") {
      stopReason = mapGenAIFinishReason(finishReason, calledTool);
    } else if (calledTool) {
      stopReason = "tool_use";
    }
  }

  const usageMetadata = response?.usageMetadata;

  return {
    content: contentBlocks,
    stopReason,
    usage: {
      inputTokens: usageMetadata?.promptTokenCount ?? 0,
      outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: usageMetadata?.totalTokenCount ?? 0,
    },
    modelId,
    rawResponse: response,
  };
};

/**
 * Maps the chunks of a genai stream to stream events. A tool call is
 * remembered across chunks, since the chunk that ends the turn need not be the
 * one with the call. That chunk yields `message_done` even without content: a
 * filtered answer can arrive as a finish reason with no parts, and a blocked
 * prompt as a chunk with no candidates.
 */
export async function* mapGenAIStream(
  // The chunks are untyped vendor JSON; only the mapped fields are read.
  // deno-lint-ignore no-explicit-any
  stream: AsyncIterable<any>,
): AsyncIterable<generation.StreamEvent> {
  let inputTokens = 0;
  let outputTokens = 0;
  let calledTool = false;

  for await (const chunk of stream) {
    const candidate = chunk?.candidates?.[0];
    let stopReason: generation.StopReason | null = null;

    if (candidate === undefined || candidate === null) {
      if (isGenAIPromptBlocked(chunk)) {
        stopReason = "refusal";
      }
    } else {
      for (const part of candidate.content?.parts ?? []) {
        if (part.text !== undefined) {
          yield { kind: "content_delta", textDelta: part.text };
        }
        if (part.functionCall !== undefined) {
          calledTool = true;
          yield {
            kind: "tool_call_delta",
            toolCall: mapFunctionCall(part.functionCall),
          };
        }
      }

      const finishReason = candidate.finishReason;
      if (typeof finishReason === "string") {
        stopReason = mapGenAIFinishReason(finishReason, calledTool);
      }
    }

    if (stopReason !== null) {
      const usageMetadata = chunk?.usageMetadata;
      inputTokens = usageMetadata?.promptTokenCount ?? inputTokens;
      outputTokens = usageMetadata?.candidatesTokenCount ?? outputTokens;

      yield {
        kind: "message_done",
        stopReason,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
      };
    }
  }
}

// =============================================================================
// Error Classification
// =============================================================================

export const classifyGenAIError = (
  // SDK errors carry status or code fields with no exported type.
  // deno-lint-ignore no-explicit-any
  error: any,
): number => {
  if (error?.status !== undefined) {
    return error.status;
  }
  if (error?.code !== undefined) {
    return error.code;
  }

  return 500;
};

// =============================================================================
// Helpers
// =============================================================================

const encodeBase64 = (data: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }

  return btoa(binary);
};
