// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Node.js runtime adapter.
 * Composes node-shared (fs, path, env, process) with Node-specific
 * spawn/spawnChild via node:child_process.
 *
 * @module
 */

import * as nodeChildProcess from "node:child_process";
import nodeProcess from "node:process";
import { Buffer } from "node:buffer";
import { Readable, Writable } from "node:stream";
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
  kv: false,
} as const;

// =============================================================================
// Node-specific Spawn
// =============================================================================

const nodeSpawn = (
  cmd: string,
  args: string[] = [],
  options?: SpawnOptions,
): Promise<ProcessOutput> => {
  return new Promise((resolve, reject) => {
    const proc = nodeChildProcess.spawn(cmd, args, {
      cwd: options?.cwd,
      env: options?.env ? { ...nodeProcess.env, ...options.env } : undefined,
      stdio: shared.getNodeStdioArray(options),
      signal: options?.signal,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    proc.on("error", reject);
    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        code: code ?? 1,
        stdout: new Uint8Array(Buffer.concat(stdoutChunks)),
        stderr: new Uint8Array(Buffer.concat(stderrChunks)),
      });
    });
  });
};

const nodeSpawnChild = (
  cmd: string,
  args: string[] = [],
  options?: SpawnOptions,
): ChildProcess => {
  const proc = nodeChildProcess.spawn(cmd, args, {
    cwd: options?.cwd,
    env: options?.env ? { ...nodeProcess.env, ...options.env } : undefined,
    stdio: shared.getNodeStdioArray(options),
    signal: options?.signal,
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  proc.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

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
    stdin: proc.stdin
      ? (Writable.toWeb(proc.stdin) as WritableStream<Uint8Array>)
      : null,
    stdout: proc.stdout
      ? (Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>)
      : null,
    stderr: proc.stderr
      ? (Readable.toWeb(proc.stderr) as ReadableStream<Uint8Array>)
      : null,
    status: statusPromise,
    output: async (): Promise<ProcessOutput> => {
      const status = await statusPromise;
      return {
        success: status.success,
        code: status.code,
        stdout: new Uint8Array(Buffer.concat(stdoutChunks)),
        stderr: new Uint8Array(Buffer.concat(stderrChunks)),
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
 * + Node-specific spawn/spawnChild.
 */
export const createNodeRuntime = (): Runtime => ({
  name: "node",
  version: nodeProcess.versions.node,
  capabilities: NODE_CAPABILITIES as RuntimeCapabilities,
  fs: nodeShared.createNodeCompatFs(),
  path: nodeShared.createNodeCompatPath(),
  exec: shared.createSharedExec(nodeSpawn, nodeSpawnChild),
  env: nodeShared.createNodeCompatEnv(),
  process: nodeShared.createNodeCompatProcess(),
});
