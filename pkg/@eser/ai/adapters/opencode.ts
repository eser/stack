// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as types from "../types.ts";
import type * as config from "../config.ts";
import type * as generation from "../generation.ts";
import type * as model from "../model.ts";
import * as errors from "../errors.ts";
import * as cliShared from "./cli-shared.ts";

// =============================================================================
// OpenCode Model
// =============================================================================

export class OpenCodeModel implements model.LanguageModel {
  readonly capabilities: readonly types.ProviderCapability[] = [
    "text_generation",
    "streaming",
  ];
  readonly provider = "opencode";
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
    const args = buildArgs(this.config, options, "json");
    const prompt = cliShared.formatMessagesAsText(
      options.messages,
      options.system,
    );
    args.push("-p", prompt);

    const process = cliShared.spawnCliProcess(this.binary, args, { signal });
    const stderrPromise = cliShared.captureStderr(process.stderr);

    const result = await cliShared.parseTextOutput(
      process.stdout,
      this.modelId,
    );
    const exit = await process.waitForExit();
    const stderr = await stderrPromise;
    const exitError = cliShared.classifyExitCode("opencode", exit.code, stderr);

    if (exitError !== null) {
      throw exitError;
    }

    return result;
  }

  async *streamText(
    options: generation.GenerateTextOptions,
    signal?: AbortSignal,
  ): AsyncIterable<generation.StreamEvent> {
    const args = buildArgs(this.config, options, "stream-json");
    const prompt = cliShared.formatMessagesAsText(
      options.messages,
      options.system,
    );
    args.push("-p", prompt);

    const process = cliShared.spawnCliProcess(this.binary, args, { signal });
    const stderrPromise = cliShared.captureStderr(process.stderr);

    try {
      for await (const event of cliShared.parseJsonlStream(process.stdout)) {
        const streamEvent = mapStreamEvent(event);

        if (streamEvent !== null) {
          yield streamEvent;
        }
      }

      const exit = await process.waitForExit();
      const stderr = await stderrPromise;
      const exitError = cliShared.classifyExitCode(
        "opencode",
        exit.code,
        stderr,
      );

      if (exitError !== null) {
        yield { kind: "error", error: exitError };
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
              provider: "opencode",
              cause: err instanceof Error ? err : undefined,
            },
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

export const openCodeFactory: model.ProviderFactory = {
  provider: "opencode",
  async createModel(
    cfg: config.ResolvedConfigTarget,
  ): Promise<model.LanguageModel> {
    const binary = await cliShared.resolveBinary("opencode", cfg);

    return new OpenCodeModel(binary, cfg);
  },
};

// =============================================================================
// Internal Helpers
// =============================================================================

const buildArgs = (
  cfg: config.ResolvedConfigTarget,
  options: generation.GenerateTextOptions,
  outputFormat: "json" | "stream-json",
): string[] => {
  const args: string[] = [
    "--output-format",
    outputFormat,
  ];

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

  // Content delta
  if (obj.type === "content_block_delta" || obj.type === "assistant") {
    const text = obj.delta?.text ?? obj.message?.content?.[0]?.text;

    if (text !== undefined) {
      return { kind: "content_delta", textDelta: text };
    }

    return null;
  }

  // Result / done
  if (obj.type === "result" || obj.done === true) {
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
        obj.error?.message ?? "Unknown OpenCode error",
        { provider: "opencode" },
      ),
    };
  }

  // Generic text content
  if (obj.content !== undefined && typeof obj.content === "string") {
    return { kind: "content_delta", textDelta: obj.content };
  }

  return null;
};
