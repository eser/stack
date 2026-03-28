// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cross-runtime abstraction module.
 * Provides runtime-agnostic APIs for filesystem, path, exec, and environment.
 *
 * Supports: Deno, Node.js, Bun, Cloudflare Workers
 *
 * @example
 * ```typescript
 * import { runtime } from "@eser/standards/cross-runtime";
 *
 * // Check capabilities before use
 * if (runtime.capabilities.fs) {
 *   const config = await runtime.fs.readTextFile("config.json");
 * }
 *
 * // Path is always available
 * const fullPath = runtime.path.join("src", "lib", "utils.ts");
 *
 * // For testing - use factory with mocks
 * import { createRuntime } from "@eser/standards/cross-runtime";
 * const mockRuntime = await createRuntime({ fs: mockFs });
 * ```
 *
 * @module
 */

// Re-export types
export type {
  Arch,
  ChildProcess,
  CreateRuntimeOptions,
  DirEntry,
  FileInfo,
  FileOptions,
  FsEvent,
  FsWatcher,
  MakeTempOptions,
  MkdirOptions,
  ParsedPath,
  Platform,
  PlatformInfo,
  ProcessOutput,
  ProcessStatus,
  RemoveOptions,
  Runtime,
  RuntimeCapabilities,
  RuntimeEnv,
  RuntimeExec,
  RuntimeFs,
  RuntimeName,
  RuntimePath,
  RuntimeProcess,
  SpawnOptions,
  WalkEntry,
  WalkOptions,
  WatchOptions,
  WriteFileOptions,
} from "./types.ts";

// Re-export error classes
export {
  AlreadyExistsError,
  NotFoundError,
  ProcessError,
  RuntimeCapabilityError,
} from "./types.ts";

// Re-export detection utilities
export {
  detectRuntime,
  getRuntimeVersion,
  isBrowser,
  isEdge,
  isRuntime,
  isServer,
} from "./detect.ts";

// Re-export platform utilities
export {
  getArch,
  getHomedir,
  getPlatform,
  getPlatformInfo,
  getTmpdir,
} from "./platform.ts";

// Re-export polyfills
export { posixPath, toPosix } from "./polyfills/path.ts";

// Re-export file search utilities
export {
  searchFileHierarchy,
  type SearchFileHierarchyOptions,
} from "./file-search.ts";

// Re-export CLI execution context utilities
export {
  buildCommand,
  detectExecutionContext,
  detectInvoker,
  getCliCommand,
  isCommandInPath,
  resolvePathDirs,
} from "./execution-context.ts";
export type {
  CliCommandOptions,
  CliExecutionContext,
  CliInvoker,
  CliMode,
  CliRuntime,
} from "./execution-context.ts";

// Re-export Workers-specific utilities
export {
  clearEnv as clearWorkerdEnv,
  populateEnvFromContext,
} from "./adapters/workerd.ts";

import type {
  CreateRuntimeOptions,
  Runtime,
  RuntimeCapabilities,
} from "./types.ts";
import { RuntimeCapabilityError } from "./types.ts";
import { detectRuntime } from "./detect.ts";
import { posixPath } from "./polyfills/path.ts";

// Adapters are loaded lazily via dynamic import() — only the detected
// runtime's adapter is imported. This avoids loading all 5 adapters
// (and their platform-specific dependencies) at startup.

import type { RuntimeCapabilities as Caps, RuntimeName } from "./types.ts";

/**
 * Creates a throw function for a specific capability.
 */
const createThrowFn = (
  capability: keyof Caps,
  runtimeName: RuntimeName,
): () => never => {
  return () => {
    throw new RuntimeCapabilityError(capability, runtimeName);
  };
};

/**
 * Creates a stub filesystem adapter that throws on all operations.
 */
const createStubFs = (runtimeName: RuntimeName): Runtime["fs"] => {
  const throwFs = createThrowFn("fs", runtimeName);
  return {
    readFile: throwFs,
    readTextFile: throwFs,
    writeFile: throwFs,
    writeTextFile: throwFs,
    exists: throwFs,
    stat: throwFs,
    lstat: throwFs,
    mkdir: throwFs,
    ensureDir: throwFs,
    remove: throwFs,
    readDir: throwFs,
    copyFile: throwFs,
    rename: throwFs,
    makeTempDir: throwFs,
    realPath: throwFs,
    watch: throwFs,
    walk: throwFs,
    chmod: throwFs,
  };
};

/**
 * Creates a stub exec adapter that throws on all operations.
 */
const createStubExec = (runtimeName: RuntimeName): Runtime["exec"] => {
  const throwExec = createThrowFn("exec", runtimeName);
  return {
    spawn: throwExec,
    exec: throwExec,
    execJson: throwExec,
    spawnChild: throwExec,
  };
};

/**
 * Creates a stub process adapter that throws on all operations.
 */
const createStubProcess = (runtimeName: RuntimeName): Runtime["process"] => {
  const throwProcess = createThrowFn("process", runtimeName);
  return {
    exit: throwProcess,
    setExitCode: throwProcess,
    cwd: throwProcess,
    chdir: throwProcess,
    hostname: throwProcess,
    execPath: throwProcess,
    get args(): readonly string[] {
      throw new RuntimeCapabilityError("process", runtimeName);
    },
    get pid(): number {
      throw new RuntimeCapabilityError("process", runtimeName);
    },
    get stdin(): ReadableStream<Uint8Array> {
      throw new RuntimeCapabilityError("process", runtimeName);
    },
    get stdout(): WritableStream<Uint8Array> {
      throw new RuntimeCapabilityError("process", runtimeName);
    },
    get stderr(): WritableStream<Uint8Array> {
      throw new RuntimeCapabilityError("process", runtimeName);
    },
    isTerminal(): boolean {
      return false;
    },
    setStdinRaw(): void {
      throw new RuntimeCapabilityError("process", runtimeName);
    },
  };
};

/**
 * Creates a no-op env adapter for environments without env access.
 */
const createStubEnv = (): Runtime["env"] => ({
  get: () => undefined,
  set: () => {},
  delete: () => {},
  has: () => false,
  toObject: () => ({}),
});

/**
 * Create a minimal runtime for unknown environments.
 */
const createMinimalRuntime = (name: Runtime["name"]): Runtime => ({
  name,
  version: "unknown",
  capabilities: {
    fs: false,
    fsSync: false,
    exec: false,
    process: false,
    env: false,
    stdin: false,
    stdout: false,
    kv: false,
  },
  fs: createStubFs(name),
  path: posixPath,
  exec: createStubExec(name),
  env: createStubEnv(),
  process: createStubProcess(name),
});

/**
 * Runtime factory lookup table — each factory lazily imports its adapter.
 * Only the detected runtime's adapter module is loaded.
 */
const runtimeFactories: Partial<
  Record<RuntimeName, () => Promise<Runtime>>
> = {
  deno: async () => {
    const mod = await import("./adapters/deno.ts");
    return mod.createDenoRuntime();
  },
  node: async () => {
    const mod = await import("./adapters/node.ts");
    return mod.createNodeRuntime();
  },
  bun: async () => {
    const mod = await import("./adapters/bun.ts");
    return mod.createBunRuntime();
  },
  workerd: async () => {
    const mod = await import("./adapters/workerd.ts");
    return mod.createWorkerdRuntime();
  },
  browser: async () => {
    const mod = await import("./adapters/browser.ts");
    return mod.createBrowserRuntime();
  },
};

/**
 * Keys that can be overridden in runtime options.
 */
const overrideKeys: readonly (keyof CreateRuntimeOptions)[] = [
  "fs",
  "exec",
  "env",
  "path",
  "process",
];

/**
 * Check if options contain any overrides.
 */
const hasOverrides = (options?: CreateRuntimeOptions): boolean =>
  options !== undefined &&
  overrideKeys.some((key) => options[key] !== undefined);

/**
 * Merge base runtime with overrides.
 */
const mergeRuntime = (
  base: Runtime,
  options: CreateRuntimeOptions,
  capabilities: RuntimeCapabilities,
): Runtime => ({
  name: base.name,
  version: base.version,
  capabilities,
  fs: options.fs ?? base.fs,
  path: options.path ?? base.path,
  exec: options.exec ?? base.exec,
  env: options.env ?? base.env,
  process: options.process ?? base.process,
});

/**
 * Creates a runtime instance for the detected or specified runtime.
 *
 * @param options - Optional overrides for testing or customization
 * @returns A Runtime instance
 */
export const createRuntime = async (
  options?: CreateRuntimeOptions,
): Promise<Runtime> => {
  const runtimeName = detectRuntime();
  const factory = runtimeFactories[runtimeName];
  const baseRuntime = factory !== undefined
    ? await factory()
    : createMinimalRuntime(runtimeName);

  // Apply capability overrides if provided
  const capabilities = options?.capabilities
    ? { ...baseRuntime.capabilities, ...options.capabilities }
    : baseRuntime.capabilities;

  if (options !== undefined && hasOverrides(options)) {
    return mergeRuntime(baseRuntime, options, capabilities);
  }

  // Return base runtime with potentially updated capabilities
  if (options?.capabilities) {
    return { ...baseRuntime, capabilities };
  }

  return baseRuntime;
};

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * The default runtime instance.
 * Auto-detected based on the current environment.
 *
 * @example
 * ```typescript
 * import { runtime } from "@eser/standards/cross-runtime";
 *
 * if (runtime.capabilities.fs) {
 *   const data = await runtime.fs.readTextFile("config.json");
 * }
 * ```
 */
// deno-lint-ignore no-top-level-await
export const runtime: Runtime = await createRuntime();
// deno-lint-ignore no-top-level-await
export const current: Runtime = runtime;
