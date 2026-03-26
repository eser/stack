// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as types from "../types.ts";
import type * as config from "../config.ts";
import type * as generation from "../generation.ts";
import type * as model from "../model.ts";
import * as errors from "../errors.ts";
import * as cliShared from "./cli-shared.ts";

// =============================================================================
// Ollama Model (HTTP API)
// =============================================================================

const DEFAULT_BASE_URL = "http://localhost:11434";

export class OllamaModel implements model.LanguageModel {
  readonly capabilities: readonly types.ProviderCapability[] = [
    "text_generation",
    "streaming",
    "vision",
  ];
  readonly provider = "ollama";
  readonly modelId: string;

  private readonly baseUrl: string;
  private readonly config: config.ResolvedConfigTarget;

  constructor(baseUrl: string, cfg: config.ResolvedConfigTarget) {
    this.baseUrl = baseUrl;
    this.config = cfg;
    this.modelId = cfg.model;
  }

  async generateText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): Promise<generation.GenerateTextResult> {
    const body = buildChatBody(this.config, options, false);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw await classifyHttpError(response);
      }

      const result = await response.json();

      return mapChatResponse(result, this.modelId);
    } catch (err) {
      if (err instanceof errors.AiError) {
        throw err;
      }
      throw new errors.AiError(
        err instanceof Error ? err.message : String(err),
        { provider: "ollama", cause: err instanceof Error ? err : undefined },
      );
    }
  }

  async *streamText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent> {
    const body = buildChatBody(this.config, options, true);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        yield { kind: "error", error: await classifyHttpError(response) };

        return;
      }

      if (response.body === null) {
        yield {
          kind: "error",
          error: new errors.AiError("No response body", { provider: "ollama" }),
        };

        return;
      }

      for await (const event of cliShared.parseJsonlStream(response.body)) {
        const streamEvent = mapStreamEvent(event);

        if (streamEvent !== null) {
          yield streamEvent;
        }
      }
    } catch (err) {
      if (err instanceof errors.AiError) {
        yield { kind: "error", error: err };
      } else {
        yield {
          kind: "error",
          error: new errors.AiError(
            err instanceof Error ? err.message : String(err),
            {
              provider: "ollama",
              cause: err instanceof Error ? err : undefined,
            },
          ),
        };
      }
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  getRawClient(): unknown {
    return null;
  }
}

// =============================================================================
// Factory
// =============================================================================

export const ollamaFactory: model.ProviderFactory = {
  provider: "ollama",
  createModel(
    cfg: config.ResolvedConfigTarget,
  ): Promise<model.LanguageModel> {
    const baseUrl = (cfg.properties?.["baseUrl"] as string | undefined) ??
      DEFAULT_BASE_URL;

    return Promise.resolve(new OllamaModel(baseUrl, cfg));
  },
};

// =============================================================================
// Internal Helpers
// =============================================================================

const buildChatBody = (
  cfg: config.ResolvedConfigTarget,
  options: generation.GenerateTextOptions,
  stream: boolean,
): Record<string, unknown> => {
  const messages = mapMessages(options.messages, options.system);

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    stream,
  };

  const ollamaOptions: Record<string, unknown> = {};

  if (options.temperature !== undefined) {
    ollamaOptions["temperature"] = options.temperature;
  }

  if (options.maxTokens !== undefined) {
    ollamaOptions["num_predict"] = options.maxTokens;
  }

  if (options.topP !== undefined) {
    ollamaOptions["top_p"] = options.topP;
  }

  if (options.stopWords !== undefined) {
    ollamaOptions["stop"] = options.stopWords;
  }

  if (Object.keys(ollamaOptions).length > 0) {
    body["options"] = ollamaOptions;
  }

  if (options.responseFormat !== undefined) {
    if (options.responseFormat.type === "json_schema") {
      body["format"] = options.responseFormat.jsonSchema;
    } else if (options.responseFormat.type === "json_object") {
      body["format"] = "json";
    }
  }

  return body;
};

const mapMessages = (
  messages: readonly types.Message[],
  system?: string,
): readonly Record<string, unknown>[] => {
  const result: Record<string, unknown>[] = [];

  if (system !== undefined) {
    result.push({ role: "system", content: system });
  }

  for (const message of messages) {
    if (message.role === "system") {
      const textParts: string[] = [];

      for (const block of message.content) {
        if (block.kind === "text") {
          textParts.push(block.text);
        }
      }

      result.push({ role: "system", content: textParts.join("\n") });
      continue;
    }

    const textParts: string[] = [];
    const images: string[] = [];

    for (const block of message.content) {
      if (block.kind === "text") {
        textParts.push(block.text);
      } else if (block.kind === "image") {
        if (block.image.url !== undefined) {
          images.push(block.image.url);
        }
      }
    }

    const msg: Record<string, unknown> = {
      role: message.role === "tool" ? "user" : message.role,
      content: textParts.join("\n"),
    };

    if (images.length > 0) {
      msg["images"] = images;
    }

    result.push(msg);
  }

  return result;
};

const mapChatResponse = (
  // deno-lint-ignore no-explicit-any
  result: any,
  modelId: string,
): generation.GenerateTextResult => {
  const contentBlocks: types.ContentBlock[] = [];

  if (result.message?.content !== undefined) {
    contentBlocks.push({ kind: "text", text: result.message.content });
  }

  return {
    content: contentBlocks,
    stopReason: result.done_reason === "length" ? "max_tokens" : "end_turn",
    usage: {
      inputTokens: result.prompt_eval_count ?? 0,
      outputTokens: result.eval_count ?? 0,
      totalTokens: (result.prompt_eval_count ?? 0) + (result.eval_count ?? 0),
    },
    modelId,
    rawResponse: result,
  };
};

const mapStreamEvent = (
  event: unknown,
): generation.StreamEvent | null => {
  if (event === null || typeof event !== "object") {
    return null;
  }

  // deno-lint-ignore no-explicit-any
  const obj = event as any;

  if (obj.done === true) {
    return {
      kind: "message_done",
      stopReason: obj.done_reason === "length" ? "max_tokens" : "end_turn",
      usage: {
        inputTokens: obj.prompt_eval_count ?? 0,
        outputTokens: obj.eval_count ?? 0,
        totalTokens: (obj.prompt_eval_count ?? 0) + (obj.eval_count ?? 0),
      },
    };
  }

  if (obj.message?.content !== undefined && obj.message.content.length > 0) {
    return { kind: "content_delta", textDelta: obj.message.content };
  }

  // Legacy /api/generate format
  if (obj.response !== undefined && obj.response.length > 0) {
    return { kind: "content_delta", textDelta: obj.response };
  }

  return null;
};

const classifyHttpError = async (
  response: Response,
): Promise<errors.AiError> => {
  let message: string;

  try {
    const body = await response.json();
    message = body.error ?? `Ollama HTTP ${response.status}`;
  } catch {
    message = `Ollama HTTP ${response.status}: ${response.statusText}`;
  }

  return errors.classifyAndWrap("ollama", response.status, new Error(message));
};
