// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as types from "../types.ts";
import type * as config from "../config.ts";
import type * as generation from "../generation.ts";
import type * as batch from "../batch.ts";
import type * as model from "../model.ts";
import * as errors from "../errors.ts";

// =============================================================================
// OpenAI Model
// =============================================================================

export class OpenAIModel
  implements model.LanguageModel, model.BatchCapableModel {
  readonly capabilities: readonly types.ProviderCapability[] = [
    "text_generation",
    "streaming",
    "tool_calling",
    "vision",
    "batch_processing",
    "structured_output",
    "reasoning",
  ];
  readonly provider = "openai";
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
      const response = await this.client.chat.completions.create(params, {
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
      const stream = await this.client.chat.completions.create(
        { ...params, stream: true },
        { signal, timeout: this.config.requestTimeoutMs },
      );

      const toolCalls = new Map<
        number,
        { id: string; name: string; args: string }
      >();
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (choice === undefined) {
          continue;
        }

        const delta = choice.delta;

        if (delta?.content !== undefined && delta.content !== null) {
          yield { kind: "content_delta", textDelta: delta.content };
        }

        if (delta?.tool_calls !== undefined) {
          for (const tc of delta.tool_calls) {
            const index = tc.index ?? 0;
            const existing = toolCalls.get(index);

            if (existing === undefined) {
              toolCalls.set(index, {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                args: tc.function?.arguments ?? "",
              });
            } else {
              existing.args += tc.function?.arguments ?? "";
            }
          }
        }

        if (
          choice.finish_reason !== undefined && choice.finish_reason !== null
        ) {
          // Emit completed tool calls
          for (const [, tc] of toolCalls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.args || "{}");
            } catch {
              // Keep empty args on parse failure
            }
            yield {
              kind: "tool_call_delta",
              toolCall: {
                id: tc.id,
                name: tc.name,
                arguments: args,
              },
            };
          }

          if (chunk.usage !== undefined) {
            inputTokens = chunk.usage.prompt_tokens ?? 0;
            outputTokens = chunk.usage.completion_tokens ?? 0;
          }

          yield {
            kind: "message_done",
            stopReason: mapStopReason(choice.finish_reason),
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
    const lines = request.items.map((item) => {
      const params = buildParams(this.config, item.options);

      return JSON.stringify({
        custom_id: item.customId,
        method: "POST",
        url: "/v1/chat/completions",
        body: params,
      });
    });

    const jsonlContent = lines.join("\n");
    const blob = new Blob([jsonlContent], { type: "application/jsonl" });

    try {
      const file = await this.client.files.create(
        { file: blob, purpose: "batch" },
        { signal },
      );

      const batchResult = await this.client.batches.create(
        {
          input_file_id: file.id,
          endpoint: "/v1/chat/completions",
          completion_window: "24h",
        },
        { signal },
      );

      return mapBatchJob(batchResult);
    } catch (err) {
      throw classifyError(err);
    }
  }

  async getBatchJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<batch.BatchJob> {
    try {
      const result = await this.client.batches.retrieve(jobId, { signal });

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
      const result = await this.client.batches.list(
        { limit: options?.limit, after: options?.after },
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
    const outputRef = job.storage?.outputRef;

    if (outputRef === undefined) {
      return [];
    }

    try {
      const fileContent = await this.client.files.content(outputRef, {
        signal,
      });
      const text = await fileContent.text();
      const lines = text.split("\n").filter((line: string) => line.length > 0);

      const results: batch.BatchResult[] = [];
      for (const line of lines) {
        const entry = JSON.parse(line);

        if (entry.response?.status_code === 200) {
          results.push({
            customId: entry.custom_id,
            result: mapResponse(entry.response.body, this.modelId),
          });
        } else {
          results.push({
            customId: entry.custom_id,
            error: entry.error?.message ?? "Unknown error",
          });
        }
      }

      return results;
    } catch (err) {
      throw classifyError(err);
    }
  }

  async cancelBatchJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await this.client.batches.cancel(jobId, { signal });
    } catch (err) {
      throw classifyError(err);
    }
  }

  async close(): Promise<void> {
    // OpenAI SDK doesn't require explicit cleanup
  }

  getRawClient(): unknown {
    return this.client;
  }
}

// =============================================================================
// Factory
// =============================================================================

export const openaiFactory: model.ProviderFactory = {
  provider: "openai",
  async createModel(
    cfg: config.ResolvedConfigTarget,
  ): Promise<model.LanguageModel> {
    const { default: OpenAI } = await import("openai");

    const clientOptions: Record<string, unknown> = {};

    if (cfg.apiKey !== undefined) {
      clientOptions["apiKey"] = cfg.apiKey;
    }
    if (cfg.baseUrl !== undefined) {
      clientOptions["baseURL"] = cfg.baseUrl;
    }

    const client = new OpenAI(clientOptions);

    return new OpenAIModel(client, cfg);
  },
};

// =============================================================================
// Internal Helpers
// =============================================================================

const buildParams = (
  cfg: config.ResolvedConfigTarget,
  options: generation.GenerateTextOptions,
): Record<string, unknown> => {
  const messages = mapMessages(options.messages, options.system);

  const params: Record<string, unknown> = {
    model: cfg.model,
    messages,
    max_tokens: options.maxTokens ?? cfg.maxTokens,
  };

  if (options.temperature !== undefined) {
    params["temperature"] = options.temperature;
  }

  if (options.topP !== undefined) {
    params["top_p"] = options.topP;
  }

  if (options.stopWords !== undefined) {
    params["stop"] = options.stopWords;
  }

  if (options.tools !== undefined) {
    params["tools"] = options.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ?? { type: "object", properties: {} },
      },
    }));
  }

  if (options.toolChoice !== undefined) {
    params["tool_choice"] = options.toolChoice;
  }

  if (options.responseFormat !== undefined) {
    if (options.responseFormat.type === "json_schema") {
      params["response_format"] = {
        type: "json_schema",
        json_schema: {
          name: options.responseFormat.name ?? "response",
          schema: options.responseFormat.jsonSchema,
          strict: true,
        },
      };
    } else if (options.responseFormat.type === "json_object") {
      params["response_format"] = { type: "json_object" };
    }
  }

  if (options.thinkingBudget !== undefined) {
    params["reasoning_effort"] = mapReasoningEffort(options.thinkingBudget);
  }

  return params;
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

    if (message.role === "tool") {
      for (const block of message.content) {
        if (block.kind === "tool_result") {
          result.push({
            role: "tool",
            tool_call_id: block.toolResult.toolCallId,
            content: block.toolResult.content,
          });
        }
      }
      continue;
    }

    const contentParts = message.content.map(mapContentBlock);

    if (contentParts.length === 1 && contentParts[0]?.["type"] === "text") {
      result.push({ role: message.role, content: contentParts[0]["text"] });
    } else {
      result.push({ role: message.role, content: contentParts });
    }
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
      let url: string;
      if (block.image.url !== undefined) {
        url = block.image.url;
      } else if (block.image.data !== undefined) {
        const mimeType = block.image.mimeType ?? "image/png";
        url = `data:${mimeType};base64,${encodeBase64(block.image.data)}`;
      } else {
        return { type: "text", text: "[unsupported image]" };
      }

      return {
        type: "image_url",
        image_url: {
          url,
          detail: block.image.detail ?? "auto",
        },
      };
    }
    case "audio": {
      if (block.audio.data !== undefined) {
        const mimeType = block.audio.mimeType ?? "audio/mpeg";
        const format = mimeTypeToAudioFormat(mimeType);

        return {
          type: "input_audio",
          input_audio: {
            data: encodeBase64(block.audio.data),
            format,
          },
        };
      }
      return { type: "text", text: "[unsupported audio format]" };
    }
    case "tool_call": {
      return {
        type: "function",
        id: block.toolCall.id,
        function: {
          name: block.toolCall.name,
          arguments: JSON.stringify(block.toolCall.arguments),
        },
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
  let stopReason: generation.StopReason = "end_turn";

  const choice = response.choices?.[0];

  if (choice !== undefined) {
    if (
      choice.message?.content !== undefined && choice.message.content !== null
    ) {
      contentBlocks.push({ kind: "text", text: choice.message.content });
    }

    if (choice.message?.tool_calls !== undefined) {
      for (const tc of choice.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function?.arguments ?? "{}");
        } catch {
          // Keep empty args on parse failure
        }
        contentBlocks.push({
          kind: "tool_call",
          toolCall: {
            id: tc.id,
            name: tc.function?.name ?? "",
            arguments: args,
          },
        });
      }
    }

    stopReason = mapStopReason(choice.finish_reason);
  }

  return {
    content: contentBlocks,
    stopReason,
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
    modelId,
    rawResponse: response,
  };
};

const mapStopReason = (
  reason: string | null | undefined,
): generation.StopReason => {
  if (reason === "stop") {
    return "end_turn";
  }
  if (reason === "length") {
    return "max_tokens";
  }
  if (reason === "tool_calls") {
    return "tool_use";
  }

  return "end_turn";
};

// deno-lint-ignore no-explicit-any
const mapBatchJob = (result: any): batch.BatchJob => {
  return {
    id: result.id,
    status: mapBatchStatus(result.status),
    createdAt: new Date(result.created_at * 1000),
    completedAt: result.completed_at !== undefined
      ? new Date(result.completed_at * 1000)
      : undefined,
    totalCount: result.request_counts?.total ?? 0,
    doneCount: result.request_counts?.completed ?? 0,
    failedCount: result.request_counts?.failed ?? 0,
    storage: {
      type: "openai_file",
      inputRef: result.input_file_id,
      outputRef: result.output_file_id,
    },
  };
};

const mapBatchStatus = (status: string): batch.BatchStatus => {
  if (status === "completed") {
    return "completed";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "cancelled" || status === "cancelling") {
    return "cancelled";
  }
  if (status === "in_progress" || status === "finalizing") {
    return "processing";
  }

  return "pending";
};

const mapReasoningEffort = (budget: number): string => {
  if (budget <= 1000) {
    return "low";
  }
  if (budget >= 10000) {
    return "high";
  }

  return "medium";
};

const mimeTypeToAudioFormat = (mimeType: string): string => {
  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) {
    return "mp3";
  }
  if (mimeType.includes("wav")) {
    return "wav";
  }
  if (mimeType.includes("flac")) {
    return "flac";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "mp3";
};

const classifyError = (err: unknown): errors.AiError => {
  if (err instanceof errors.AiError) {
    return err;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  // deno-lint-ignore no-explicit-any
  const statusCode = (err as any)?.status ?? (err as any)?.statusCode ?? 500;

  return errors.classifyAndWrap("openai", statusCode, error);
};

const encodeBase64 = (data: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }

  return btoa(binary);
};
