// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as shellExec from "@eser/shell/exec";
import type * as config from "../config.ts";
import type * as generation from "../generation.ts";
import type * as types from "../types.ts";
import * as errors from "../errors.ts";

// =============================================================================
// Binary Resolution
// =============================================================================

export const resolveBinary = async (
  defaultName: string,
  cfg: config.ResolvedConfigTarget,
): Promise<string> => {
  const binPath = cfg.properties?.["binPath"] as string | undefined;

  if (binPath !== undefined) {
    return binPath;
  }

  // Try to find the binary on PATH via `which`
  try {
    const resolved = await shellExec.exec`which ${defaultName}`.noThrow()
      .text();

    if (resolved.length > 0) {
      return resolved;
    }
  } catch {
    // Fall through to error
  }

  throw new errors.AiError(
    `Binary "${defaultName}" not found. Set properties.binPath in config or ensure it is on PATH.`,
    { provider: defaultName },
  );
};

// =============================================================================
// Process Spawning
// =============================================================================

export type CliProcess = {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly waitForExit: () => Promise<
    { readonly code: number; readonly success: boolean }
  >;
  readonly kill: (signal?: string) => void;
};

export const spawnCliProcess = (
  binary: string,
  args: readonly string[],
  options?: {
    readonly cwd?: string;
    readonly env?: Record<string, string>;
    readonly signal?: AbortSignal;
  },
): CliProcess => {
  const builder = new shellExec.CommandBuilder(binary, [...args], {
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
    cwd: options?.cwd,
    env: options?.env,
  });

  const child = builder.child();

  // Wire up AbortSignal → kill
  if (options?.signal !== undefined) {
    const signal = options.signal;

    if (signal.aborted) {
      child.kill("SIGTERM");
    } else {
      signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
      }, { once: true });
    }
  }

  return {
    stdout: child.stdout!,
    stderr: child.stderr!,
    waitForExit: async () => {
      const status = await child.status;

      return { code: status.code, success: status.success };
    },
    kill: (signal?: string) => {
      child.kill(signal ?? "SIGTERM");
    },
  };
};

// =============================================================================
// JSONL Stream Parsing
// =============================================================================

const decoder = new TextDecoder();

export async function* parseJsonlStream(
  stdout: ReadableStream<Uint8Array>,
): AsyncIterable<unknown> {
  const reader = stdout.getReader();
  let buffer = "";

  try {
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

        try {
          yield JSON.parse(trimmed);
        } catch {
          // Skip malformed lines
        }
      }

      readResult = await reader.read();
    }

    // Flush remaining buffer
    const remaining = buffer.trim();

    if (remaining.length > 0) {
      try {
        yield JSON.parse(remaining);
      } catch {
        // Skip malformed trailing data
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// =============================================================================
// Plain Text Output Parsing
// =============================================================================

export const parseTextOutput = async (
  stdout: ReadableStream<Uint8Array>,
  modelId: string,
): Promise<generation.GenerateTextResult> => {
  const reader = stdout.getReader();
  const chunks: string[] = [];

  let readResult = await reader.read();

  while (readResult.done !== true) {
    chunks.push(decoder.decode(readResult.value, { stream: true }));
    readResult = await reader.read();
  }

  reader.releaseLock();

  const text = chunks.join("").trim();

  return {
    content: [{ kind: "text", text }],
    stopReason: "end_turn",
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    modelId,
  };
};

// =============================================================================
// Stderr Capture
// =============================================================================

export const captureStderr = async (
  stderr: ReadableStream<Uint8Array>,
): Promise<string> => {
  const reader = stderr.getReader();
  const chunks: string[] = [];

  let readResult = await reader.read();

  while (readResult.done !== true) {
    chunks.push(decoder.decode(readResult.value, { stream: true }));
    readResult = await reader.read();
  }

  reader.releaseLock();

  return chunks.join("").trim();
};

// =============================================================================
// Exit Code Classification
// =============================================================================

export const classifyExitCode = (
  provider: string,
  code: number,
  stderr: string,
): errors.AiError | null => {
  if (code === 0) {
    return null;
  }

  const message = stderr.length > 0
    ? `${provider} exited with code ${code}: ${stderr}`
    : `${provider} exited with code ${code}`;

  // Common exit code patterns
  if (code === 1) {
    return new errors.AiError(message, { provider });
  }
  if (code === 126 || code === 127) {
    return new errors.AiError(
      `${provider} binary not found or not executable (exit code ${code})`,
      { provider },
    );
  }

  return new errors.AiError(message, { provider });
};

// =============================================================================
// Message Formatting
// =============================================================================

export const formatMessagesAsText = (
  messages: readonly types.Message[],
  system?: string,
): string => {
  const parts: string[] = [];

  if (system !== undefined) {
    parts.push(system);
    parts.push("");
  }

  for (const message of messages) {
    for (const block of message.content) {
      if (block.kind === "text") {
        parts.push(block.text);
      }
    }
  }

  return parts.join("\n");
};
