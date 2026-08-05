// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as results from "@eserstack/primitives/results";
import type * as types from "../types.ts";
import type * as config from "../config.ts";
import type * as generation from "../generation.ts";
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
    const args = buildArgs(this.config, options, "json");
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

    const reader = process.stdout.getReader();
    const chunks: string[] = [];
    const decoder = new TextDecoder();

    let readResult = await reader.read();

    while (readResult.done !== true) {
      chunks.push(decoder.decode(readResult.value, { stream: true }));
      readResult = await reader.read();
    }

    reader.releaseLock();

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
  }

  async *streamText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent> {
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
    }
  }

  async *#streamRawText(
    process: cliShared.CliProcess,
    stderrPromise: Promise<string>,
  ): AsyncIterable<generation.StreamEvent> {
    const decoder = new TextDecoder();
    const reader = process.stdout.getReader();

    let readResult = await reader.read();

    while (readResult.done !== true) {
      const text = decoder.decode(readResult.value, { stream: true });

      if (text.length > 0) {
        yield { kind: "content_delta", textDelta: text };
      }

      readResult = await reader.read();
    }

    reader.releaseLock();

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
  async createModel(
    cfg: config.ResolvedConfigTarget,
  ): Promise<model.LanguageModel> {
    const binary = await cliShared.resolveBinary("claude", cfg);

    return new ClaudeCodeModel(binary, cfg);
  },
};

// =============================================================================
// Internal Helpers
// =============================================================================

const buildArgs = (
  cfg: config.ResolvedConfigTarget,
  _options: generation.GenerateTextOptions,
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

  return args;
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
 * `{type:"result"}` event's `result` field (the canonical final text), then the
 * last `{type:"assistant"}` message, delegating to {@link mapResultFromJson} for
 * the actual mapping.
 */
const mapResultFromArray = (
  events: readonly unknown[],
  modelId: string,
): generation.GenerateTextResult => {
  const isObj = (e: unknown): e is Record<string, unknown> =>
    e !== null && typeof e === "object";

  const resultEvent = events.find(
    (e) => isObj(e) && e["type"] === "result" && e["result"] !== undefined,
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
  // deno-lint-ignore no-explicit-any
  parsed: any,
  modelId: string,
): generation.GenerateTextResult => {
  const contentBlocks: types.ContentBlock[] = [];

  // Claude Code JSON output has { result: "text" } or { type: "result", result: "text" }
  if (parsed.result !== undefined) {
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
    stopReason: parsed.stop_reason === "tool_use" ? "tool_use" : "end_turn",
    usage: {
      inputTokens: parsed.usage?.input_tokens ?? 0,
      outputTokens: parsed.usage?.output_tokens ?? 0,
      totalTokens: (parsed.usage?.input_tokens ?? 0) +
        (parsed.usage?.output_tokens ?? 0),
    },
    modelId,
    rawResponse: parsed,
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
      stopReason: obj.subtype === "tool_use" ? "tool_use" : "end_turn",
      usage: {
        inputTokens: obj.usage?.input_tokens ?? 0,
        outputTokens: obj.usage?.output_tokens ?? 0,
        totalTokens: (obj.usage?.input_tokens ?? 0) +
          (obj.usage?.output_tokens ?? 0),
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
