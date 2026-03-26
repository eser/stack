// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as types from "../types.ts";
import type * as generation from "../generation.ts";
import * as content from "../content.ts";

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

    const parts = message.content.map(mapContentBlockToGenAIPart);
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
// Response Mapping
// =============================================================================

export const mapGenAIResponseToResult = (
  // deno-lint-ignore no-explicit-any
  response: any,
  modelId: string,
): generation.GenerateTextResult => {
  const contentBlocks: types.ContentBlock[] = [];
  let stopReason: generation.StopReason = "end_turn";

  const candidates = response?.candidates ?? [];
  if (candidates.length > 0) {
    const candidate = candidates[0];
    const parts = candidate?.content?.parts ?? [];

    for (const part of parts) {
      if (part.text !== undefined) {
        contentBlocks.push({ kind: "text", text: part.text });
      }
      if (part.functionCall !== undefined) {
        contentBlocks.push({
          kind: "tool_call",
          toolCall: {
            id: part.functionCall.name,
            name: part.functionCall.name,
            arguments: part.functionCall.args ?? {},
          },
        });
        stopReason = "tool_use";
      }
    }

    const finishReason = candidate?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      stopReason = "max_tokens";
    } else if (finishReason === "STOP") {
      stopReason = "end_turn";
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

// =============================================================================
// Error Classification
// =============================================================================

export const classifyGenAIError = (
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
