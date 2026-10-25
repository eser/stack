// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Node.js runtime adapter.
 * Composes node-shared (fs, path, env, process) with Node-specific
 * spawn/spawnChild via node:child_process.
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
import * as deps from "./deps.ts";
import * as shared from "./shared.ts";
import * as nodeHttp from "./node-http.ts";
import * as nodeShared from "./node-shared.ts";

/**
 * Node.js capabilities - full capabilities, no native KV.
 */
export const NODE_CAPABILITIES: RuntimeCapabilities = {
  fs: true,
  fsSync: true,
  exec: true,
  process: true,
  env: true,
  stdin: true,
  stdout: true,
  http: true,
} as const;

// =============================================================================
// Node-specific Spawn
// =============================================================================

const nodeSpawn = (
  cmd: string,
  args?: string[],
  options?: SpawnOptions,
): Promise<ProcessOutput> => {
  return new Promise((resolve, reject) => {
    const stdio = shared.getNodeStdioArray(options);

    if (options?.stdinText !== undefined) {
      stdio[0] = "pipe";
    }

    const proc = deps.childProcess.spawn(cmd, args ?? [], {
      cwd: options?.cwd,
      env: options?.env !== undefined
        ? { ...deps.process.env, ...options.env }
        : undefined,
      stdio,
      signal: options?.signal,
    });

    if (options?.stdinText !== undefined && proc.stdin !== null) {
      // A process that exits without draining stdin closes the pipe, which
      // surfaces here as EPIPE. That is the process's business, not a failure
      // of this call -- its exit code is the outcome that matters.
      proc.stdin.on("error", () => {});
      proc.stdin.end(options.stdinText);
    }

    const stdoutChunks: deps.buffer.Buffer[] = [];
    const stderrChunks: deps.buffer.Buffer[] = [];

    proc.stdout?.on(
      "data",
      (chunk: deps.buffer.Buffer) => stdoutChunks.push(chunk),
    );
    proc.stderr?.on(
      "data",
      (chunk: deps.buffer.Buffer) => stderrChunks.push(chunk),
    );

    proc.on("error", reject);
    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        code: code ?? 1,
        stdout: new Uint8Array(deps.buffer.Buffer.concat(stdoutChunks)),
        stderr: new Uint8Array(deps.buffer.Buffer.concat(stderrChunks)),
      });
    });
  });
};

const nodeSpawnChild = (
  cmd: string,
  args?: string[],
  options?: SpawnOptions,
): ChildProcess => {
  const proc = deps.childProcess.spawn(cmd, args ?? [], {
    cwd: options?.cwd,
    env: options?.env !== undefined
      ? { ...deps.process.env, ...options.env }
      : undefined,
    stdio: shared.getNodeStdioArray(options),
    signal: options?.signal,
  });

  const stdoutChunks: deps.buffer.Buffer[] = [];
  const stderrChunks: deps.buffer.Buffer[] = [];

  proc.stdout?.on(
    "data",
    (chunk: deps.buffer.Buffer) => stdoutChunks.push(chunk),
  );
  proc.stderr?.on(
    "data",
    (chunk: deps.buffer.Buffer) => stderrChunks.push(chunk),
  );

  const statusPromise = new Promise<ProcessStatus>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code, signal) => {
      resolve({
        success: code === 0,
        code: code ?? 1,
        signal: signal ?? undefined,
      });
    });
  });

  return {
    pid: proc.pid!,
    stdin: proc.stdin !== null
      ? (deps.stream.Writable.toWeb(proc.stdin) as WritableStream<Uint8Array>)
      : null,
    stdout: proc.stdout !== null
      ? (deps.stream.Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>)
      : null,
    stderr: proc.stderr !== null
      ? (deps.stream.Readable.toWeb(proc.stderr) as ReadableStream<Uint8Array>)
      : null,
    status: statusPromise,
    output: async (): Promise<ProcessOutput> => {
      const status = await statusPromise;
      return {
        success: status.success,
        code: status.code,
        stdout: new Uint8Array(deps.buffer.Buffer.concat(stdoutChunks)),
        stderr: new Uint8Array(deps.buffer.Buffer.concat(stderrChunks)),
      };
    },
    kill: (signal?: string): void => {
      proc.kill(signal as NodeJS.Signals);
    },
  };
};

// =============================================================================
// Runtime Factory
// =============================================================================

/**
 * Creates a Node.js runtime instance.
 * Composes: node-shared (fs, path, env, process) + shared exec (exec, execJson)
 * + Node-specific spawn/spawnChild + node-http (serve, upgradeWebSocket).
 */
export const createNodeRuntime = (): Runtime => ({
  name: "node",
  version: deps.process.versions.node,
  capabilities: NODE_CAPABILITIES as RuntimeCapabilities,
  fs: nodeShared.createNodeCompatFs(),
  path: nodeShared.createNodeCompatPath(),
  exec: shared.createSharedExec(nodeSpawn, nodeSpawnChild),
  env: nodeShared.createNodeCompatEnv(),
  process: nodeShared.createNodeCompatProcess(),
  http: nodeHttp.createNodeHttp(),
});
