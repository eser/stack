// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as types from "../types.ts";
import type * as config from "../config.ts";
import type * as generation from "../generation.ts";
import type * as batch from "../batch.ts";
import type * as model from "../model.ts";
import * as content from "../content.ts";
import * as errors from "../errors.ts";

// =============================================================================
// Anthropic Model
// =============================================================================

export class AnthropicModel
  implements model.LanguageModel, model.BatchCapableModel {
  readonly capabilities: readonly types.ProviderCapability[] = [
    "text_generation",
    "streaming",
    "tool_calling",
    "vision",
    "batch_processing",
  ];
  readonly provider = "anthropic";
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
  ): Promise<generation.GenerateTextResult> {
    const params = buildParams(this.config, options);

    try {
      const response = await this.client.messages.create(params, {
        signal,
        timeout: this.config.requestTimeoutMs,
      });

      return mapResponse(response, this.modelId);
    } catch (err) {
      throw classifyError(err);
    }
  }

  async *streamText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent> {
    const params = buildParams(this.config, options);

    try {
      const stream = await this.client.messages.create(
        { ...params, stream: true },
        { signal, timeout: this.config.requestTimeoutMs },
      );

      let currentToolCallId: string | null = null;
      let currentToolCallName: string | null = null;
      let currentToolCallArgs = "";
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const event of stream) {
        if (event.type === "message_start") {
          inputTokens = event.message?.usage?.input_tokens ?? 0;
        } else if (event.type === "content_block_start") {
          if (event.content_block?.type === "tool_use") {
            currentToolCallId = event.content_block.id ?? null;
            currentToolCallName = event.content_block.name ?? null;
            currentToolCallArgs = "";
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta?.type === "text_delta") {
            yield { kind: "content_delta", textDelta: event.delta.text };
          } else if (event.delta?.type === "input_json_delta") {
            currentToolCallArgs += event.delta.partial_json ?? "";
            yield {
              kind: "tool_call_delta",
              textDelta: event.delta.partial_json,
            };
          }
        } else if (event.type === "content_block_stop") {
          if (currentToolCallId !== null && currentToolCallName !== null) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(currentToolCallArgs || "{}");
            } catch {
              // Keep empty args on parse failure
            }
            yield {
              kind: "tool_call_delta",
              toolCall: {
                id: currentToolCallId,
                name: currentToolCallName,
                arguments: args,
              },
            };
            currentToolCallId = null;
            currentToolCallName = null;
            currentToolCallArgs = "";
          }
        } else if (event.type === "message_delta") {
          outputTokens = event.usage?.output_tokens ?? outputTokens;
          const stopReason = mapStopReason(event.delta?.stop_reason);
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
    } catch (err) {
      yield { kind: "error", error: classifyError(err) };
    }
  }

  async submitBatch(
    request: batch.BatchRequest,
    signal?: AbortSignal,
  ): Promise<batch.BatchJob> {
    const requests = request.items.map((item) => ({
      custom_id: item.customId,
      params: buildParams(this.config, item.options),
    }));

    try {
      const result = await this.client.beta.messages.batches.create(
        { requests },
        { signal },
      );

      return mapBatchJob(result);
    } catch (err) {
      throw classifyError(err);
    }
  }

  async getBatchJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<batch.BatchJob> {
    try {
      const result = await this.client.beta.messages.batches.retrieve(
        jobId,
        { signal },
      );

      return mapBatchJob(result);
    } catch (err) {
      throw classifyError(err);
    }
  }

  async listBatchJobs(
    options?: batch.ListBatchOptions,
    signal?: AbortSignal,
  ): Promise<readonly batch.BatchJob[]> {
    try {
      const result = await this.client.beta.messages.batches.list(
        {
          limit: options?.limit,
          after_id: options?.after,
        },
        { signal },
      );

      const jobs: batch.BatchJob[] = [];
      for (const item of result.data ?? []) {
        jobs.push(mapBatchJob(item));
      }

      return jobs;
    } catch (err) {
      throw classifyError(err);
    }
  }

  async downloadBatchResults(
    job: batch.BatchJob,
    signal?: AbortSignal,
  ): Promise<readonly batch.BatchResult[]> {
    try {
      const results = await this.client.beta.messages.batches.results(
        job.id,
        { signal },
      );

      const batchResults: batch.BatchResult[] = [];
      for await (const item of results) {
        if (item.result?.type === "succeeded") {
          batchResults.push({
            customId: item.custom_id,
            result: mapResponse(item.result.message, this.modelId),
          });
        } else {
          batchResults.push({
            customId: item.custom_id,
            error: item.result?.error?.message ?? "Unknown error",
          });
        }
      }

      return batchResults;
    } catch (err) {
      throw classifyError(err);
    }
  }

  async cancelBatchJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.client.beta.messages.batches.cancel(jobId, { signal });
    } catch (err) {
      throw classifyError(err);
    }
  }

  async close(): Promise<void> {
    // Anthropic SDK doesn't require explicit cleanup
  }

  getRawClient(): unknown {
    return this.client;
  }
}

// =============================================================================
// Factory
// =============================================================================

export const anthropicFactory: model.ProviderFactory = {
  provider: "anthropic",
  async createModel(
    cfg: config.ResolvedConfigTarget,
  ): Promise<model.LanguageModel> {
    // Dynamic import to avoid loading SDK when not needed
    const { default: Anthropic } = await import("@anthropic-ai/sdk");

    const clientOptions: Record<string, unknown> = {};

    if (cfg.apiKey !== undefined) {
      clientOptions["apiKey"] = cfg.apiKey;
    }
    if (cfg.baseUrl !== undefined) {
      clientOptions["baseURL"] = cfg.baseUrl;
    }

    const client = new Anthropic(clientOptions);

    return new AnthropicModel(client, cfg);
  },
};

// =============================================================================
// Internal Helpers
// =============================================================================

const buildParams = (
  cfg: config.ResolvedConfigTarget,
  options: generation.GenerateTextOptions,
): Record<string, unknown> => {
  const params: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: options.maxTokens ?? cfg.maxTokens,
    messages: mapMessages(options.messages),
  };

  if (options.system !== undefined) {
    params["system"] = options.system;
  }

  if (options.temperature !== undefined) {
    params["temperature"] = options.temperature;
  }

  if (options.topP !== undefined) {
    params["top_p"] = options.topP;
  }

  if (options.stopWords !== undefined) {
    params["stop_sequences"] = options.stopWords;
  }

  if (options.tools !== undefined) {
    params["tools"] = options.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters ?? { type: "object", properties: {} },
    }));
  }

  if (options.toolChoice !== undefined) {
    params["tool_choice"] = { type: options.toolChoice };
  }

  if (options.thinkingBudget !== undefined) {
    params["thinking"] = {
      type: "enabled",
      budget_tokens: options.thinkingBudget,
    };
  }

  return params;
};

const mapMessages = (
  messages: readonly types.Message[],
): readonly Record<string, unknown>[] => {
  const result: Record<string, unknown>[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      continue; // System messages handled separately in params
    }

    const contentParts = message.content.map(mapContentBlock);
    result.push({
      role: message.role === "tool" ? "user" : message.role,
      content: contentParts,
    });
  }

  return result;
};

const mapContentBlock = (
  block: types.ContentBlock,
): Record<string, unknown> => {
  switch (block.kind) {
    case "text": {
      return { type: "text", text: block.text };
    }
    case "image": {
      if (block.image.data !== undefined) {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: block.image.mimeType ?? "image/png",
            data: encodeBase64(block.image.data),
          },
        };
      }
      if (block.image.url !== undefined) {
        if (content.isDataUrl(block.image.url)) {
          const decoded = content.decodeDataUrl(block.image.url);
          if (decoded !== null) {
            return {
              type: "image",
              source: {
                type: "base64",
                media_type: decoded.mimeType,
                data: encodeBase64(decoded.data),
              },
            };
          }
        }
        return {
          type: "image",
          source: { type: "url", url: block.image.url },
        };
      }
      return { type: "text", text: "[unsupported image]" };
    }
    case "tool_call": {
      return {
        type: "tool_use",
        id: block.toolCall.id,
        name: block.toolCall.name,
        input: block.toolCall.arguments,
      };
    }
    case "tool_result": {
      return {
        type: "tool_result",
        tool_use_id: block.toolResult.toolCallId,
        content: block.toolResult.content,
        is_error: block.toolResult.isError,
      };
    }
    default: {
      return {
        type: "text",
        text: `[unsupported content: ${(block as types.ContentBlock).kind}]`,
      };
    }
  }
};

const mapResponse = (
  // deno-lint-ignore no-explicit-any
  response: any,
  modelId: string,
): generation.GenerateTextResult => {
  const contentBlocks: types.ContentBlock[] = [];

  for (const block of response.content ?? []) {
    if (block.type === "text") {
      contentBlocks.push({ kind: "text", text: block.text });
    } else if (block.type === "thinking") {
      contentBlocks.push({
        kind: "text",
        text: `[thinking] ${block.thinking}`,
      });
    } else if (block.type === "tool_use") {
      contentBlocks.push({
        kind: "tool_call",
        toolCall: {
          id: block.id,
          name: block.name,
          arguments: block.input ?? {},
        },
      });
    }
  }

  return {
    content: contentBlocks,
    stopReason: mapStopReason(response.stop_reason),
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens: (response.usage?.input_tokens ?? 0) +
        (response.usage?.output_tokens ?? 0),
    },
    modelId,
    rawResponse: response,
  };
};

const mapStopReason = (
  reason: string | null | undefined,
): generation.StopReason => {
  if (reason === "end_turn") {
    return "end_turn";
  }
  if (reason === "max_tokens") {
    return "max_tokens";
  }
  if (reason === "tool_use") {
    return "tool_use";
  }
  if (reason === "stop_sequence") {
    return "stop";
  }

  return "end_turn";
};

// deno-lint-ignore no-explicit-any
const mapBatchJob = (result: any): batch.BatchJob => {
  return {
    id: result.id,
    status: mapBatchStatus(result.processing_status),
    createdAt: new Date(result.created_at),
    completedAt: result.ended_at !== undefined
      ? new Date(result.ended_at)
      : undefined,
    totalCount: result.request_counts?.total ?? 0,
    doneCount: result.request_counts?.succeeded ?? 0,
    failedCount: result.request_counts?.errored ?? 0,
  };
};

const mapBatchStatus = (status: string): batch.BatchStatus => {
  if (status === "in_progress") {
    return "processing";
  }
  if (status === "ended") {
    return "completed";
  }
  if (status === "canceling" || status === "canceled") {
    return "cancelled";
  }

  return "pending";
};

const classifyError = (err: unknown): errors.AiError => {
  if (err instanceof errors.AiError) {
    return err;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  // deno-lint-ignore no-explicit-any
  const statusCode = (err as any)?.status ?? (err as any)?.statusCode ?? 500;

  return errors.classifyAndWrap("anthropic", statusCode, error);
};

const encodeBase64 = (data: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }

  return btoa(binary);
};
