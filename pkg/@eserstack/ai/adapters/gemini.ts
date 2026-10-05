// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as results from "@eserstack/primitives/results";
import type * as types from "../types.ts";
import type * as config from "../config.ts";
import type * as generation from "../generation.ts";
import type * as model from "../model.ts";
import * as errors from "../errors.ts";
import * as googleShared from "./google-shared.ts";

// =============================================================================
// Gemini Model
// =============================================================================

export class GeminiModel implements model.LanguageModel {
  readonly capabilities: readonly types.ProviderCapability[] = [
    "text_generation",
    "streaming",
    "tool_calling",
    "vision",
    "audio",
    "structured_output",
    "reasoning",
  ];
  readonly provider = "gemini";
  readonly modelId: string;

  // The SDK is loaded lazily by the factory; its client type is not in scope.
  // deno-lint-ignore no-explicit-any
  private readonly client: any;
  private readonly config: config.ResolvedConfigTarget;

  // Takes the lazily imported SDK client stored in the field above.
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
    try {
      const request = googleShared.buildGenAIRequest(
        this.config,
        options,
        this.provider,
        signal,
      );
      const response = await this.client.models.generateContent({
        model: this.config.model,
        ...request,
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
    try {
      const request = googleShared.buildGenAIRequest(
        this.config,
        options,
        this.provider,
        signal,
      );
      const stream = await this.client.models.generateContentStream({
        model: this.config.model,
        ...request,
      });

      yield* googleShared.mapGenAIStream(stream);
    } catch (err) {
      yield { kind: "error", error: classifyError(err) };
    }
  }

  async close(): Promise<void> {
    // Gemini SDK doesn't require explicit cleanup
  }

  getRawClient(): unknown {
    return this.client;
  }
}

// =============================================================================
// Factory
// =============================================================================

export const geminiFactory: model.ProviderFactory = {
  provider: "gemini",
  createModel: async (
    cfg: config.ResolvedConfigTarget,
  ): Promise<model.LanguageModel> => {
    const genai = await import("@google/genai");

    const client = new genai.GoogleGenAI({ apiKey: cfg.apiKey });

    return new GeminiModel(client, cfg);
  },
};

// =============================================================================
// Internal Helpers
// =============================================================================

const classifyError = (err: unknown): errors.AiError => {
  if (err instanceof errors.AiError) {
    return err;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  const statusCode = googleShared.classifyGenAIError(err);

  return errors.classifyAndWrap("gemini", statusCode, error);
};
