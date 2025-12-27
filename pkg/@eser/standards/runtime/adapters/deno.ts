// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Deno runtime adapter.
 * Implements the Runtime interface using Deno APIs.
 *
 * @module
 */

import * as denoPath from "@std/path";
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
import { getStdioModes } from "./shared.ts";

/**
 * Deno capabilities - full capabilities plus KV.
 */
export const DENO_CAPABILITIES: RuntimeCapabilities = {
  fs: true,
  fsSync: true,
  exec: true,
  process: true,
  env: true,
  stdin: true,
  stdout: true,
  kv: true,
} as const;

// =============================================================================
// Filesystem Adapter
// =============================================================================

const createDenoFs = (): RuntimeFs => {
  const mapFileInfo = (info: Deno.FileInfo): FileInfo => ({
    isFile: info.isFile,
    isDirectory: info.isDirectory,
    isSymlink: info.isSymlink,
    size: info.size,
    mtime: info.mtime,
    atime: info.atime,
    birthtime: info.birthtime,
  });

  return {
    async readFile(
      path: string,
      options?: FileOptions,
    ): Promise<Uint8Array> {
      try {
        return await Deno.readFile(path, { signal: options?.signal });
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new NotFoundError(path);
        }
        throw error;
      }
    },

    async readTextFile(path: string, options?: FileOptions): Promise<string> {
      try {
        return await Deno.readTextFile(path, { signal: options?.signal });
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new NotFoundError(path);
        }
        throw error;
      }
    },

    async writeFile(
      path: string,
      data: Uint8Array,
      options?: WriteFileOptions,
    ): Promise<void> {
      await Deno.writeFile(path, data, {
        signal: options?.signal,
        mode: options?.mode,
        create: options?.create ?? true,
        append: options?.append ?? false,
      });
    },

    async writeTextFile(
      path: string,
      data: string,
      options?: WriteFileOptions,
    ): Promise<void> {
      await Deno.writeTextFile(path, data, {
        signal: options?.signal,
        mode: options?.mode,
        create: options?.create ?? true,
        append: options?.append ?? false,
      });
    },

    async exists(path: string): Promise<boolean> {
      try {
        await Deno.stat(path);
        return true;
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          return false;
        }
        throw error;
      }
    },

    async stat(path: string): Promise<FileInfo> {
      try {
        const info = await Deno.stat(path);
        return mapFileInfo(info);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new NotFoundError(path);
        }
        throw error;
      }
    },

    async lstat(path: string): Promise<FileInfo> {
      try {
        const info = await Deno.lstat(path);
        return mapFileInfo(info);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new NotFoundError(path);
        }
        throw error;
      }
    },

    async mkdir(path: string, options?: MkdirOptions): Promise<void> {
      await Deno.mkdir(path, {
        recursive: options?.recursive ?? false,
        mode: options?.mode,
      });
    },

    async remove(path: string, options?: RemoveOptions): Promise<void> {
      try {
        await Deno.remove(path, {
          recursive: options?.recursive ?? false,
        });
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new NotFoundError(path);
        }
        throw error;
      }
    },

    async *readDir(path: string): AsyncIterable<DirEntry> {
      try {
        for await (const entry of Deno.readDir(path)) {
          yield {
            name: entry.name,
            isFile: entry.isFile,
            isDirectory: entry.isDirectory,
            isSymlink: entry.isSymlink,
          };
        }
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new NotFoundError(path);
        }
        throw error;
      }
    },

    async copyFile(from: string, to: string): Promise<void> {
      await Deno.copyFile(from, to);
    },

    async rename(from: string, to: string): Promise<void> {
      await Deno.rename(from, to);
    },

    async makeTempDir(options?: MakeTempOptions): Promise<string> {
      return await Deno.makeTempDir({
        dir: options?.dir,
        prefix: options?.prefix,
        suffix: options?.suffix,
      });
    },
  };
};

// =============================================================================
// Path Adapter
// =============================================================================

const createDenoPath = (): RuntimePath => {
  return {
    join: denoPath.join,
    resolve: denoPath.resolve,
    dirname: denoPath.dirname,
    basename: denoPath.basename,
    extname: denoPath.extname,
    normalize: denoPath.normalize,
    isAbsolute: denoPath.isAbsolute,
    relative: denoPath.relative,
    parse: denoPath.parse as (path: string) => ParsedPath,
    format: denoPath.format as (pathObject: Partial<ParsedPath>) => string,
    sep: denoPath.SEPARATOR,
    delimiter: denoPath.DELIMITER,
  };
};

// =============================================================================
// Exec Adapter
// =============================================================================

const createDenoExec = (): RuntimeExec => {
  return {
    async spawn(
      cmd: string,
      args: string[] = [],
      options?: SpawnOptions,
    ): Promise<ProcessOutput> {
      const modes = getStdioModes(options);

      const command = new Deno.Command(cmd, {
        args,
        cwd: options?.cwd,
        env: options?.env,
        stdin: modes.stdin,
        stdout: modes.stdout,
        stderr: modes.stderr,
        signal: options?.signal,
      });

      const result = await command.output();

      return {
        success: result.success,
        code: result.code,
        stdout: modes.stdout === "piped" ? result.stdout : new Uint8Array(),
        stderr: modes.stderr === "piped" ? result.stderr : new Uint8Array(),
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
      const modes = getStdioModes(options);

      const command = new Deno.Command(cmd, {
        args,
        cwd: options?.cwd,
        env: options?.env,
        stdin: modes.stdin,
        stdout: modes.stdout,
        stderr: modes.stderr,
        signal: options?.signal,
      });

      const process = command.spawn();

      const collectStream = (
        stream: ReadableStream<Uint8Array> | null,
        mode: string,
      ): Promise<Uint8Array> => {
        if (mode !== "piped" || !stream) {
          return Promise.resolve(new Uint8Array());
        }
        return new Response(stream).arrayBuffer().then((b) =>
          new Uint8Array(b)
        );
      };

      return {
        pid: process.pid,
        stdin: modes.stdin === "piped" ? process.stdin : null,
        stdout: modes.stdout === "piped" ? process.stdout : null,
        stderr: modes.stderr === "piped" ? process.stderr : null,
        status: process.status.then(
          (status): ProcessStatus => ({
            success: status.success,
            code: status.code,
            signal: status.signal ?? undefined,
          }),
        ),
        output: async (): Promise<ProcessOutput> => {
          const stdoutStream = modes.stdout === "piped" ? process.stdout : null;
          const stderrStream = modes.stderr === "piped" ? process.stderr : null;
          const [status, stdout, stderr] = await Promise.all([
            process.status,
            collectStream(stdoutStream, modes.stdout),
            collectStream(stderrStream, modes.stderr),
          ]);
          return {
            success: status.success,
            code: status.code,
            stdout,
            stderr,
          };
        },
        kill: (signal?: string): void => {
          process.kill(signal as Deno.Signal);
        },
      };
    },
  };
};

// =============================================================================
// Environment Adapter
// =============================================================================

const createDenoEnv = (): RuntimeEnv => {
  return {
    get(key: string): string | undefined {
      return Deno.env.get(key);
    },

    set(key: string, value: string): void {
      Deno.env.set(key, value);
    },

    delete(key: string): void {
      Deno.env.delete(key);
    },

    has(key: string): boolean {
      return Deno.env.get(key) !== undefined;
    },

    toObject(): Record<string, string> {
      return Deno.env.toObject();
    },
  };
};

// =============================================================================
// Process Adapter
// =============================================================================

const createDenoProcess = (): RuntimeProcess => {
  return {
    exit(code?: number): never {
      Deno.exit(code);
    },

    cwd(): string {
      return Deno.cwd();
    },

    chdir(path: string): void {
      Deno.chdir(path);
    },

    hostname(): string {
      return Deno.hostname();
    },

    execPath(): string {
      return Deno.execPath();
    },

    args: Deno.args,

    pid: Deno.pid,

    stdin: Deno.stdin.readable,

    stdout: Deno.stdout.writable,

    stderr: Deno.stderr.writable,
  };
};

// =============================================================================
// Runtime Factory
// =============================================================================

/**
 * Creates a Deno runtime instance.
 */
export const createDenoRuntime = (): Runtime => {
  const fs = createDenoFs();
  const path = createDenoPath();
  const exec = createDenoExec();
  const env = createDenoEnv();
  const process = createDenoProcess();

  return {
    name: "deno",
    version: Deno.version.deno,
    capabilities: DENO_CAPABILITIES as RuntimeCapabilities,
    fs,
    path,
    exec,
    env,
    process,
  };
};
