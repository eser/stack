// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as results from "@eserstack/primitives/results";
import type * as types from "../types.ts";
import type * as config from "../config.ts";
import * as generation from "../generation.ts";
import type * as batch from "../batch.ts";
import type * as model from "../model.ts";
import * as content from "../content.ts";
import * as errors from "../errors.ts";

// =============================================================================
// Anthropic Model
// =============================================================================

export class AnthropicModel
  implements model.LanguageModel, model.BatchCapableModel
{
  readonly capabilities: readonly types.ProviderCapability[] = [
    "text_generation",
    "streaming",
    "tool_calling",
    "vision",
    "batch_processing",
    "structured_output",
    // A thinking budget turns on adaptive thinking, and the reply carries the
    // thinking blocks.
    "reasoning",
  ];
  readonly provider = "anthropic";
  readonly modelId: string;

  // The SDK is loaded lazily by the factory; its client type is not in scope.
  // oxlint-disable-next-line typescript/no-explicit-any
  private readonly client: any;
  private readonly config: config.ResolvedConfigTarget;

  // Takes the lazily imported SDK client stored in the field above.
  // oxlint-disable-next-line typescript/no-explicit-any
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
      const params = buildParams(this.config, options);
      const response = await this.client.messages.create(params, {
        signal,
        timeout: this.config.requestTimeoutMs,
      });

      return results.ok(mapResponse(response, this.modelId));
    } catch (err) {
      return results.fail(classifyError(err));
    }
  }

  async *streamText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent> {
    try {
      const params = buildParams(this.config, options);
      const stream = await this.client.messages.create(
        { ...params, stream: true },
        { signal, timeout: this.config.requestTimeoutMs },
      );

      let currentToolCallId: string | null = null;
      let currentToolCallName: string | null = null;
      let currentToolCallArgs = "";
      // A thinking block's text and signature arrive in separate deltas; the
      // block is yielded whole at its stop, since only the finished block can
      // be replayed.
      let currentThinking: ThinkingDraft | null = null;
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
          } else {
            const started = toThinkingPart(event.content_block);
            currentThinking =
              started === null
                ? null
                : {
                    text: started.text,
                    signature: started.signature ?? "",
                    redactedData: started.redactedData ?? null,
                  };
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
          } else if (
            event.delta?.type === "thinking_delta" &&
            currentThinking !== null
          ) {
            currentThinking.text += event.delta.thinking ?? "";
          } else if (
            event.delta?.type === "signature_delta" &&
            currentThinking !== null
          ) {
            currentThinking.signature += event.delta.signature ?? "";
          }
        } else if (event.type === "content_block_stop") {
          if (currentThinking !== null) {
            yield {
              kind: "thinking",
              thinking: finishThinking(currentThinking),
            };
            currentThinking = null;
          }
          if (currentToolCallId !== null && currentToolCallName !== null) {
            let args: Record<string, unknown> = {};
            if (currentToolCallArgs !== "") {
              try {
                args = JSON.parse(currentToolCallArgs);
              } catch {
                // Keep empty args on parse failure
              }
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
    try {
      const requests = request.items.map((item) => ({
        custom_id: item.customId,
        params: buildParams(this.config, item.options),
      }));
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
      const result = await this.client.beta.messages.batches.retrieve(jobId, {
        signal,
      });

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
      const results = await this.client.beta.messages.batches.results(job.id, {
        signal,
      });

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

  async cancelBatchJob(jobId: string, signal?: AbortSignal): Promise<void> {
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
  createModel: async (
    cfg: config.ResolvedConfigTarget,
  ): Promise<model.LanguageModel> => {
    // Dynamic import to avoid loading SDK when not needed
    const anthropicSdk = await import("@anthropic-ai/sdk");

    const clientOptions: Record<string, unknown> = {};

    if (cfg.apiKey !== undefined) {
      clientOptions["apiKey"] = cfg.apiKey;
    }
    if (cfg.baseUrl !== undefined) {
      clientOptions["baseURL"] = cfg.baseUrl;
    }

    const client = new anthropicSdk.Anthropic(clientOptions);

    return new AnthropicModel(client, cfg);
  },
};

// =============================================================================
// Internal Helpers
// =============================================================================

const LOW_EFFORT_MAX_BUDGET = 1_000;
const HIGH_EFFORT_MIN_BUDGET = 10_000;

const mapEffort = (budget: number): generation.Effort => {
  if (budget <= LOW_EFFORT_MAX_BUDGET) return "low";
  if (budget >= HIGH_EFFORT_MIN_BUDGET) return "high";
  return "medium";
};

const buildParams = (
  cfg: config.ResolvedConfigTarget,
  options: generation.GenerateTextOptions,
): Record<string, unknown> => {
  // Keys follow the Anthropic Messages API request body.
  const params: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: options.maxTokens ?? cfg.maxTokens,
    messages: mapMessages(options.messages),
  };

  if (options.system !== undefined) {
    params["system"] = options.system;
  }

  // temperature and topP are not sent: Claude 4.7+ and the Claude 5 models
  // reject non-default sampling parameters.

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
    // Anthropic names the forced choice "any"; "required" is rejected.
    params["tool_choice"] = {
      type: options.toolChoice === "required" ? "any" : options.toolChoice,
    };
  }

  if (options.thinkingBudget !== undefined) {
    // A fixed thinking budget returns a 400 on Claude 4.7+ and the Claude 5
    // models; the budget maps to an effort level instead.
    params["thinking"] = { type: "adaptive" };
  }

  // An explicit effort wins over the level the budget maps to. With neither,
  // nothing is sent and the model's default applies.
  const effort =
    options.effort ??
    (options.thinkingBudget === undefined
      ? undefined
      : mapEffort(options.thinkingBudget));
  const format = mapResponseFormat(options.responseFormat);

  // Effort and format share one output_config object.
  const outputConfig: Record<string, unknown> = {};
  if (effort !== undefined) {
    outputConfig["effort"] = effort;
  }
  if (format !== null) {
    outputConfig["format"] = format;
  }
  if (Object.keys(outputConfig).length > 0) {
    params["output_config"] = outputConfig;
  }

  return params;
};

/**
 * Maps a json_schema response format to `output_config.format`. Claude has no
 * JSON mode without a schema, so `json_object` and `text` map to null and the
 * prompt alone decides the shape of the reply. The format's `name` has no field
 * in the API and is not sent.
 *
 * @throws {errors.BadRequestError} for `json_schema` without an object
 * `jsonSchema`.
 */
const mapResponseFormat = (
  responseFormat: generation.ResponseFormat | undefined,
): Record<string, unknown> | null => {
  if (responseFormat?.type !== "json_schema") {
    return null;
  }

  return {
    type: "json_schema",
    schema: generation.requireJsonSchema(responseFormat, "anthropic"),
  };
};

const mapMessages = (
  messages: readonly types.Message[],
): readonly Record<string, unknown>[] => {
  const result: Record<string, unknown>[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      continue; // System messages handled separately in params
    }

    const contentParts: Record<string, unknown>[] = [];
    for (const block of message.content) {
      const part = mapContentBlock(block);
      if (part !== null) {
        contentParts.push(part);
      }
    }

    result.push({
      role: message.role === "tool" ? "user" : message.role,
      content: contentParts,
    });
  }

  return result;
};

/**
 * Maps one block to the Messages API. Returns null for a block the request
 * must leave out: a thinking block with neither a signature nor redacted data,
 * such as one another provider produced, cannot pass the API's check.
 */
const mapContentBlock = (
  block: types.ContentBlock,
): Record<string, unknown> | null => {
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
    case "thinking": {
      // Replayed exactly as the API returned it; the API checks the signature
      // or the redacted data, so an empty one counts as missing (as in aifx).
      const { redactedData, signature } = block.thinking;
      if (redactedData !== undefined && redactedData !== "") {
        return { type: "redacted_thinking", data: redactedData };
      }
      if (signature === undefined || signature === "") {
        return null;
      }
      return {
        type: "thinking",
        thinking: block.thinking.text,
        signature,
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
  // The response is untyped vendor JSON; only the mapped fields are read.
  // oxlint-disable-next-line typescript/no-explicit-any
  response: any,
  modelId: string,
): generation.GenerateTextResult => {
  const contentBlocks: types.ContentBlock[] = [];

  for (const block of response.content ?? []) {
    const thinking = toThinkingPart(block);

    if (block.type === "text") {
      contentBlocks.push({ kind: "text", text: block.text });
    } else if (thinking !== null) {
      // Kept as its own kind, never as text, and kept when the text is empty
      // (Claude 5 omits it by default): a tool-use loop must send the
      // signature back.
      contentBlocks.push({ kind: "thinking", thinking });
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
      totalTokens:
        (response.usage?.input_tokens ?? 0) +
        (response.usage?.output_tokens ?? 0),
    },
    modelId,
    rawResponse: response,
  };
};

/**
 * Maps Anthropic's stop_reason. `model_context_window_exceeded` is a truncation
 * like `max_tokens`: the reply was cut off because the context window filled.
 */
const mapStopReason = (
  reason: string | null | undefined,
): generation.StopReason => {
  if (reason === "end_turn") {
    return "end_turn";
  }
  if (reason === "max_tokens" || reason === "model_context_window_exceeded") {
    return "max_tokens";
  }
  if (reason === "tool_use") {
    return "tool_use";
  }
  if (reason === "stop_sequence") {
    return "stop";
  }
  if (reason === "refusal") {
    return "refusal";
  }

  return "end_turn";
};

/** A thinking block while its deltas are still arriving. */
type ThinkingDraft = {
  text: string;
  signature: string;
  redactedData: string | null;
};

const finishThinking = (draft: ThinkingDraft): types.ThinkingPart => {
  if (draft.redactedData !== null) {
    return { text: "", redactedData: draft.redactedData };
  }

  return draft.signature === ""
    ? { text: draft.text }
    : { text: draft.text, signature: draft.signature };
};

/**
 * Reads an Anthropic thinking or redacted_thinking block as a thinking part,
 * or returns null for any other block.
 */
const toThinkingPart = (
  // A content block is untyped vendor JSON; only the mapped fields are read.
  // oxlint-disable-next-line typescript/no-explicit-any
  block: any,
): types.ThinkingPart | null => {
  if (block?.type === "thinking") {
    return block.signature === undefined
      ? { text: block.thinking ?? "" }
      : { text: block.thinking ?? "", signature: block.signature };
  }
  if (block?.type === "redacted_thinking") {
    return { text: "", redactedData: block.data ?? "" };
  }

  return null;
};

// The batch job is untyped vendor JSON; only the mapped fields are read.
// oxlint-disable-next-line typescript/no-explicit-any
const mapBatchJob = (result: any): batch.BatchJob => {
  return {
    id: result.id,
    status: mapBatchStatus(result.processing_status),
    createdAt: new Date(result.created_at),
    completedAt:
      result.ended_at !== undefined ? new Date(result.ended_at) : undefined,
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
  // SDK errors carry the HTTP status on a field their type does not declare.
  // oxlint-disable-next-line typescript/no-explicit-any
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
