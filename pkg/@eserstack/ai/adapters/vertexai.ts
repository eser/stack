// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as results from "@eserstack/primitives/results";
import type * as types from "../types.ts";
import type * as config from "../config.ts";
import type * as generation from "../generation.ts";
import type * as model from "../model.ts";
import * as errors from "../errors.ts";
import * as googleShared from "./google-shared.ts";

// =============================================================================
// VertexAI Model
// =============================================================================

export class VertexAIModel implements model.LanguageModel {
  readonly capabilities: readonly types.ProviderCapability[] = [
    "text_generation",
    "streaming",
    "tool_calling",
    "vision",
    "audio",
    "structured_output",
    "reasoning",
  ];
  readonly provider = "vertexai";
  readonly modelId: string;

  // deno-lint-ignore no-explicit-any
  private readonly client: any;
  private readonly config: config.ResolvedConfigTarget;

  // deno-lint-ignore no-explicit-any
  constructor(client: any, cfg: config.ResolvedConfigTarget) {
    this.client = client;
    this.config = cfg;
    this.modelId = cfg.model;
  }

  async generateText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): Promise<results.Result<generation.GenerateTextResult, errors.AiError>> {
    const params = buildParams(this.config, options);

    try {
      const response = await this.client.models.generateContent({
        model: this.config.model,
        ...params,
        config: {
          ...(params["config"] as Record<string, unknown>),
          httpOptions: signal !== undefined ? { signal } : undefined,
        },
      });

      return results.ok(
        googleShared.mapGenAIResponseToResult(response, this.modelId),
      );
    } catch (err) {
      return results.fail(classifyError(err));
    }
  }

  async *streamText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent> {
    const params = buildParams(this.config, options);

    try {
      const stream = await this.client.models.generateContentStream({
        model: this.config.model,
        ...params,
        config: {
          ...(params["config"] as Record<string, unknown>),
          httpOptions: signal !== undefined ? { signal } : undefined,
        },
      });

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        const candidates = chunk?.candidates ?? [];

        if (candidates.length > 0) {
          const candidate = candidates[0];
          const parts = candidate?.content?.parts ?? [];

          for (const part of parts) {
            if (part.text !== undefined) {
              yield { kind: "content_delta", textDelta: part.text };
            }
            if (part.functionCall !== undefined) {
              yield {
                kind: "tool_call_delta",
                toolCall: {
                  id: part.functionCall.name,
                  name: part.functionCall.name,
                  arguments: part.functionCall.args ?? {},
                },
              };
            }
          }

          const finishReason = candidate?.finishReason;
          if (finishReason !== undefined && finishReason !== null) {
            const usageMetadata = chunk?.usageMetadata;
            inputTokens = usageMetadata?.promptTokenCount ?? inputTokens;
            outputTokens = usageMetadata?.candidatesTokenCount ?? outputTokens;

            let stopReason: generation.StopReason = "end_turn";
            if (finishReason === "MAX_TOKENS") {
              stopReason = "max_tokens";
            }

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
    } catch (err) {
      yield { kind: "error", error: classifyError(err) };
    }
  }

  async close(): Promise<void> {
    // VertexAI SDK doesn't require explicit cleanup
  }

  getRawClient(): unknown {
    return this.client;
  }
}

// =============================================================================
// Factory
// =============================================================================

export const vertexaiFactory: model.ProviderFactory = {
  provider: "vertexai",
  async createModel(
    cfg: config.ResolvedConfigTarget,
  ): Promise<model.LanguageModel> {
    const { GoogleGenAI } = await import("@google/genai");

    const clientOptions: Record<string, unknown> = {
      vertexai: true,
      project: cfg.projectId,
      location: cfg.location ?? "us-central1",
    };

    if (cfg.apiKey !== undefined) {
      clientOptions["apiKey"] = cfg.apiKey;
    }

    const client = new GoogleGenAI(clientOptions);

    return new VertexAIModel(client, cfg);
  },
};

// =============================================================================
// Internal Helpers
// =============================================================================

const buildParams = (
  cfg: config.ResolvedConfigTarget,
  options: generation.GenerateTextOptions,
): Record<string, unknown> => {
  const { contents, systemInstruction } = googleShared.mapMessagesToGenAI(
    options.messages,
  );

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: options.maxTokens ?? cfg.maxTokens,
  };

  if (options.temperature !== undefined) {
    generationConfig["temperature"] = options.temperature;
  }

  if (options.topP !== undefined) {
    generationConfig["topP"] = options.topP;
  }

  if (options.stopWords !== undefined) {
    generationConfig["stopSequences"] = options.stopWords;
  }

  if (
    options.responseFormat !== undefined &&
    options.responseFormat.type === "json_schema"
  ) {
    generationConfig["responseMimeType"] = "application/json";
    generationConfig["responseSchema"] = options.responseFormat.jsonSchema;
  }

  if (options.thinkingBudget !== undefined) {
    generationConfig["thinkingConfig"] = {
      thinkingBudget: options.thinkingBudget,
    };
  }

  const params: Record<string, unknown> = {
    contents,
    config: generationConfig,
  };

  const system = options.system ?? systemInstruction;
  if (system !== null && system !== undefined) {
    params["systemInstruction"] = system;
  }

  if (options.tools !== undefined) {
    params["tools"] = googleShared.mapToolsToGenAI(options.tools);
  }

  if (options.safetySettings !== undefined) {
    params["safetySettings"] = options.safetySettings;
  }

  return params;
};

const classifyError = (err: unknown): errors.AiError => {
  if (err instanceof errors.AiError) {
    return err;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  const statusCode = googleShared.classifyGenAIError(err);

  return errors.classifyAndWrap("vertexai", statusCode, error);
};
