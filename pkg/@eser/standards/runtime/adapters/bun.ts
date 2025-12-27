// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Bun runtime adapter.
 * Implements the Runtime interface using Bun-native and Node.js-compatible APIs.
 *
 * @module
 */

// Bun provides Node.js compatibility, so we use node: imports for fs and path
// but use Bun-native APIs where they're more efficient (e.g., Bun.spawn)
import * as nodeFsPromises from "node:fs/promises";
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as nodeOs from "node:os";
import nodeProcess from "node:process";
import { Readable, Writable } from "node:stream";
import type {
  ChildProcess,
  DirEntry,
  FileInfo,
  FileOptions,
  MakeTempOptions,
  MkdirOptions,
  ParsedPath,
  ProcessOutput,
  ProcessStatus,
  RemoveOptions,
  Runtime,
  RuntimeCapabilities,
  RuntimeEnv,
  RuntimeExec,
  RuntimeFs,
  RuntimePath,
  RuntimeProcess,
  SpawnOptions,
  WriteFileOptions,
} from "../types.ts";
import { NotFoundError, ProcessError } from "../types.ts";
import { getNodeStdioArray } from "./shared.ts";

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
// Filesystem Adapter
// =============================================================================

const createBunFs = (): RuntimeFs => {
  const mapStats = (stats: nodeFs.Stats): FileInfo => ({
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    isSymlink: stats.isSymbolicLink(),
    size: stats.size,
    mtime: stats.mtime,
    atime: stats.atime,
    birthtime: stats.birthtime,
  });

  const handleError = (error: unknown, path: string): never => {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new NotFoundError(path);
    }
    throw error;
  };

  return {
    async readFile(
      path: string,
      options?: FileOptions,
    ): Promise<Uint8Array> {
      try {
        const buffer = await nodeFsPromises.readFile(path, {
          signal: options?.signal,
        });
        return new Uint8Array(buffer);
      } catch (error) {
        return handleError(error, path);
      }
    },

    async readTextFile(path: string, options?: FileOptions): Promise<string> {
      try {
        return await nodeFsPromises.readFile(path, {
          encoding: "utf-8",
          signal: options?.signal,
        });
      } catch (error) {
        return handleError(error, path);
      }
    },

    async writeFile(
      path: string,
      data: Uint8Array,
      options?: WriteFileOptions,
    ): Promise<void> {
      const flag = options?.append ? "a" : "w";
      await nodeFsPromises.writeFile(path, data, {
        signal: options?.signal,
        mode: options?.mode,
        flag,
      });
    },

    async writeTextFile(
      path: string,
      data: string,
      options?: WriteFileOptions,
    ): Promise<void> {
      const flag = options?.append ? "a" : "w";
      await nodeFsPromises.writeFile(path, data, {
        encoding: "utf-8",
        signal: options?.signal,
        mode: options?.mode,
        flag,
      });
    },

    async exists(path: string): Promise<boolean> {
      try {
        await nodeFsPromises.access(path);
        return true;
      } catch {
        return false;
      }
    },

    async stat(path: string): Promise<FileInfo> {
      try {
        const stats = await nodeFsPromises.stat(path);
        return mapStats(stats);
      } catch (error) {
        return handleError(error, path);
      }
    },

    async lstat(path: string): Promise<FileInfo> {
      try {
        const stats = await nodeFsPromises.lstat(path);
        return mapStats(stats);
      } catch (error) {
        return handleError(error, path);
      }
    },

    async mkdir(path: string, options?: MkdirOptions): Promise<void> {
      await nodeFsPromises.mkdir(path, {
        recursive: options?.recursive ?? false,
        mode: options?.mode,
      });
    },

    async remove(path: string, options?: RemoveOptions): Promise<void> {
      try {
        await nodeFsPromises.rm(path, {
          recursive: options?.recursive ?? false,
          force: false,
        });
      } catch (error) {
        handleError(error, path);
      }
    },

    async *readDir(path: string): AsyncIterable<DirEntry> {
      try {
        const entries = await nodeFsPromises.readdir(path, {
          withFileTypes: true,
        });
        for (const entry of entries) {
          yield {
            name: entry.name,
            isFile: entry.isFile(),
            isDirectory: entry.isDirectory(),
            isSymlink: entry.isSymbolicLink(),
          };
        }
      } catch (error) {
        handleError(error, path);
      }
    },

    async copyFile(from: string, to: string): Promise<void> {
      await nodeFsPromises.copyFile(from, to);
    },

    async rename(from: string, to: string): Promise<void> {
      await nodeFsPromises.rename(from, to);
    },

    async makeTempDir(options?: MakeTempOptions): Promise<string> {
      const dir = options?.dir ?? nodeOs.tmpdir();
      const prefix = options?.prefix ?? "";
      const suffix = options?.suffix ?? "";
      const tempPath = await nodeFsPromises.mkdtemp(nodePath.join(dir, prefix));
      if (suffix) {
        const newPath = tempPath + suffix;
        await nodeFsPromises.rename(tempPath, newPath);
        return newPath;
      }
      return tempPath;
    },
  };
};

// =============================================================================
// Path Adapter
// =============================================================================

const createBunPath = (): RuntimePath => {
  return {
    join: nodePath.join,
    resolve: nodePath.resolve,
    dirname: nodePath.dirname,
    basename: nodePath.basename,
    extname: nodePath.extname,
    normalize: nodePath.normalize,
    isAbsolute: nodePath.isAbsolute,
    relative: nodePath.relative,
    parse: nodePath.parse as (path: string) => ParsedPath,
    format: nodePath.format as (pathObject: Partial<ParsedPath>) => string,
    sep: nodePath.sep,
    delimiter: nodePath.delimiter,
  };
};

// =============================================================================
// Exec Adapter
// =============================================================================

// Helper to read stream to Uint8Array
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

  // Concatenate chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
};

const createBunExec = (): RuntimeExec => {
  return {
    async spawn(
      cmd: string,
      args: string[] = [],
      options?: SpawnOptions,
    ): Promise<ProcessOutput> {
      const [stdinMode, stdoutMode, stderrMode] = getNodeStdioArray(options);
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
    },

    async exec(
      cmd: string,
      args: string[] = [],
      options?: SpawnOptions,
    ): Promise<string> {
      const result = await this.spawn(cmd, args, options);

      if (!result.success) {
        const stderr = new TextDecoder().decode(result.stderr);
        throw new ProcessError(cmd, result.code, stderr);
      }

      return new TextDecoder().decode(result.stdout).trim();
    },

    async execJson<T = unknown>(
      cmd: string,
      args: string[] = [],
      options?: SpawnOptions,
    ): Promise<T> {
      const output = await this.exec(cmd, args, options);
      return JSON.parse(output) as T;
    },

    spawnChild(
      cmd: string,
      args: string[] = [],
      options?: SpawnOptions,
    ): ChildProcess {
      const [stdinMode, stdoutMode, stderrMode] = getNodeStdioArray(options);
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
    },
  };
};

// =============================================================================
// Environment Adapter
// =============================================================================

const createBunEnv = (): RuntimeEnv => {
  return {
    get(key: string): string | undefined {
      return nodeProcess.env[key];
    },

    set(key: string, value: string): void {
      nodeProcess.env[key] = value;
    },

    delete(key: string): void {
      delete nodeProcess.env[key];
    },

    has(key: string): boolean {
      return key in nodeProcess.env;
    },

    toObject(): Record<string, string> {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(nodeProcess.env)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    },
  };
};

// =============================================================================
// Process Adapter
// =============================================================================

const createBunProcess = (): RuntimeProcess => {
  return {
    exit(code?: number): never {
      nodeProcess.exit(code);
    },

    cwd(): string {
      return nodeProcess.cwd();
    },

    chdir(path: string): void {
      nodeProcess.chdir(path);
    },

    hostname(): string {
      return nodeOs.hostname();
    },

    execPath(): string {
      return nodeProcess.execPath;
    },

    args: nodeProcess.argv.slice(2),

    pid: nodeProcess.pid,

    stdin: Readable.toWeb(nodeProcess.stdin) as ReadableStream<Uint8Array>,

    stdout: Writable.toWeb(nodeProcess.stdout) as WritableStream<Uint8Array>,

    stderr: Writable.toWeb(nodeProcess.stderr) as WritableStream<Uint8Array>,
  };
};

// =============================================================================
// Runtime Factory
// =============================================================================

/**
 * Creates a Bun runtime instance.
 */
export const createBunRuntime = (): Runtime => {
  const fs = createBunFs();
  const path = createBunPath();
  const exec = createBunExec();
  const env = createBunEnv();
  const process = createBunProcess();

  return {
    name: "bun",
    version: Bun.version,
    capabilities: BUN_CAPABILITIES as RuntimeCapabilities,
    fs,
    path,
    exec,
    env,
    process,
  };
};
