// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Ajan FFI bridge adapter for @eserstack/ai.
 *
 * Routes AI calls through the Go `pkg/ajan/aifx` implementation via the
 * `@eserstack/ajan` C-shared library. Falls back gracefully when native
 * FFI is unavailable.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type * as ffiTypes from "@eserstack/ajan/ffi";
import type * as types from "../types.ts";
import type * as config from "../config.ts";
import type * as generation from "../generation.ts";
import type * as batch from "../batch.ts";
import type * as model from "../model.ts";
import * as errors from "../errors.ts";

// =============================================================================
// Wire types (must match bridge.go JSON schemas)
// =============================================================================

type BridgeHandleResp = {
  readonly handle?: string;
  readonly error?: string;
};

type BridgeContentBlock = {
  readonly type: "text" | "tool_call";
  readonly text?: string;
};

type BridgeUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly thinkingTokens?: number;
};

type BridgeGenerateResp = {
  readonly content?: readonly BridgeContentBlock[];
  readonly stopReason?: string;
  readonly usage?: BridgeUsage;
  readonly modelId?: string;
  readonly error?: string;
};

type BridgeStreamEvent = {
  readonly type: "content_delta" | "tool_call_delta" | "message_done" | "error";
  readonly textDelta?: string;
  readonly stopReason?: string;
  readonly usage?: BridgeUsage;
  readonly error?: string;
};

type BridgeBatchStorage = {
  readonly type: string;
  readonly inputRef?: string;
  readonly outputRef?: string;
  readonly properties?: Record<string, unknown>;
};

type BridgeBatchJob = {
  readonly id: string;
  readonly status: batch.BatchStatus;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly totalCount: number;
  readonly doneCount: number;
  readonly failedCount: number;
  readonly storage?: BridgeBatchStorage;
  readonly error?: string;
};

type BridgeBatchJobResp = {
  readonly job?: BridgeBatchJob;
  readonly error?: string;
};

type BridgeBatchListResp = {
  readonly jobs?: readonly BridgeBatchJob[];
  readonly error?: string;
};

type BridgeBatchResultItem = {
  readonly customId: string;
  readonly result?: BridgeGenerateResp;
  readonly error?: string;
};

type BridgeBatchDownloadResp = {
  readonly results?: readonly BridgeBatchResultItem[];
  readonly error?: string;
};

// =============================================================================
// Helpers
// =============================================================================

const parseJson = <T>(raw: string): T => {
  return JSON.parse(raw) as T;
};

const mapStopReason = (raw: string | undefined): generation.StopReason => {
  switch (raw) {
    case "end_turn":
      return "end_turn";
    case "max_tokens":
      return "max_tokens";
    case "tool_use":
      return "tool_use";
    default:
      return "stop";
  }
};

const mapUsage = (u: BridgeUsage | undefined): generation.Usage => {
  return {
    inputTokens: u?.inputTokens ?? 0,
    outputTokens: u?.outputTokens ?? 0,
    totalTokens: u?.totalTokens ?? 0,
    thinkingTokens: u?.thinkingTokens,
  };
};

const mapContent = (
  blocks: readonly BridgeContentBlock[] | undefined,
): readonly types.ContentBlock[] => {
  if (blocks === undefined) {
    return [];
  }

  const result: types.ContentBlock[] = [];

  for (const block of blocks) {
    if (block.type === "text" && block.text !== undefined) {
      result.push({ kind: "text", text: block.text });
    }
  }

  return result;
};

const mapBatchJob = (j: BridgeBatchJob): batch.BatchJob => {
  return {
    id: j.id,
    status: j.status,
    createdAt: new Date(j.createdAt),
    completedAt: j.completedAt !== undefined
      ? new Date(j.completedAt)
      : undefined,
    totalCount: j.totalCount,
    doneCount: j.doneCount,
    failedCount: j.failedCount,
    storage: j.storage,
    error: j.error,
  };
};

const buildOptionsJSON = (options: generation.GenerateTextOptions): string => {
  const messages = options.messages.map((m) => ({
    role: m.role,
    content: m.content.map((b) => {
      if (b.kind === "text") {
        return { type: "text", text: b.text };
      }

      return { type: b.kind };
    }),
  }));

  return JSON.stringify({
    messages,
    system: options.system ?? "",
    maxTokens: options.maxTokens ?? 0,
    toolChoice: options.toolChoice ?? "",
  });
};

// =============================================================================
// AjanBridgeModel
// =============================================================================

export class AjanBridgeModel implements model.BatchCapableModel {
  readonly capabilities: readonly types.ProviderCapability[];
  readonly provider: string;
  readonly modelId: string;

  readonly #lib: ffiTypes.FFILibrary;
  readonly #modelHandle: string;

  constructor(
    lib: ffiTypes.FFILibrary,
    modelHandle: string,
    provider: string,
    modelId: string,
    capabilities: readonly types.ProviderCapability[],
  ) {
    this.#lib = lib;
    this.#modelHandle = modelHandle;
    this.provider = provider;
    this.modelId = modelId;
    this.capabilities = capabilities;
  }

  generateText(
    options: generation.GenerateTextOptions,
    _signal?: AbortSignal,
  ): Promise<results.Result<generation.GenerateTextResult, errors.AiError>> {
    const optionsJSON = buildOptionsJSON(options);

    const raw = this.#lib.symbols.EserAjanAiGenerateText(
      this.#modelHandle,
      optionsJSON,
    );

    const resp = parseJson<BridgeGenerateResp>(raw);

    if (resp.error !== undefined) {
      return Promise.resolve(
        results.fail(
          new errors.AiError(resp.error, { provider: this.provider }),
        ),
      );
    }

    return Promise.resolve(
      results.ok({
        content: mapContent(resp.content),
        stopReason: mapStopReason(resp.stopReason),
        usage: mapUsage(resp.usage),
        modelId: resp.modelId ?? this.modelId,
      }),
    );
  }

  async *streamText(
    options: generation.GenerateTextOptions,
    _signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent> {
    const optionsJSON = buildOptionsJSON(options);

    const streamRaw = this.#lib.symbols.EserAjanAiStreamText(
      this.#modelHandle,
      optionsJSON,
    );

    const streamResp = parseJson<BridgeHandleResp>(streamRaw);

    if (streamResp.error !== undefined || streamResp.handle === undefined) {
      yield {
        kind: "error",
        error: new errors.AiError(
          streamResp.error ?? "stream start failed",
          { provider: this.provider },
        ),
      };

      return;
    }

    const streamHandle = streamResp.handle;

    try {
      while (true) {
        // Yield to the JS event loop between polls.
        await Promise.resolve();

        const eventRaw = this.#lib.symbols.EserAjanAiStreamRead(streamHandle);

        if (eventRaw === "null" || eventRaw === "") {
          break;
        }

        const event = parseJson<BridgeStreamEvent>(eventRaw);

        switch (event.type) {
          case "content_delta":
            yield { kind: "content_delta", textDelta: event.textDelta ?? "" };
            break;

          case "tool_call_delta":
            yield { kind: "tool_call_delta", textDelta: event.textDelta };
            break;

          case "message_done":
            yield {
              kind: "message_done",
              stopReason: mapStopReason(event.stopReason),
              usage: mapUsage(event.usage),
            };

            return;

          case "error":
            yield {
              kind: "error",
              error: new errors.AiError(
                event.error ?? "stream error",
                { provider: this.provider },
              ),
            };

            return;
        }
      }
    } finally {
      this.#lib.symbols.EserAjanAiFreeStream(streamHandle);
    }
  }

  submitBatch(
    request: batch.BatchRequest,
    _signal?: AbortSignal,
  ): Promise<batch.BatchJob> {
    const items = request.items.map((item) => ({
      customId: item.customId,
      options: JSON.parse(buildOptionsJSON(item.options)) as unknown,
    }));

    const raw = this.#lib.symbols.EserAjanAiBatchCreate(
      JSON.stringify({ modelHandle: this.#modelHandle, requests: items }),
    );

    const resp = parseJson<BridgeBatchJobResp>(raw);

    if (resp.error !== undefined || resp.job === undefined) {
      return Promise.reject(
        new errors.AiError(resp.error ?? "batch create failed", {
          provider: this.provider,
        }),
      );
    }

    return Promise.resolve(mapBatchJob(resp.job));
  }

  getBatchJob(jobId: string, _signal?: AbortSignal): Promise<batch.BatchJob> {
    const raw = this.#lib.symbols.EserAjanAiBatchGet(
      JSON.stringify({ modelHandle: this.#modelHandle, jobId }),
    );

    const resp = parseJson<BridgeBatchJobResp>(raw);

    if (resp.error !== undefined || resp.job === undefined) {
      return Promise.reject(
        new errors.AiError(resp.error ?? "batch get failed", {
          provider: this.provider,
        }),
      );
    }

    return Promise.resolve(mapBatchJob(resp.job));
  }

  listBatchJobs(
    options?: batch.ListBatchOptions,
    _signal?: AbortSignal,
  ): Promise<readonly batch.BatchJob[]> {
    const raw = this.#lib.symbols.EserAjanAiBatchList(
      JSON.stringify({
        modelHandle: this.#modelHandle,
        limit: options?.limit,
        afterId: options?.after,
      }),
    );

    const resp = parseJson<BridgeBatchListResp>(raw);

    if (resp.error !== undefined) {
      return Promise.reject(
        new errors.AiError(resp.error, { provider: this.provider }),
      );
    }

    return Promise.resolve((resp.jobs ?? []).map(mapBatchJob));
  }

  downloadBatchResults(
    job: batch.BatchJob,
    _signal?: AbortSignal,
  ): Promise<readonly batch.BatchResult[]> {
    const bridgeJob: BridgeBatchJob = {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      totalCount: job.totalCount,
      doneCount: job.doneCount,
      failedCount: job.failedCount,
      storage: job.storage,
      error: job.error,
    };

    const raw = this.#lib.symbols.EserAjanAiBatchDownload(
      JSON.stringify({ modelHandle: this.#modelHandle, job: bridgeJob }),
    );

    const resp = parseJson<BridgeBatchDownloadResp>(raw);

    if (resp.error !== undefined) {
      return Promise.reject(
        new errors.AiError(resp.error, { provider: this.provider }),
      );
    }

    const results: batch.BatchResult[] = (resp.results ?? []).map((item) => ({
      customId: item.customId,
      result: item.result !== undefined
        ? {
          content: mapContent(item.result.content),
          stopReason: mapStopReason(item.result.stopReason),
          usage: mapUsage(item.result.usage),
          modelId: item.result.modelId ?? this.modelId,
        }
        : undefined,
      error: item.error,
    }));

    return Promise.resolve(results);
  }

  cancelBatchJob(jobId: string, _signal?: AbortSignal): Promise<void> {
    const raw = this.#lib.symbols.EserAjanAiBatchCancel(
      JSON.stringify({ modelHandle: this.#modelHandle, jobId }),
    );

    const resp = parseJson<{ error?: string }>(raw);

    if (resp.error !== undefined) {
      return Promise.reject(
        new errors.AiError(resp.error, { provider: this.provider }),
      );
    }

    return Promise.resolve();
  }

  close(): Promise<void> {
    this.#lib.symbols.EserAjanAiCloseModel(this.#modelHandle);
    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  [Symbol.dispose](): void {
    this.#lib.symbols.EserAjanAiCloseModel(this.#modelHandle);
  }

  getRawClient(): unknown {
    return null;
  }
}

// =============================================================================
// Factory
// =============================================================================

export class AjanBridgeModelFactory implements model.ProviderFactory {
  readonly provider: string;

  readonly #lib: ffiTypes.FFILibrary;
  readonly #capabilities: readonly types.ProviderCapability[];

  constructor(
    lib: ffiTypes.FFILibrary,
    provider: string,
    capabilities: readonly types.ProviderCapability[],
  ) {
    this.#lib = lib;
    this.provider = provider;
    this.#capabilities = capabilities;
  }

  createModel(cfg: config.ResolvedConfigTarget): Promise<model.LanguageModel> {
    const configJSON = JSON.stringify({
      provider: cfg.provider,
      apiKey: cfg.apiKey ?? "",
      model: cfg.model,
      baseUrl: cfg.baseUrl ?? "",
      projectId: cfg.projectId ?? "",
      location: cfg.location ?? "",
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
      requestTimeoutMs: cfg.requestTimeoutMs,
      properties: cfg.properties ?? {},
    });

    const raw = this.#lib.symbols.EserAjanAiCreateModel(configJSON);
    const resp = parseJson<BridgeHandleResp>(raw);

    if (resp.error !== undefined || resp.handle === undefined) {
      return Promise.reject(
        new errors.AiError(
          resp.error ?? "failed to create model",
          { provider: cfg.provider },
        ),
      );
    }

    return Promise.resolve(
      new AjanBridgeModel(
        this.#lib,
        resp.handle,
        cfg.provider,
        cfg.model,
        this.#capabilities,
      ),
    );
  }
}

// =============================================================================
// Bridge registry setup
// =============================================================================

/** Providers supported by the Go bridge and their default capabilities. */
const BRIDGE_PROVIDERS: ReadonlyArray<{
  readonly provider: string;
  readonly capabilities: readonly types.ProviderCapability[];
}> = [
  {
    provider: "anthropic",
    capabilities: [
      "text_generation",
      "streaming",
      "tool_calling",
      "vision",
      "batch_processing",
      "structured_output",
      "reasoning",
    ],
  },
  {
    provider: "openai",
    capabilities: [
      "text_generation",
      "streaming",
      "tool_calling",
      "vision",
      "batch_processing",
      "structured_output",
      "reasoning",
    ],
  },
  {
    provider: "gemini",
    capabilities: [
      "text_generation",
      "streaming",
      "tool_calling",
      "vision",
    ],
  },
  {
    provider: "vertexai",
    capabilities: [
      "text_generation",
      "streaming",
      "tool_calling",
      "vision",
      "batch_processing",
    ],
  },
  {
    provider: "ollama",
    capabilities: ["text_generation", "streaming", "vision"],
  },
  {
    provider: "claude-code",
    capabilities: ["text_generation", "streaming", "tool_calling"],
  },
  {
    provider: "opencode",
    capabilities: ["text_generation", "streaming"],
  },
  {
    provider: "kiro",
    capabilities: ["text_generation", "streaming"],
  },
];

/**
 * Creates AjanBridgeModelFactory instances for all supported providers.
 * Returns an empty array if the FFI library is not available.
 */
export const createBridgeFactories = (
  lib: ffiTypes.FFILibrary,
): readonly model.ProviderFactory[] => {
  return BRIDGE_PROVIDERS.map(
    ({ provider, capabilities }) =>
      new AjanBridgeModelFactory(lib, provider, capabilities),
  );
};

/**
 * Attempts to load the ajan FFI library and returns bridge factories.
 * Returns an empty array on failure (FFI not available).
 */
export const tryLoadBridgeFactories = async (): Promise<
  readonly model.ProviderFactory[]
> => {
  try {
    const ffiMod = await import("@eserstack/ajan/ffi");
    const lib = await ffiMod.loadEserAjan();

    lib.symbols.EserAjanInit();

    return createBridgeFactories(lib);
  } catch {
    // FFI not available — caller falls back to pure-TS factories.
    return [];
  }
};
