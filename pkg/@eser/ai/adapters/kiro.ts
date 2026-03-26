// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as types from "../types.ts";
import type * as config from "../config.ts";
import type * as generation from "../generation.ts";
import type * as model from "../model.ts";
import * as errors from "../errors.ts";
import * as cliShared from "./cli-shared.ts";

// =============================================================================
// Kiro Model
// =============================================================================

export class KiroModel implements model.LanguageModel {
  readonly capabilities: readonly types.ProviderCapability[] = [
    "text_generation",
    "streaming",
  ];
  readonly provider = "kiro";
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
  ): Promise<generation.GenerateTextResult> {
    const args = buildArgs(this.config, options);
    const prompt = cliShared.formatMessagesAsText(
      options.messages,
      options.system,
    );
    args.push("--prompt", prompt);

    const process = cliShared.spawnCliProcess(this.binary, args, { signal });
    const stderrPromise = cliShared.captureStderr(process.stderr);

    const result = await cliShared.parseTextOutput(
      process.stdout,
      this.modelId,
    );
    const exit = await process.waitForExit();
    const stderr = await stderrPromise;
    const exitError = cliShared.classifyExitCode("kiro", exit.code, stderr);

    if (exitError !== null) {
      throw exitError;
    }

    return result;
  }

  async *streamText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent> {
    const args = buildArgs(this.config, options);
    const prompt = cliShared.formatMessagesAsText(
      options.messages,
      options.system,
    );
    args.push("--prompt", prompt);

    const process = cliShared.spawnCliProcess(this.binary, args, { signal });
    const stderrPromise = cliShared.captureStderr(process.stderr);

    try {
      // Try parsing as JSONL first; fall back to plain text streaming
      const decoder = new TextDecoder();
      const reader = process.stdout.getReader();
      let buffer = "";

      let readResult = await reader.read();

      while (readResult.done !== true) {
        buffer += decoder.decode(readResult.value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.length === 0) {
            continue;
          }

          // Try JSON parse for structured output
          try {
            const parsed = JSON.parse(trimmed);
            const streamEvent = mapStreamEvent(parsed);

            if (streamEvent !== null) {
              yield streamEvent;
              continue;
            }
          } catch {
            // Not JSON — emit as text delta
          }

          yield { kind: "content_delta", textDelta: trimmed + "\n" };
        }

        readResult = await reader.read();
      }

      reader.releaseLock();

      // Flush remaining buffer
      if (buffer.trim().length > 0) {
        yield { kind: "content_delta", textDelta: buffer.trim() };
      }

      const exit = await process.waitForExit();
      const stderr = await stderrPromise;
      const exitError = cliShared.classifyExitCode("kiro", exit.code, stderr);

      if (exitError !== null) {
        yield { kind: "error", error: exitError };
      } else {
        yield {
          kind: "message_done",
          stopReason: "end_turn",
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        };
      }
    } catch (err) {
      if (err instanceof errors.AiError) {
        yield { kind: "error", error: err };
      } else {
        yield {
          kind: "error",
          error: new errors.AiError(
            err instanceof Error ? err.message : String(err),
            { provider: "kiro", cause: err instanceof Error ? err : undefined },
          ),
        };
      }
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

export const kiroFactory: model.ProviderFactory = {
  provider: "kiro",
  async createModel(
    cfg: config.ResolvedConfigTarget,
  ): Promise<model.LanguageModel> {
    const binary = await cliShared.resolveBinary("kiro", cfg);

    return new KiroModel(binary, cfg);
  },
};

// =============================================================================
// Internal Helpers
// =============================================================================

const buildArgs = (
  cfg: config.ResolvedConfigTarget,
  options: generation.GenerateTextOptions,
): string[] => {
  const args: string[] = [];

  args.push("--output", "json");
  args.push("--model", cfg.model);

  if (options.maxTokens !== undefined) {
    args.push("--max-tokens", String(options.maxTokens));
  }

  // Pass through additional CLI flags from properties
  const extraArgs = cfg.properties?.["args"] as string[] | undefined;

  if (extraArgs !== undefined) {
    args.push(...extraArgs);
  }

  return args;
};

const mapStreamEvent = (
  event: unknown,
): generation.StreamEvent | null => {
  if (event === null || typeof event !== "object") {
    return null;
  }

  // deno-lint-ignore no-explicit-any
  const obj = event as any;

  // Content
  if (obj.type === "content" || obj.type === "text") {
    const text = obj.text ?? obj.content;

    if (text !== undefined) {
      return { kind: "content_delta", textDelta: String(text) };
    }

    return null;
  }

  // Done
  if (obj.type === "done" || obj.type === "result" || obj.done === true) {
    return {
      kind: "message_done",
      stopReason: "end_turn",
      usage: {
        inputTokens: obj.usage?.input_tokens ?? 0,
        outputTokens: obj.usage?.output_tokens ?? 0,
        totalTokens: (obj.usage?.input_tokens ?? 0) +
          (obj.usage?.output_tokens ?? 0),
      },
    };
  }

  // Error
  if (obj.type === "error") {
    return {
      kind: "error",
      error: new errors.AiError(
        obj.error?.message ?? obj.message ?? "Unknown Kiro error",
        { provider: "kiro" },
      ),
    };
  }

  return null;
};
