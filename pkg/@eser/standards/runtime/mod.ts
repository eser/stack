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

/**
 * Create a minimal runtime for unknown/browser environments.
 */
const createMinimalRuntime = (
  name: Runtime["name"],
  capabilities: RuntimeCapabilities = UNKNOWN_CAPABILITIES,
): Runtime => {
  const throwFs = (): never => {
    throw new RuntimeCapabilityError("fs", name);
  };

  const throwExec = (): never => {
    throw new RuntimeCapabilityError("exec", name);
  };

  const throwProcess = (): never => {
    throw new RuntimeCapabilityError("process", name);
  };

  return {
    name,
    version: "unknown",
    capabilities,
    fs: {
      readFile: throwFs,
      readTextFile: throwFs,
      writeFile: throwFs,
      writeTextFile: throwFs,
      exists: throwFs,
      stat: throwFs,
      lstat: throwFs,
      mkdir: throwFs,
      remove: throwFs,
      readDir: () => {
        throw new RuntimeCapabilityError("fs", name);
      },
      copyFile: throwFs,
      rename: throwFs,
      makeTempDir: throwFs,
    },
    path: posixPath,
    exec: {
      spawn: throwExec,
      exec: throwExec,
      execJson: throwExec,
      spawnChild: throwExec,
    },
    env: {
      get: () => undefined,
      set: () => {},
      delete: () => {},
      has: () => false,
      toObject: () => ({}),
    },
    process: {
      exit: throwProcess,
      cwd: throwProcess,
      chdir: throwProcess,
      hostname: throwProcess,
      execPath: throwProcess,
      get args(): readonly string[] {
        throw new RuntimeCapabilityError("process", name);
      },
      get pid(): number {
        throw new RuntimeCapabilityError("process", name);
      },
      get stdin(): ReadableStream<Uint8Array> {
        throw new RuntimeCapabilityError("process", name);
      },
      get stdout(): WritableStream<Uint8Array> {
        throw new RuntimeCapabilityError("process", name);
      },
      get stderr(): WritableStream<Uint8Array> {
        throw new RuntimeCapabilityError("process", name);
      },
    },
  };
};

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

  // Get base runtime
  let baseRuntime: Runtime;

  switch (runtimeName) {
    case "deno":
      baseRuntime = createDenoRuntime();
      break;

    case "node":
      baseRuntime = createNodeRuntime();
      break;

    case "bun":
      baseRuntime = createBunRuntime();
      break;

    case "workerd":
      baseRuntime = createWorkerdRuntime();
      break;

    default:
      baseRuntime = createMinimalRuntime(runtimeName, capabilities);
  }

  // If overrides are provided, merge them
  if (
    options?.fs || options?.exec || options?.env || options?.path ||
    options?.process
  ) {
    return {
      name: baseRuntime.name,
      version: baseRuntime.version,
      capabilities,
      fs: options.fs ?? baseRuntime.fs,
      path: options.path ?? baseRuntime.path,
      exec: options.exec ?? baseRuntime.exec,
      env: options.env ?? baseRuntime.env,
      process: options.process ?? baseRuntime.process,
    };
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
