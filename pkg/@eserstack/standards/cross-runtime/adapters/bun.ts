// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Bun runtime adapter.
 * Composes node-shared (fs, path, env, process) with Bun-specific
 * spawn/spawnChild via Bun.spawn.
 *
 * @module
 */

import type {
  ChildProcess,
  ProcessOutput,
  ProcessStatus,
  Runtime,
  RuntimeCapabilities,
  SpawnOptions,
} from "../types.ts";
import * as shared from "./shared.ts";
import * as nodeShared from "./node-shared.ts";

/**
 * Bun capabilities - full capabilities, no native KV.
 */
export const BUN_CAPABILITIES: RuntimeCapabilities = {
  fs: true,
  fsSync: true,
  exec: true,
  process: true,
  env: true,
  stdin: true,
  stdout: true,
  kv: false,
} as const;

// Bun global type
declare const Bun: {
  version: string;
  spawn: (
    cmd: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      stdin?: "inherit" | "pipe" | "ignore" | null;
      stdout?: "inherit" | "pipe" | "ignore" | null;
      stderr?: "inherit" | "pipe" | "ignore" | null;
    },
  ) => {
    pid: number;
    exited: Promise<number>;
    stdin: WritableStream<Uint8Array> | null;
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
    kill: (signal?: number | string) => void;
  };
};

// =============================================================================
// Bun-specific Spawn
// =============================================================================

const readStream = async (
  stream: ReadableStream<Uint8Array> | null,
): Promise<Uint8Array> => {
  if (!stream) return new Uint8Array(0);

  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
};

const bunSpawn = async (
  cmd: string,
  args: string[] = [],
  options?: SpawnOptions,
): Promise<ProcessOutput> => {
  const [stdinMode, stdoutMode, stderrMode] = shared.getNodeStdioArray(
    options,
  );
  const proc = Bun.spawn([cmd, ...args], {
    cwd: options?.cwd,
    env: options?.env,
    stdin: stdinMode,
    stdout: stdoutMode,
    stderr: stderrMode,
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    readStream(proc.stdout),
    readStream(proc.stderr),
  ]);

  return {
    success: exitCode === 0,
    code: exitCode,
    stdout,
    stderr,
  };
};

const bunSpawnChild = (
  cmd: string,
  args: string[] = [],
  options?: SpawnOptions,
): ChildProcess => {
  const [stdinMode, stdoutMode, stderrMode] = shared.getNodeStdioArray(
    options,
  );
  const proc = Bun.spawn([cmd, ...args], {
    cwd: options?.cwd,
    env: options?.env,
    stdin: stdinMode,
    stdout: stdoutMode,
    stderr: stderrMode,
  });

  const statusPromise = proc.exited.then(
    (code): ProcessStatus => ({
      success: code === 0,
      code,
      signal: undefined,
    }),
  );

  return {
    pid: proc.pid,
    stdin: proc.stdin,
    stdout: proc.stdout,
    stderr: proc.stderr,
    status: statusPromise,
    output: async (): Promise<ProcessOutput> => {
      const [status, stdout, stderr] = await Promise.all([
        statusPromise,
        readStream(proc.stdout),
        readStream(proc.stderr),
      ]);
      return {
        success: status.success,
        code: status.code,
        stdout,
        stderr,
      };
    },
    kill: (signal?: string): void => {
      proc.kill(signal);
    },
  };
};

// =============================================================================
// Runtime Factory
// =============================================================================

/**
 * Creates a Bun runtime instance.
 * Composes: node-shared (fs, path, env, process) + shared exec (exec, execJson)
 * + Bun-specific spawn/spawnChild via Bun.spawn.
 */
export const createBunRuntime = (): Runtime => ({
  name: "bun",
  version: Bun.version,
  capabilities: BUN_CAPABILITIES as RuntimeCapabilities,
  fs: nodeShared.createNodeCompatFs(),
  path: nodeShared.createNodeCompatPath(),
  exec: shared.createSharedExec(bunSpawn, bunSpawnChild),
  env: nodeShared.createNodeCompatEnv(),
  process: nodeShared.createNodeCompatProcess(),
});
