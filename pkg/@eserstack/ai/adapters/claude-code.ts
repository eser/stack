// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as results from "@eserstack/primitives/results";
import type * as types from "../types.ts";
import type * as config from "../config.ts";
import * as generation from "../generation.ts";
import type * as model from "../model.ts";
import * as errors from "../errors.ts";
import * as cliShared from "./cli-shared.ts";

// =============================================================================
// Claude Code Model
// =============================================================================

export class ClaudeCodeModel implements model.LanguageModel {
  readonly capabilities: readonly types.ProviderCapability[] = [
    "text_generation",
    "streaming",
    "tool_calling",
    "structured_output",
  ];
  readonly provider = "claude-code";
  readonly modelId: string;

  private readonly binary: string;
  private readonly config: config.ResolvedConfigTarget;

  constructor(binary: string, cfg: config.ResolvedConfigTarget) {
    this.binary = binary;
    this.config = cfg;
    this.modelId = cfg.model;
  }

  async generateText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): Promise<results.Result<generation.GenerateTextResult, errors.AiError>> {
    let args: string[];
    try {
      args = buildArgs(this.config, options, "json");
    } catch (err) {
      // buildArgs throws a BadRequestError for a json_schema format without an
      // object schema; anything else is a bug and propagates.
      if (err instanceof errors.BadRequestError) {
        return results.fail(err);
      }
      throw err;
    }

    const prompt = cliShared.formatMessagesAsText(
      options.messages,
      options.system,
    );

    // Pipe prompt via stdin to avoid E2BIG on large inputs (ARG_MAX ~256KB).
    // Claude Code reads from stdin when no -p flag is provided.
    const process = cliShared.spawnCliProcess(this.binary, args, {
      signal,
      stdinData: prompt,
      // The ACP path honours properties.cwd; this one silently did not, so the
      // same config produced an agent rooted at the project on one path and at
      // whatever directory the caller happened to be in on the other. Undefined
      // still means "inherit", which is the previous behaviour when unset.
      cwd: this.config.properties?.["cwd"] as string | undefined,
    });
    const stderrPromise = cliShared.captureStderr(process.stderr);

    try {
      const chunks: string[] = [];
      const decoder = new TextDecoder();

      for await (const chunk of process.stdout) {
        chunks.push(decoder.decode(chunk, { stream: true }));
      }

      const exit = await process.waitForExit();
      const stderr = await stderrPromise;
      const exitError = cliShared.classifyExitCode(
        "claude-code",
        exit.code,
        stderr,
      );

      if (exitError !== null) {
        return results.fail(exitError);
      }

      const rawOutput = chunks.join("");

      return results.ok(parseJsonResult(rawOutput, this.modelId));
    } finally {
      await cliShared.stopCliProcess(process, stderrPromise);
    }
  }

  async *streamText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent> {
    // A --json-schema reply arrives whole, in the CLI's final result event, so
    // it is read with the json output format and yielded in one piece.
    if (options.responseFormat?.type === "json_schema") {
      yield* this.#streamStructuredReply(options, signal);
      return;
    }

    // Configurable via properties.streamFormat: "text" (default) or "stream-json"
    //   - "text": true byte-level streaming, each stdout chunk → content_delta
    //   - "stream-json": structured JSONL events (tool calls, usage stats)
    const streamFormat =
      (this.config.properties?.["streamFormat"] as string | undefined) ??
      "text";
    const args = buildArgs(
      this.config,
      options,
      streamFormat as "text" | "stream-json",
    );
    const prompt = cliShared.formatMessagesAsText(
      options.messages,
      options.system,
    );

    // Pipe prompt via stdin to avoid E2BIG on large inputs.
    const process = cliShared.spawnCliProcess(this.binary, args, {
      signal,
      stdinData: prompt,
      // The ACP path honours properties.cwd; this one silently did not, so the
      // same config produced an agent rooted at the project on one path and at
      // whatever directory the caller happened to be in on the other. Undefined
      // still means "inherit", which is the previous behaviour when unset.
      cwd: this.config.properties?.["cwd"] as string | undefined,
    });
    const stderrPromise = cliShared.captureStderr(process.stderr);

    try {
      if (streamFormat === "stream-json") {
        yield* this.#streamJsonEvents(process, stderrPromise);
      } else {
        yield* this.#streamRawText(process, stderrPromise);
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
              provider: "claude-code",
              cause: err instanceof Error ? err : undefined,
            },
          ),
        };
      }
    } finally {
      // Also reached when the consumer stops reading early.
      await cliShared.stopCliProcess(process, stderrPromise);
    }
  }

  async *#streamStructuredReply(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent> {
    const result = await this.generateText(options, signal);

    if (results.isFail(result)) {
      yield { kind: "error", error: result.error };
      return;
    }

    for (const block of result.value.content) {
      if (block.kind === "text" && block.text !== "") {
        yield { kind: "content_delta", textDelta: block.text };
      } else if (block.kind === "tool_call") {
        yield { kind: "tool_call_delta", toolCall: block.toolCall };
      }
    }

    yield {
      kind: "message_done",
      stopReason: result.value.stopReason,
      usage: result.value.usage,
    };
  }

  async *#streamRawText(
    process: cliShared.CliProcess,
    stderrPromise: Promise<string>,
  ): AsyncIterable<generation.StreamEvent> {
    const decoder = new TextDecoder();
    const reader = process.stdout.getReader();

    try {
      let readResult = await reader.read();

      while (readResult.done !== true) {
        const text = decoder.decode(readResult.value, { stream: true });

        if (text.length > 0) {
          yield { kind: "content_delta", textDelta: text };
        }

        // Reads stay sequential: each chunk is yielded in order before the
        // next one is requested.
        // oxlint-disable-next-line no-await-in-loop
        readResult = await reader.read();
      }
    } finally {
      reader.releaseLock();
    }

    const exit = await process.waitForExit();
    const stderr = await stderrPromise;
    const exitError = cliShared.classifyExitCode(
      "claude-code",
      exit.code,
      stderr,
    );

    if (exitError !== null) {
      yield { kind: "error", error: exitError };
    } else {
      yield {
        kind: "message_done",
        stopReason: "end_turn",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }
  }

  async *#streamJsonEvents(
    process: cliShared.CliProcess,
    stderrPromise: Promise<string>,
  ): AsyncIterable<generation.StreamEvent> {
    for await (const event of cliShared.parseJsonlStream(process.stdout)) {
      const streamEvent = mapStreamEvent(event);

      if (streamEvent !== null) {
        yield streamEvent;
      }
    }

    const exit = await process.waitForExit();
    const stderr = await stderrPromise;
    const exitError = cliShared.classifyExitCode(
      "claude-code",
      exit.code,
      stderr,
    );

    if (exitError !== null) {
      yield { kind: "error", error: exitError };
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

export const claudeCodeFactory: model.ProviderFactory = {
  provider: "claude-code",
  createModel: async (
    cfg: config.ResolvedConfigTarget,
  ): Promise<model.LanguageModel> => {
    const binary = await cliShared.resolveBinary("claude", cfg);

    return new ClaudeCodeModel(binary, cfg);
  },
};

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Builds the claude CLI arguments for one request. Exported for tests.
 *
 * @throws {errors.BadRequestError} for a `json_schema` format without an
 * object `jsonSchema`.
 */
export const buildArgs = (
  cfg: config.ResolvedConfigTarget,
  options: generation.GenerateTextOptions,
  outputFormat: "json" | "text" | "stream-json",
): string[] => {
  const args: string[] = [];

  // "text" format streams raw text to stdout — no --output-format needed (it's the default)
  if (outputFormat !== "text") {
    args.push("--output-format", outputFormat);
  }

  // stream-json requires --verbose in Claude Code CLI
  if (outputFormat === "stream-json") {
    args.push("--verbose");
  }

  // Only when set. Pushed unconditionally, an empty model produced
  // `claude --model ` with a dangling flag, which the CLI rejects with exit 1 --
  // so a caller that legitimately wanted the CLI's own default could not express
  // it, and got a spawn failure instead.
  if (cfg.model !== "") {
    args.push("--model", cfg.model);
  }

  // Only limit turns if explicitly configured
  const maxTurns = cfg.properties?.["maxTurns"] as number | undefined;

  if (maxTurns !== undefined) {
    args.push("--max-turns", String(maxTurns));
  }

  // Note: claude CLI does not support --max-tokens; token limits are model-level

  const allowedTools = cfg.properties?.["allowedTools"] as string[] | undefined;

  if (allowedTools !== undefined) {
    for (const tool of allowedTools) {
      args.push("--allowedTools", tool);
    }
  }

  // Pass through additional CLI flags from properties
  const extraArgs = cfg.properties?.["args"] as string[] | undefined;

  if (extraArgs !== undefined) {
    args.push(...extraArgs);
  }

  // The CLI's --effort takes the same five levels as GenerateTextOptions.
  if (options.effort !== undefined) {
    args.push("--effort", options.effort);
  }

  const schema = jsonSchemaArg(options.responseFormat);
  if (schema !== null) {
    args.push("--json-schema", schema);
  }

  return args;
};

/**
 * Returns a json_schema format's schema as the CLI's `--json-schema` value, or
 * null when there is none to send. The CLI has no JSON mode without a schema,
 * so `json_object` and `text` send nothing, as on the `anthropic` provider.
 *
 * @throws {errors.BadRequestError} for a `json_schema` format without an
 * object `jsonSchema`.
 */
const jsonSchemaArg = (
  responseFormat: generation.ResponseFormat | undefined,
): string | null => {
  if (responseFormat?.type !== "json_schema") {
    return null;
  }

  return JSON.stringify(
    generation.requireJsonSchema(responseFormat, "claude-code"),
  );
};

export const parseJsonResult = (
  rawOutput: string,
  modelId: string,
): generation.GenerateTextResult => {
  const trimmed = rawOutput.trim();

  const plain = (text: string): generation.GenerateTextResult => ({
    content: [{ kind: "text", text }],
    stopReason: "end_turn",
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    modelId,
  });

  // 1. A single JSON value — either a result object or (Claude Code CLI v2
  //    `--output-format json`) an ARRAY of stream events
  //    [{type:"system"}, {type:"assistant"}, …, {type:"result", result}].
  try {
    const parsed = JSON.parse(trimmed);

    return Array.isArray(parsed)
      ? mapResultFromArray(parsed, modelId)
      : mapResultFromJson(parsed, modelId);
  } catch {
    // not a single JSON value — fall through
  }

  // 2. JSONL: one JSON event per line (other CLI versions stream this way).
  const events: unknown[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (l.length === 0) continue;
    try {
      events.push(JSON.parse(l));
    } catch {
      // skip non-JSON line
    }
  }
  if (events.length > 0) {
    return mapResultFromArray(events, modelId);
  }

  // 3. Not JSON at all → the model printed the bare line; use it. But never echo
  //    a JSON-looking blob back as a commit message (that's the bug we guard).
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return plain("");
  }

  return plain(trimmed);
};

/**
 * Reduce the Claude Code v2 event array to a single result. Prefers the
 * `{type:"result"}` event's `structured_output` (the reply to `--json-schema`)
 * or `result` field (the canonical final text), then the last
 * `{type:"assistant"}` message, delegating to {@link mapResultFromJson} for the
 * actual mapping.
 */
const mapResultFromArray = (
  events: readonly unknown[],
  modelId: string,
): generation.GenerateTextResult => {
  const isObj = (e: unknown): e is Record<string, unknown> =>
    e !== null && typeof e === "object";

  const resultEvent = events.find(
    (e) =>
      isObj(e) &&
      e["type"] === "result" &&
      (e["result"] !== undefined || e["structured_output"] !== undefined),
  );
  if (resultEvent !== undefined) {
    return mapResultFromJson(resultEvent, modelId);
  }

  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (isObj(e) && e["type"] === "assistant" && isObj(e["message"])) {
      return mapResultFromJson(e, modelId);
    }
  }

  // Nothing recognizable — return empty text rather than the raw transcript.
  return {
    content: [{ kind: "text", text: "" }],
    stopReason: "end_turn",
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    modelId,
  };
};

const mapResultFromJson = (
  // The response is untyped vendor JSON; only the mapped fields are read.
  // oxlint-disable-next-line typescript/no-explicit-any
  parsed: any,
  modelId: string,
): generation.GenerateTextResult => {
  const contentBlocks: types.ContentBlock[] = [];

  // With --json-schema, the reply is the result event's structured_output, not
  // its result field. Otherwise Claude Code JSON output has { result: "text" }
  // or { type: "result", result: "text" }.
  if (
    parsed.structured_output !== undefined &&
    parsed.structured_output !== null
  ) {
    contentBlocks.push({
      kind: "text",
      text: JSON.stringify(parsed.structured_output),
    });
  } else if (parsed.result !== undefined) {
    contentBlocks.push({ kind: "text", text: String(parsed.result) });
  } else if (parsed.message?.content !== undefined) {
    for (const block of parsed.message.content) {
      if (block.type === "text") {
        contentBlocks.push({ kind: "text", text: block.text });
      } else if (block.type === "tool_use") {
        contentBlocks.push({
          kind: "tool_call",
          toolCall: {
            id: block.id ?? block.name,
            name: block.name,
            arguments: block.input ?? {},
          },
        });
      }
    }
  } else if (typeof parsed === "string") {
    contentBlocks.push({ kind: "text", text: parsed });
  }

  if (contentBlocks.length === 0) {
    // Unrecognized shape: emit empty text rather than dumping the raw JSON as
    // if it were the model's answer (that produced the JSON-as-commit-msg bug).
    contentBlocks.push({ kind: "text", text: "" });
  }

  return {
    content: contentBlocks,
    stopReason: mapStopReason(
      parsed.stop_reason ?? parsed.message?.stop_reason,
    ),
    usage: {
      inputTokens: parsed.usage?.input_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
      totalTokens:
        (parsed.usage?.input_tokens ?? 0) + (parsed.usage?.output_tokens ?? 0),
    },
    modelId,
    rawResponse: parsed,
  };
};

/**
 * Maps the stop reason the CLI reports. A declined request stays a refusal, so
 * a caller can tell it from an answer.
 */
const mapStopReason = (reason: unknown): generation.StopReason => {
  if (reason === "tool_use") {
    return "tool_use";
  }
  if (reason === "refusal") {
    return "refusal";
  }

  return "end_turn";
};

const mapStreamEvent = (event: unknown): generation.StreamEvent | null => {
  if (event === null || typeof event !== "object") {
    return null;
  }

  // Stream events are untyped JSON; each field is checked before use.
  // oxlint-disable-next-line typescript/no-explicit-any
  const obj = event as any;

  // Claude Code stream-json events
  if (obj.type === "assistant") {
    // Message content event
    if (obj.message?.content !== undefined) {
      for (const block of obj.message.content) {
        if (block.type === "text") {
          return { kind: "content_delta", textDelta: block.text };
        }
      }
    }

    return null;
  }

  if (obj.type === "content_block_delta") {
    if (obj.delta?.type === "text_delta") {
      return { kind: "content_delta", textDelta: obj.delta.text };
    }

    return null;
  }

  if (obj.type === "result") {
    return {
      kind: "message_done",
      stopReason:
        obj.subtype === "tool_use"
          ? "tool_use"
          : mapStopReason(obj.stop_reason),
      usage: {
        inputTokens: obj.usage?.input_tokens ?? 0,
        outputTokens: obj.usage?.output_tokens ?? 0,
        totalTokens:
          (obj.usage?.input_tokens ?? 0) + (obj.usage?.output_tokens ?? 0),
      },
    };
  }

  if (obj.type === "error") {
    return {
      kind: "error",
      error: new errors.AiError(
        obj.error?.message ?? "Unknown Claude Code error",
        { provider: "claude-code" },
      ),
    };
  }

  // Generic text content
  if (obj.content !== undefined && typeof obj.content === "string") {
    return { kind: "content_delta", textDelta: obj.content };
  }

  return null;
};
