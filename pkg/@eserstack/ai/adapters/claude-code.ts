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

  args.push("--model", cfg.model);

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

const parseJsonResult = (
  rawOutput: string,
  modelId: string,
): generation.GenerateTextResult => {
  try {
    const parsed = JSON.parse(rawOutput);

    return mapResultFromJson(parsed, modelId);
  } catch {
    // If JSON parsing fails, treat as plain text
    return {
      content: [{ kind: "text", text: rawOutput.trim() }],
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      modelId,
    };
  }
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
    contentBlocks.push({ kind: "text", text: JSON.stringify(parsed) });
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
