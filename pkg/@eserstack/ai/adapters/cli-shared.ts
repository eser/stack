// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as shellExec from "@eserstack/shell/exec";
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
    const resolved = await shellExec.exec`which ${defaultName}`
      .noThrow()
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
  readonly waitForExit: () => Promise<{
    readonly code: number;
    readonly success: boolean;
  }>;
  /** Sends the signal (SIGTERM by default); does nothing once it has exited. */
  readonly kill: (signal?: string) => void;
};

export type SpawnOptions = {
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly signal?: AbortSignal;
  /** Data to pipe to stdin. When set, stdin is piped and closed after writing. */
  readonly stdinData?: string;
};

export const spawnCliProcess = (
  binary: string,
  args: readonly string[],
  options?: SpawnOptions,
): CliProcess => {
  const useStdinPipe = options?.stdinData !== undefined;
  const builder = new shellExec.CommandBuilder(binary, [...args], {
    stdin: useStdinPipe ? "piped" : "null",
    stdout: "piped",
    stderr: "piped",
    cwd: options?.cwd,
    env: options?.env,
  });

  const child = builder.child();

  // Write stdin data and close
  if (useStdinPipe && child.stdin !== null) {
    const encoder = new TextEncoder();
    const writer = child.stdin.getWriter();
    writer
      .write(encoder.encode(options!.stdinData!))
      .then(() => writer.close())
      .catch(() => {
        // The write fails only when the CLI has already exited; its exit code
        // and stderr tell the caller how it ended.
      });
  }

  const signal = options?.signal;
  let exited = false;

  // An exited process is never signalled: its pid may belong to another
  // process by then.
  const kill = (name?: string): void => {
    if (!exited) {
      child.kill(name ?? "SIGTERM");
    }
  };
  const onAbort = (): void => kill();

  const status = child.status.then((result) => {
    exited = true;
    // A long-lived signal would otherwise hold one listener per request.
    signal?.removeEventListener("abort", onAbort);

    return result;
  });

  if (signal?.aborted === true) {
    kill();
  } else {
    signal?.addEventListener("abort", onAbort, { once: true });
  }

  return {
    stdout: child.stdout!,
    stderr: child.stderr!,
    waitForExit: async () => {
      const result = await status;

      return { code: result.code, success: result.success };
    },
    kill,
  };
};

/**
 * Ends a CLI process when the caller is done with it: kills it if it is still
 * running, then waits for its stderr capture to end, which happens when the
 * process exits. Call it from `finally` in the scope that spawned the process.
 * A stream whose consumer stops early otherwise leaves the CLI running, blocked
 * on a stdout pipe that nobody reads.
 */
export const stopCliProcess = async (
  process: CliProcess,
  stderrPromise: Promise<string>,
): Promise<void> => {
  process.kill();

  // The capture is awaited instead of the exit status: the native child
  // settles its streams on every path, but leaves its status pending after a
  // failed read.
  try {
    await stderrPromise;
  } catch {
    // stderr fails only together with stdout, whose read already reported the
    // error to the caller, or was abandoned by a caller that stopped reading.
  }
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

      // Reads stay sequential: each chunk extends the line buffer, and the
      // consumer pulls lines one at a time.
      // deno-lint-ignore no-await-in-loop
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
  const chunks: string[] = [];

  for await (const chunk of stdout) {
    chunks.push(decoder.decode(chunk, { stream: true }));
  }

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
  const chunks: string[] = [];

  for await (const chunk of stderr) {
    chunks.push(decoder.decode(chunk, { stream: true }));
  }

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

  const message =
    stderr.length > 0
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
