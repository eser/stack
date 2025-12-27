// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cross-runtime abstraction module.
 * Provides runtime-agnostic APIs for filesystem, path, exec, and environment.
 *
 * Supports: Deno, Node.js, Bun, Cloudflare Workers
 *
 * @example
 * ```typescript
 * import { runtime } from "@eser/standards/runtime";
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
 * import { createRuntime } from "@eser/standards/runtime";
 * const mockRuntime = createRuntime({ fs: mockFs });
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
  isBun,
  isDeno,
  isEdge,
  isNode,
  isServer,
  isWorkerd,
} from "./detect.ts";

// Re-export platform utilities
export {
  getArch,
  getHomedir,
  getPlatform,
  getPlatformInfo,
  getTmpdir,
} from "./platform.ts";

// Re-export capabilities
export {
  BROWSER_CAPABILITIES,
  BUN_CAPABILITIES,
  DENO_CAPABILITIES,
  FULL_CAPABILITIES,
  getCapabilities,
  hasCapability,
  NODE_CAPABILITIES,
  UNKNOWN_CAPABILITIES,
  WORKERD_CAPABILITIES,
} from "./capabilities.ts";

// Re-export polyfills
export { posixPath } from "./polyfills/path.ts";

// Re-export file search utilities
export {
  searchFileHierarchy,
  type SearchFileHierarchyOptions,
} from "./file-search.ts";

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
import { getCapabilities, UNKNOWN_CAPABILITIES } from "./capabilities.ts";
import { posixPath } from "./polyfills/path.ts";

// Import adapters - bundlers/tree-shaking will eliminate unused ones
import { createDenoRuntime } from "./adapters/deno.ts";
import { createNodeRuntime } from "./adapters/node.ts";
import { createBunRuntime } from "./adapters/bun.ts";
import { createWorkerdRuntime } from "./adapters/workerd.ts";

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
    remove: throwFs,
    readDir: throwFs,
    copyFile: throwFs,
    rename: throwFs,
    makeTempDir: throwFs,
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
 * Create a minimal runtime for unknown/browser environments.
 */
const createMinimalRuntime = (
  name: Runtime["name"],
  capabilities: RuntimeCapabilities = UNKNOWN_CAPABILITIES,
): Runtime => ({
  name,
  version: "unknown",
  capabilities,
  fs: createStubFs(name),
  path: posixPath,
  exec: createStubExec(name),
  env: createStubEnv(),
  process: createStubProcess(name),
});

/**
 * Runtime factory lookup table.
 */
const runtimeFactories: Partial<Record<RuntimeName, () => Runtime>> = {
  deno: createDenoRuntime,
  node: createNodeRuntime,
  bun: createBunRuntime,
  workerd: createWorkerdRuntime,
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
export const createRuntime = (options?: CreateRuntimeOptions): Runtime => {
  const runtimeName = detectRuntime();
  const capabilities = {
    ...getCapabilities(runtimeName),
    ...options?.capabilities,
  };

  const factory = runtimeFactories[runtimeName];
  const baseRuntime = factory?.() ??
    createMinimalRuntime(runtimeName, capabilities);

  if (options !== undefined && hasOverrides(options)) {
    return mergeRuntime(baseRuntime, options, capabilities);
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
 * import { runtime } from "@eser/standards/runtime";
 *
 * if (runtime.capabilities.fs) {
 *   const data = await runtime.fs.readTextFile("config.json");
 * }
 * ```
 */
export const runtime: Runtime = createRuntime();
