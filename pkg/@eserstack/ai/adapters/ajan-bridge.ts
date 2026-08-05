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

/** Every envelope that can carry an error carries its classification with it. */
type BridgeErrorFields = {
  readonly error?: string;
  readonly errorKind?: string;
  readonly errorStatus?: number;
};

type BridgeHandleResp = BridgeErrorFields & {
  readonly handle?: string;
};

type BridgeContentBlock = {
  readonly type: "text" | "tool_call" | "tool_result";
  readonly text?: string;
  readonly id?: string;
  readonly name?: string;
  readonly arguments?: Record<string, unknown>;
};

type BridgeUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly thinkingTokens?: number;
};

type BridgeGenerateResp = BridgeErrorFields & {
  readonly content?: readonly BridgeContentBlock[];
  readonly stopReason?: string;
  readonly usage?: BridgeUsage;
  readonly modelId?: string;
};

type BridgeStreamEvent = {
  readonly type: "content_delta" | "tool_call_delta" | "message_done" | "error";
  readonly textDelta?: string;
  readonly toolCallId?: string;
  readonly toolCallName?: string;
  readonly argumentsDelta?: Record<string, unknown>;
  readonly stopReason?: string;
  readonly usage?: BridgeUsage;
  readonly error?: string;
  readonly errorKind?: string;
  readonly errorStatus?: number;
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

type BridgeBatchJobResp = BridgeErrorFields & {
  readonly job?: BridgeBatchJob;
};

type BridgeBatchListResp = BridgeErrorFields & {
  readonly jobs?: readonly BridgeBatchJob[];
};

type BridgeBatchResultItem = {
  readonly customId: string;
  readonly result?: BridgeGenerateResp;
  readonly error?: string;
};

type BridgeBatchDownloadResp = BridgeErrorFields & {
  readonly results?: readonly BridgeBatchResultItem[];
};

// =============================================================================
// Helpers
// =============================================================================

const parseJson = <T>(raw: string): T => {
  return JSON.parse(raw) as T;
};

/**
 * Base64-encode binary content for the wire.
 *
 * Chunked rather than `btoa(String.fromCharCode(...bytes))`, which the rest of
 * the repo uses: spreading a multi-megabyte array into a call blows the
 * argument limit and throws, and image payloads are exactly that size.
 */
const encodeBase64 = (bytes: Uint8Array): string => {
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
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

      continue;
    }

    // Tool calls used to be dropped here silently. A model that answered by
    // calling a tool therefore produced an empty content array, which reads as
    // "the model said nothing" rather than "the transport discarded it".
    if (
      block.type === "tool_call" && block.id !== undefined &&
      block.name !== undefined
    ) {
      result.push({
        kind: "tool_call",
        toolCall: {
          id: block.id,
          name: block.name,
          arguments: block.arguments ?? {},
        },
      });

      continue;
    }

    if (block.type === "tool_result" && block.id !== undefined) {
      result.push({
        kind: "tool_result",
        toolResult: {
          toolCallId: block.id,
          content: block.text ?? "",
          isError: false,
        },
      });
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

/**
 * Serialize one content block for the wire.
 *
 * Every kind carries its payload. The previous `{ type: b.kind }` fallthrough
 * named the kind and dropped everything in it, so an image reached the provider
 * as the bare word "image" and the model answered confidently about a picture
 * it was never shown.
 */
const buildContentBlock = (block: types.ContentBlock): unknown => {
  switch (block.kind) {
    case "text":
      return { type: "text", text: block.text };

    case "image":
      return {
        type: "image",
        image: {
          url: block.image.url,
          mimeType: block.image.mimeType,
          detail: block.image.detail,
          // Base64: a Uint8Array does not survive JSON.stringify, which turns
          // it into {"0":..,"1":..} rather than anything Go can decode.
          data: block.image.data === undefined
            ? undefined
            : encodeBase64(block.image.data),
        },
      };

    case "audio":
      return {
        type: "audio",
        audio: {
          url: block.audio.url,
          mimeType: block.audio.mimeType,
          data: block.audio.data === undefined
            ? undefined
            : encodeBase64(block.audio.data),
        },
      };

    case "file":
      return {
        type: "file",
        file: { uri: block.file.uri, mimeType: block.file.mimeType },
      };

    case "tool_call":
      return {
        type: "tool_call",
        toolCall: {
          id: block.toolCall.id,
          name: block.toolCall.name,
          arguments: block.toolCall.arguments,
        },
      };

    case "tool_result":
      return {
        type: "tool_result",
        toolResult: {
          toolCallId: block.toolResult.toolCallId,
          content: block.toolResult.content,
          isError: block.toolResult.isError,
        },
      };

    default:
      return { type: (block as { kind: string }).kind };
  }
};

/**
 * Bind an AbortSignal to a bridge request for the duration of a call.
 *
 * Returns the request id to send with the call, and a `release` that must run
 * when the call finishes — otherwise the listener keeps the signal (and through
 * it this model) alive for as long as the caller holds the controller.
 *
 * An already-aborted signal still sends its cancel. Go records it against the
 * id and the request stops the instant it registers, which closes the race that
 * makes abort unreliable exactly when it is easiest to write:
 *
 *     const c = new AbortController();
 *     const p = model.generateText(opts, c.signal);
 *     c.abort();                      // may reach Go before the call registers
 */
const bindAbort = (
  lib: ffiTypes.FFILibrary,
  signal: AbortSignal | undefined,
): { requestId: string; release: () => void } => {
  const requestId = crypto.randomUUID();

  if (signal === undefined) {
    return { requestId, release: () => {} };
  }

  const cancel = () => {
    try {
      lib.symbols.EserAjanAiCancelRequest(JSON.stringify({ requestId }));
    } catch {
      // The library may already be closed while a signal is still live. A
      // cancel that cannot be delivered is not worth failing the caller over.
    }
  };

  if (signal.aborted) {
    cancel();

    return { requestId, release: () => {} };
  }

  signal.addEventListener("abort", cancel, { once: true });

  return {
    requestId,
    release: () => signal.removeEventListener("abort", cancel),
  };
};

/** Rebuild the typed error a bridge envelope describes. */
const wireError = (
  provider: string,
  resp: BridgeErrorFields,
  fallback: string,
): errors.AiError =>
  errors.classifyWireError(
    provider,
    resp.error ?? fallback,
    resp.errorKind,
    resp.errorStatus,
  );

/** The error a caller gets when their AbortSignal fired. */
const abortError = (provider: string): errors.AiError =>
  new errors.AiError("request aborted", { provider });

const buildOptionsJSON = (
  options: generation.GenerateTextOptions,
  requestId?: string,
): string => {
  const messages = options.messages.map((m) => ({
    role: m.role,
    content: m.content.map(buildContentBlock),
  }));

  // Optionals are passed through as-is rather than defaulted. JSON.stringify
  // omits `undefined`, so an unset option stays absent and the Go pointer stays
  // nil -- whereas `?? 0` would pin every request to temperature 0, which is a
  // real setting and not the same as "unspecified".
  return JSON.stringify({
    requestId,
    messages,
    system: options.system ?? "",
    maxTokens: options.maxTokens ?? 0,
    toolChoice: options.toolChoice ?? "",
    tools: options.tools,
    temperature: options.temperature,
    topP: options.topP,
    stopWords: options.stopWords,
    responseFormat: options.responseFormat,
    thinkingBudget: options.thinkingBudget,
    safetySettings: options.safetySettings,
    extensions: options.extensions,
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

  async generateText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): Promise<results.Result<generation.GenerateTextResult, errors.AiError>> {
    const { requestId, release } = bindAbort(this.#lib, signal);

    try {
      const optionsJSON = buildOptionsJSON(options, requestId);

      // Awaited, and on Deno genuinely off-thread. A blocking call here froze
      // the isolate for the whole model round-trip, which also made the signal
      // above unobservable: nothing could run to fire it.
      const raw = await this.#lib.symbols.EserAjanAiGenerateText(
        this.#modelHandle,
        optionsJSON,
      );

      const resp = parseJson<BridgeGenerateResp>(raw);

      if (resp.error !== undefined) {
        // A cancelled request surfaces as a Go context error. Report the
        // caller's own intent rather than the plumbing that carried it out.
        return results.fail(
          signal?.aborted === true
            ? abortError(this.provider)
            : wireError(this.provider, resp, "generation failed"),
        );
      }

      return results.ok({
        content: mapContent(resp.content),
        stopReason: mapStopReason(resp.stopReason),
        usage: mapUsage(resp.usage),
        modelId: resp.modelId ?? this.modelId,
      });
    } finally {
      release();
    }
  }

  async *streamText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent> {
    const { requestId, release } = bindAbort(this.#lib, signal);

    const optionsJSON = buildOptionsJSON(options, requestId);

    const streamRaw = await this.#lib.symbols.EserAjanAiStreamText(
      this.#modelHandle,
      optionsJSON,
    );

    const streamResp = parseJson<BridgeHandleResp>(streamRaw);

    if (streamResp.error !== undefined || streamResp.handle === undefined) {
      release();

      yield {
        kind: "error",
        error: signal?.aborted === true
          ? abortError(this.provider)
          : wireError(this.provider, streamResp, "stream start failed"),
      };

      return;
    }

    const streamHandle = streamResp.handle;

    try {
      while (true) {
        // Stop before asking for another event rather than after receiving one:
        // a consumer that aborted does not want one more token, and the read
        // below would otherwise wait on the provider for it.
        if (signal?.aborted === true) {
          yield { kind: "error", error: abortError(this.provider) };

          return;
        }

        const eventRaw = await this.#lib.symbols.EserAjanAiStreamRead(
          streamHandle,
        );

        if (eventRaw === "null" || eventRaw === "") {
          break;
        }

        const event = parseJson<BridgeStreamEvent>(eventRaw);

        switch (event.type) {
          case "content_delta":
            yield { kind: "content_delta", textDelta: event.textDelta ?? "" };
            break;

          case "tool_call_delta":
            // The tool call arrives in its own fields. Go used to put the
            // tool's NAME in textDelta, so a consumer concatenating deltas
            // spliced tool names into the prose and never saw the arguments.
            yield {
              kind: "tool_call_delta",
              textDelta: event.textDelta,
              toolCall: event.toolCallId === undefined ? undefined : {
                id: event.toolCallId,
                name: event.toolCallName ?? "",
                arguments: event.argumentsDelta ?? {},
              },
            };
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
              error: wireError(this.provider, event, "stream error"),
            };

            return;
        }
      }
    } finally {
      // Both, in this order. FreeStream cancels the underlying context and
      // drops the handle; release detaches the abort listener so an abandoned
      // stream does not keep the caller's controller tethered to this model.
      this.#lib.symbols.EserAjanAiFreeStream(streamHandle);
      release();
    }
  }

  async submitBatch(
    request: batch.BatchRequest,
    signal?: AbortSignal,
  ): Promise<batch.BatchJob> {
    const { requestId, release } = bindAbort(this.#lib, signal);

    try {
      const items = request.items.map((item) => ({
        customId: item.customId,
        options: JSON.parse(buildOptionsJSON(item.options)) as unknown,
      }));

      const raw = await this.#lib.symbols.EserAjanAiBatchCreate(
        JSON.stringify({ requestId, modelHandle: this.#modelHandle, items }),
      );

      const resp = parseJson<BridgeBatchJobResp>(raw);

      if (resp.error !== undefined || resp.job === undefined) {
        throw signal?.aborted === true
          ? abortError(this.provider)
          : wireError(this.provider, resp, "batch create failed");
      }

      return mapBatchJob(resp.job);
    } finally {
      release();
    }
  }

  async getBatchJob(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<batch.BatchJob> {
    const { requestId, release } = bindAbort(this.#lib, signal);

    try {
      const raw = await this.#lib.symbols.EserAjanAiBatchGet(
        JSON.stringify({ requestId, modelHandle: this.#modelHandle, jobId }),
      );

      const resp = parseJson<BridgeBatchJobResp>(raw);

      if (resp.error !== undefined || resp.job === undefined) {
        throw signal?.aborted === true
          ? abortError(this.provider)
          : wireError(this.provider, resp, "batch get failed");
      }

      return mapBatchJob(resp.job);
    } finally {
      release();
    }
  }

  async listBatchJobs(
    options?: batch.ListBatchOptions,
    signal?: AbortSignal,
  ): Promise<readonly batch.BatchJob[]> {
    const { requestId, release } = bindAbort(this.#lib, signal);

    try {
      const raw = await this.#lib.symbols.EserAjanAiBatchList(
        JSON.stringify({
          requestId,
          modelHandle: this.#modelHandle,
          limit: options?.limit,
          after: options?.after,
        }),
      );

      const resp = parseJson<BridgeBatchListResp>(raw);

      if (resp.error !== undefined) {
        throw signal?.aborted === true
          ? abortError(this.provider)
          : wireError(this.provider, resp, "batch call failed");
      }

      return (resp.jobs ?? []).map(mapBatchJob);
    } finally {
      release();
    }
  }

  async downloadBatchResults(
    job: batch.BatchJob,
    signal?: AbortSignal,
  ): Promise<readonly batch.BatchResult[]> {
    const { requestId, release } = bindAbort(this.#lib, signal);

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

    try {
      const raw = await this.#lib.symbols.EserAjanAiBatchDownload(
        JSON.stringify({
          requestId,
          modelHandle: this.#modelHandle,
          job: bridgeJob,
        }),
      );

      const resp = parseJson<BridgeBatchDownloadResp>(raw);

      if (resp.error !== undefined) {
        throw signal?.aborted === true
          ? abortError(this.provider)
          : wireError(this.provider, resp, "batch call failed");
      }

      return (resp.results ?? []).map((item) => ({
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
    } finally {
      release();
    }
  }

  /**
   * Asks the provider to cancel a batch job.
   *
   * Distinct from aborting this call. `signal` aborts the local request that
   * asks for the cancellation; the cancellation itself is a durable change of
   * state at the provider, and aborting the ask does not undo it if it already
   * landed.
   */
  async cancelBatchJob(jobId: string, signal?: AbortSignal): Promise<void> {
    const { requestId, release } = bindAbort(this.#lib, signal);

    try {
      const raw = await this.#lib.symbols.EserAjanAiBatchCancel(
        JSON.stringify({ requestId, modelHandle: this.#modelHandle, jobId }),
      );

      const resp = parseJson<{ error?: string }>(raw);

      if (resp.error !== undefined) {
        throw signal?.aborted === true
          ? abortError(this.provider)
          : wireError(this.provider, resp, "batch call failed");
      }
    } finally {
      release();
    }
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
        wireError(cfg.provider, resp, "failed to create model"),
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
// `vision` is declared only because image payloads genuinely cross the wire
// now. It was removed for a while: buildOptionsJSON used to reduce an image
// block to `{ type: "image" }` with no payload and Go had no field to receive
// one, so a caller who attached an image got a confident answer about nothing
// while the capability said that should work. The declaration follows the
// transport, in both directions.
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
/**
 * Bridge providers whose Go implementation drives an external ACP agent.
 *
 * pkg/ajan/aifx/adapter_acp.go drives its in-process shim for each of these, so
 * the bridge can only serve them where that binary exists. It is not part of the
 * ajan npm packages, which carry the shared library only.
 */
export const createBridgeFactories = (
  lib: ffiTypes.FFILibrary,
): readonly model.ProviderFactory[] =>
  BRIDGE_PROVIDERS.map(
    ({ provider, capabilities }) =>
      new AjanBridgeModelFactory(lib, provider, capabilities),
  );

/**
 * Attempts to load the ajan FFI library and returns bridge factories.
 * Returns an empty array on failure (FFI not available).
 */
export const tryLoadBridgeFactories = async (): Promise<
  readonly model.ProviderFactory[]
> => {
  try {
    const ffiMod = await import("@eserstack/ajan/ffi");

    // Native only. loadEserAjan otherwise falls back to WASM, which LOADS
    // successfully and then fails every AI call — so the bridge factories would
    // register, displace the pure-TS adapters that do work, and turn a missing
    // native binary into a provider that is present and broken rather than
    // absent. Refusing here lets defaultFactories keep the TS adapter for that
    // provider, which is the whole point of the per-provider merge.
    const lib = await ffiMod.loadEserAjan({ wasm: false });

    lib.symbols.EserAjanInit();

    // No shim probe. claude-code/opencode/kiro used to be gated on an `eser-acp`
    // binary being on PATH; the shim is now Go code linked into the library that
    // just loaded, so if the library is here the backends are here. The vendor
    // CLI each one drives still has to be installed, but that is a spawn-time
    // failure with its own message, not something a PATH lookup can predict.
    return createBridgeFactories(lib);
  } catch {
    // FFI not available — caller falls back to pure-TS factories.
    return [];
  }
};
