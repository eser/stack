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
import { DENO_CAPABILITIES } from "../capabilities.ts";

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
      const stdoutMode = options?.stdout ?? "piped";
      const stderrMode = options?.stderr ?? "piped";

      const command = new Deno.Command(cmd, {
        args,
        cwd: options?.cwd,
        env: options?.env,
        stdin: options?.stdin ?? "null",
        stdout: stdoutMode,
        stderr: stderrMode,
        signal: options?.signal,
      });

      const result = await command.output();

      // When stdout/stderr are "inherit" or "null", Deno doesn't provide the streams
      // Return empty Uint8Array to satisfy the ProcessOutput interface
      return {
        success: result.success,
        code: result.code,
        stdout: stdoutMode === "piped" ? result.stdout : new Uint8Array(),
        stderr: stderrMode === "piped" ? result.stderr : new Uint8Array(),
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
      const stdinMode = options?.stdin ?? "null";
      const stdoutMode = options?.stdout ?? "piped";
      const stderrMode = options?.stderr ?? "piped";

      const command = new Deno.Command(cmd, {
        args,
        cwd: options?.cwd,
        env: options?.env,
        stdin: stdinMode,
        stdout: stdoutMode,
        stderr: stderrMode,
        signal: options?.signal,
      });

      const process = command.spawn();

      return {
        pid: process.pid,
        // Only access streams if they were configured as "piped"
        stdin: stdinMode === "piped" ? process.stdin : null,
        stdout: stdoutMode === "piped" ? process.stdout : null,
        stderr: stderrMode === "piped" ? process.stderr : null,
        status: process.status.then(
          (status): ProcessStatus => ({
            success: status.success,
            code: status.code,
            signal: status.signal ?? undefined,
          }),
        ),
        output: async (): Promise<ProcessOutput> => {
          // Collect streams manually to handle non-piped cases
          const [status, stdout, stderr] = await Promise.all([
            process.status,
            stdoutMode === "piped"
              ? new Response(process.stdout).arrayBuffer().then((b) =>
                new Uint8Array(b)
              )
              : Promise.resolve(new Uint8Array()),
            stderrMode === "piped"
              ? new Response(process.stderr).arrayBuffer().then((b) =>
                new Uint8Array(b)
              )
              : Promise.resolve(new Uint8Array()),
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
