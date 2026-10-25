// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared Node.js-compatible adapter implementations.
 * Used by both Node.js and Bun adapters since Bun provides
 * Node.js-compatible APIs for filesystem, path, env, and process.
 *
 * @module
 */

import * as deps from "./deps.ts";
import type {
  DirEntry,
  FileInfo,
  FileOptions,
  FsEvent,
  FsWatcher,
  MakeTempOptions,
  MkdirOptions,
  ParsedPath,
  RemoveOptions,
  RuntimeEnv,
  RuntimeFs,
  RuntimePath,
  RuntimeProcess,
  SignalName,
  WalkEntry,
  WalkOptions,
  WatchOptions,
  WriteFileOptions,
} from "../types.ts";
import * as types from "../types.ts";
import * as webStreams from "./web-streams.ts";

// =============================================================================
// Filesystem Adapter
// =============================================================================

const mapStats = (stats: deps.fs.Stats): FileInfo => ({
  isFile: stats.isFile(),
  isDirectory: stats.isDirectory(),
  isSymlink: stats.isSymbolicLink(),
  size: stats.size,
  mtime: stats.mtime,
  atime: stats.atime,
  birthtime: stats.birthtime,
  mode: stats.mode,
});

const handleFsError = (error: unknown, path: string): never => {
  if (error instanceof Error && "code" in error) {
    if (error.code === "ENOENT") {
      throw new types.NotFoundError(path);
    }

    if (error.code === "EACCES" || error.code === "EPERM") {
      throw new types.PermissionDeniedError(path, { cause: error });
    }
  }
  throw error;
};

export const createNodeCompatFs = (): RuntimeFs => {
  return {
    async readFile(
      path: string,
      options?: FileOptions,
    ): Promise<Uint8Array> {
      try {
        const buffer = await deps.fsPromises.readFile(path, {
          signal: options?.signal,
        });
        return new Uint8Array(buffer);
      } catch (error) {
        return handleFsError(error, path);
      }
    },

    async readTextFile(path: string, options?: FileOptions): Promise<string> {
      try {
        return await deps.fsPromises.readFile(path, {
          encoding: "utf-8",
          signal: options?.signal,
        });
      } catch (error) {
        return handleFsError(error, path);
      }
    },

    async writeFile(
      path: string,
      data: Uint8Array,
      options?: WriteFileOptions,
    ): Promise<void> {
      const flag = options?.append ? "a" : "w";
      await deps.fsPromises.writeFile(path, data, {
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
      await deps.fsPromises.writeFile(path, data, {
        encoding: "utf-8",
        signal: options?.signal,
        mode: options?.mode,
        flag,
      });
    },

    async exists(path: string): Promise<boolean> {
      try {
        await deps.fsPromises.access(path);
        return true;
      } catch {
        return false;
      }
    },

    async stat(path: string): Promise<FileInfo> {
      try {
        const stats = await deps.fsPromises.stat(path);
        return mapStats(stats);
      } catch (error) {
        return handleFsError(error, path);
      }
    },

    async lstat(path: string): Promise<FileInfo> {
      try {
        const stats = await deps.fsPromises.lstat(path);
        return mapStats(stats);
      } catch (error) {
        return handleFsError(error, path);
      }
    },

    async mkdir(path: string, options?: MkdirOptions): Promise<void> {
      await deps.fsPromises.mkdir(path, {
        recursive: options?.recursive ?? false,
        mode: options?.mode,
      });
    },

    async ensureDir(path: string): Promise<void> {
      await deps.fsPromises.mkdir(path, { recursive: true });
    },

    async remove(path: string, options?: RemoveOptions): Promise<void> {
      try {
        await deps.fsPromises.rm(path, {
          recursive: options?.recursive ?? false,
          force: false,
        });
      } catch (error) {
        handleFsError(error, path);
      }
    },

    async *readDir(path: string): AsyncIterable<DirEntry> {
      try {
        const entries = await deps.fsPromises.readdir(path, {
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
        handleFsError(error, path);
      }
    },

    async copyFile(from: string, to: string): Promise<void> {
      await deps.fsPromises.copyFile(from, to);
    },

    async rename(from: string, to: string): Promise<void> {
      await deps.fsPromises.rename(from, to);
    },

    async makeTempDir(options?: MakeTempOptions): Promise<string> {
      const dir = options?.dir ?? deps.os.tmpdir();
      const prefix = options?.prefix ?? "";
      const suffix = options?.suffix ?? "";
      const tempPath = await deps.fsPromises.mkdtemp(
        deps.path.join(dir, prefix),
      );
      if (suffix !== "") {
        const newPath = tempPath + suffix;
        await deps.fsPromises.rename(tempPath, newPath);
        return newPath;
      }
      return tempPath;
    },

    async realPath(path: string): Promise<string> {
      try {
        return await deps.fsPromises.realpath(path);
      } catch (error) {
        return handleFsError(error, path);
      }
    },

    watch(paths: string[], options?: WatchOptions): FsWatcher {
      const recursive = options?.recursive ?? true;
      const watchers: ReturnType<typeof deps.fs.watch>[] = [];

      const events: FsEvent[] = [];
      let resolvers: ((value: IteratorResult<FsEvent>) => void)[] = [];
      let closed = false;

      const pushEvent = (event: FsEvent): void => {
        if (closed) {
          return;
        }
        if (resolvers.length > 0) {
          const resolver = resolvers.shift()!;
          resolver({ value: event, done: false });
        } else {
          events.push(event);
        }
      };

      for (const watchPath of paths) {
        try {
          const watcher = deps.fs.watch(
            watchPath,
            { recursive },
            (eventType, filename) => {
              if (filename === null) {
                return;
              }
              pushEvent({
                kind: eventType === "rename" ? "create" : "modify",
                paths: [deps.path.join(watchPath, filename)],
              });
            },
          );
          watchers.push(watcher);
        } catch {
          // Skip paths that can't be watched
        }
      }

      return {
        close: (): void => {
          closed = true;
          for (const watcher of watchers) {
            watcher.close();
          }
          for (const resolver of resolvers) {
            resolver({ value: undefined as unknown as FsEvent, done: true });
          }
          resolvers = [];
        },
        [Symbol.asyncIterator]: (): AsyncIterator<FsEvent> => ({
          next: (): Promise<IteratorResult<FsEvent>> => {
            if (closed) {
              return Promise.resolve({
                value: undefined as unknown as FsEvent,
                done: true,
              });
            }
            if (events.length > 0) {
              return Promise.resolve({ value: events.shift()!, done: false });
            }
            return new Promise((resolve) => {
              resolvers.push(resolve);
            });
          },
        }),
      };
    },

    async chmod(path: string, mode: number): Promise<void> {
      await deps.fsPromises.chmod(path, mode);
    },

    async *walk(
      root: string,
      options?: WalkOptions,
    ): AsyncIterable<WalkEntry> {
      const includeDirs = options?.includeDirs ?? true;
      const includeFiles = options?.includeFiles ?? true;
      const exts = options?.exts;
      const skip = options?.skip;

      const walkDir = async function* (
        dir: string,
      ): AsyncIterable<WalkEntry> {
        const entries = await deps.fsPromises.readdir(dir, {
          withFileTypes: true,
        });

        for (const entry of entries) {
          const entryPath = deps.path.join(dir, entry.name);

          if (skip?.some((pattern) => pattern.test(entryPath))) {
            continue;
          }

          const isSymlink = entry.isSymbolicLink();

          if (entry.isDirectory()) {
            if (includeDirs) {
              yield {
                path: entryPath,
                name: entry.name,
                isFile: false,
                isDirectory: true,
                isSymlink,
              };
            }
            yield* walkDir(entryPath);
          } else if (entry.isFile() || isSymlink) {
            if (!includeFiles) {
              continue;
            }
            if (
              exts !== undefined &&
              !exts.some((ext) =>
                entry.name.endsWith(ext.startsWith(".") ? ext : `.${ext}`)
              )
            ) {
              continue;
            }
            yield {
              path: entryPath,
              name: entry.name,
              isFile: entry.isFile(),
              isDirectory: false,
              isSymlink,
            };
          }
        }
      };

      yield* walkDir(root);
    },
  };
};

// =============================================================================
// Path Adapter
// =============================================================================

export const createNodeCompatPath = (): RuntimePath => ({
  join: deps.path.join,
  resolve: deps.path.resolve,
  dirname: deps.path.dirname,
  basename: deps.path.basename,
  extname: deps.path.extname,
  normalize: deps.path.normalize,
  isAbsolute: deps.path.isAbsolute,
  relative: deps.path.relative,
  parse: deps.path.parse as (path: string) => ParsedPath,
  format: deps.path.format as (pathObject: Partial<ParsedPath>) => string,
  sep: deps.path.sep,
  delimiter: deps.path.delimiter,
});

// =============================================================================
// Environment Adapter
// =============================================================================

export const createNodeCompatEnv = (): RuntimeEnv => ({
  get(key: string): string | undefined {
    return deps.process.env[key];
  },

  set(key: string, value: string): void {
    deps.process.env[key] = value;
  },

  delete(key: string): void {
    delete deps.process.env[key];
  },

  has(key: string): boolean {
    return key in deps.process.env;
  },

  toObject(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(deps.process.env)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  },
});

// =============================================================================
// Process Adapter
// =============================================================================

export const createNodeCompatProcess = (): RuntimeProcess => ({
  exit(code?: number): never {
    deps.process.exit(code);
  },

  setExitCode(code: number): void {
    deps.process.exitCode = code;
  },

  cwd(): string {
    return deps.process.cwd();
  },

  chdir(path: string): void {
    deps.process.chdir(path);
  },

  hostname(): string {
    return deps.os.hostname();
  },

  execPath(): string {
    return deps.process.execPath;
  },

  argv: deps.process.argv,

  argv0: deps.process.argv0,

  args: deps.process.argv.slice(2),

  pid: deps.process.pid,

  addSignalListener(signal: SignalName, listener: () => void): void {
    deps.process.on(signal, listener);
  },

  removeSignalListener(signal: SignalName, listener: () => void): void {
    deps.process.off(signal, listener);
  },

  isAlive(pid: number): boolean {
    try {
      // Signal 0 checks existence and permission without delivering anything.
      deps.process.kill(pid, 0);

      return true;
    } catch (error) {
      // EPERM means it exists but belongs to another user — still alive.
      return (error as { code?: string }).code === "EPERM";
    }
  },

  // The runtime is created when cross-runtime is imported, so the web streams
  // bind to the process streams on first use instead. A stdin converted here
  // would flow at once and keep the process alive while its pipe stays open.
  stdin: webStreams.createLazyReadable(() =>
    deps.stream.Readable.toWeb(deps.process.stdin) as ReadableStream<
      Uint8Array
    >
  ),

  stdout: webStreams.createLazyWritable(() =>
    deps.stream.Writable.toWeb(deps.process.stdout) as WritableStream<
      Uint8Array
    >
  ),

  stderr: webStreams.createLazyWritable(() =>
    deps.stream.Writable.toWeb(deps.process.stderr) as WritableStream<
      Uint8Array
    >
  ),

  isTerminal(stream: "stdin" | "stdout" | "stderr"): boolean {
    switch (stream) {
      case "stdin":
        return deps.process.stdin.isTTY === true;
      case "stdout":
        return deps.process.stdout.isTTY === true;
      case "stderr":
        return deps.process.stderr.isTTY === true;
    }
  },

  setStdinRaw(raw: boolean): void {
    deps.process.stdin.setRawMode(raw);
  },

  writeToStdout(data: Uint8Array): void {
    deps.process.stdout.write(data);
  },

  consoleSize(): { columns: number; rows: number } {
    return {
      columns: deps.process.stdout.columns ?? 80,
      rows: deps.process.stdout.rows ?? 24,
    };
  },
});
