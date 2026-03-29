// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared base layer for all runtime adapters.
 * Provides platform detection, helper utilities, stdio mapping,
 * shared exec composition, and stub factories.
 *
 * @module
 */

import type {
  Arch,
  Platform,
  PlatformInfo,
  Runtime,
  RuntimeCapabilities,
  RuntimeEnv,
  RuntimeExec,
  RuntimeFs,
  RuntimeName,
  RuntimeProcess,
  SpawnOptions,
} from "../types.ts";
import { ProcessError, RuntimeCapabilityError } from "../types.ts";
import { posixPath } from "../polyfills/path.ts";

// =============================================================================
// Helper Utilities
// =============================================================================

/**
 * Gets an environment variable from any runtime (Deno, Node, Bun).
 * Returns undefined if the variable is not set or not accessible.
 */
export const getEnvVar = (key: string): string | undefined => {
  // Deno
  if (typeof Deno !== "undefined" && Deno.env?.get) {
    return Deno.env.get(key);
  }

  // Node.js / Bun
  // deno-lint-ignore no-explicit-any
  const proc = (globalThis as any).process;
  if (proc?.env) {
    return proc.env[key];
  }

  return undefined;
};

/**
 * Gets the first defined environment variable from a list of keys.
 * Useful for checking multiple fallback env vars like TMPDIR, TMP, TEMP.
 */
export const getFirstEnvVar = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = getEnvVar(key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
};

/**
 * Safely requires a Node.js module.
 * Returns undefined if require is not available or module doesn't exist.
 */
export const tryRequire = <T>(moduleName: string): T | undefined => {
  try {
    // deno-lint-ignore no-explicit-any
    const requireFn = (globalThis as any).require;
    if (requireFn instanceof Function) {
      return requireFn(moduleName) as T;
    }
  } catch {
    // Ignore - module not available
  }
  return undefined;
};

/**
 * Gets the Node.js process object if available.
 */
// deno-lint-ignore no-explicit-any
export const getProcess = (): any | undefined => {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).process;
};

/**
 * Gets the browser navigator object if available.
 */
// deno-lint-ignore no-explicit-any
export const getNavigator = (): any | undefined => {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).navigator;
};

/**
 * Type for Node.js os module methods we use.
 */
export interface NodeOsModule {
  homedir?: () => string;
  tmpdir?: () => string;
  hostname?: () => string;
}

// =============================================================================
// Runtime Detection
// =============================================================================

// deno-lint-ignore no-explicit-any
const globalRef = globalThis as any;

/**
 * Check if running in Cloudflare Workers environment.
 */
const isWorkerdEnv = (): boolean =>
  typeof globalRef.caches !== "undefined" &&
  typeof globalRef.Request !== "undefined" &&
  typeof globalRef.Response !== "undefined" &&
  typeof globalRef.window === "undefined" &&
  typeof globalRef.document === "undefined";

/**
 * Check if running in browser environment.
 */
const isBrowserEnv = (): boolean =>
  typeof globalRef.window !== "undefined" ||
  typeof globalRef.document !== "undefined";

/**
 * Detects the current JavaScript runtime environment.
 *
 * Detection order matters:
 * 1. Bun - check first because Bun also sets process.versions.node
 * 2. Deno - unique Deno global
 * 3. Node.js - has process.versions.node but not Bun
 * 4. Cloudflare Workers (workerd) - has caches and Response but no window
 * 5. Browser - has window/document
 * 6. Unknown - fallback
 */
export const detectRuntime = (): RuntimeName => {
  if (typeof globalThis === "undefined") return "unknown";

  if (typeof globalRef.Bun !== "undefined") return "bun";
  if (typeof globalRef.Deno !== "undefined") return "deno";

  const proc = globalRef.process;
  if (proc?.versions?.node && !proc?.versions?.bun) return "node";

  if (isWorkerdEnv()) return "workerd";
  if (isBrowserEnv()) return "browser";

  return "unknown";
};

/**
 * Version getters by runtime.
 */
const versionGetters: Record<RuntimeName, () => string> = {
  deno: () => globalRef.Deno?.version?.deno ?? "unknown",
  bun: () => globalRef.Bun?.version ?? "unknown",
  node: () => globalRef.process?.versions?.node ?? "unknown",
  workerd: () => "unknown",
  browser: () => globalRef.navigator?.userAgent ?? "unknown",
  unknown: () => "unknown",
};

/**
 * Gets the version string for the current runtime.
 */
export const getRuntimeVersion = (): string =>
  versionGetters[detectRuntime()]();

/**
 * Check if running in the specified runtime.
 */
export const isRuntime = (runtime: RuntimeName): boolean =>
  detectRuntime() === runtime;

/**
 * Check if running in a browser.
 */
export const isBrowser = (): boolean => detectRuntime() === "browser";

/**
 * Server-side runtime names.
 */
const SERVER_RUNTIMES: ReadonlySet<RuntimeName> = new Set([
  "deno",
  "node",
  "bun",
]);

/**
 * Check if running in a server-side runtime (Deno, Node, Bun).
 */
export const isServer = (): boolean => SERVER_RUNTIMES.has(detectRuntime());

/**
 * Check if running in an edge runtime (Workers, Deno Deploy).
 */
export const isEdge = (): boolean => detectRuntime() === "workerd";

// =============================================================================
// Platform Detection
// =============================================================================

const PLATFORM_MAP: Record<string, Platform> = {
  darwin: "darwin",
  linux: "linux",
  windows: "windows",
  win32: "windows",
};

/**
 * Detects the current operating system platform.
 * Returns Go-style platform names for consistency.
 */
export const getPlatform = (): Platform => {
  // Deno
  if (typeof Deno !== "undefined" && Deno.build?.os) {
    return PLATFORM_MAP[Deno.build.os] ?? "linux";
  }

  // Node.js / Bun
  const proc = getProcess();
  if (proc?.platform) {
    return PLATFORM_MAP[proc.platform] ?? "linux";
  }

  // Browser detection via userAgent
  const nav = getNavigator();
  if (nav?.userAgent) {
    const ua = nav.userAgent.toLowerCase();
    if (ua.includes("mac")) return "darwin";
    if (ua.includes("win")) return "windows";
    if (ua.includes("linux")) return "linux";
  }

  return "linux";
};

const ARCH_MAP: Record<string, Arch> = {
  x86_64: "amd64",
  x64: "amd64",
  aarch64: "arm64",
  arm64: "arm64",
};

/**
 * Detects the current CPU architecture.
 * Returns Go-style architecture names (amd64 instead of x86_64).
 */
export const getArch = (): Arch => {
  // Deno
  if (typeof Deno !== "undefined" && Deno.build?.arch) {
    return ARCH_MAP[Deno.build.arch] ?? "amd64";
  }

  // Node.js / Bun
  const proc = getProcess();
  if (proc?.arch) {
    return ARCH_MAP[proc.arch] ?? "amd64";
  }

  // Browser detection via userAgent
  const nav = getNavigator();
  if (nav?.userAgent) {
    const ua = nav.userAgent.toLowerCase();
    if (ua.includes("arm64") || ua.includes("aarch64")) return "arm64";
  }

  return "amd64";
};

/**
 * Gets the user's home directory.
 */
export const getHomedir = (): string => {
  const home = getFirstEnvVar("HOME", "USERPROFILE");
  if (home) return home;

  const os = tryRequire<NodeOsModule>("os");
  if (os?.homedir) {
    return os.homedir();
  }

  return getPlatform() === "windows" ? "C:\\Users\\Default" : "/home";
};

/**
 * Gets the system temporary directory.
 */
export const getTmpdir = (): string => {
  const tmp = getFirstEnvVar("TMPDIR", "TMP", "TEMP");
  if (tmp) return tmp;

  const os = tryRequire<NodeOsModule>("os");
  if (os?.tmpdir) {
    return os.tmpdir();
  }

  return getPlatform() === "windows" ? "C:\\Windows\\Temp" : "/tmp";
};

/**
 * Gets complete platform information.
 */
export const getPlatformInfo = (): PlatformInfo => ({
  platform: getPlatform(),
  arch: getArch(),
  homedir: getHomedir(),
  tmpdir: getTmpdir(),
});

// =============================================================================
// Stdio Mapping
// =============================================================================

export type StdioMode = "inherit" | "piped" | "null" | undefined;
export type NodeStdioMode = "inherit" | "pipe" | "ignore";
export type DenoStdioMode = "inherit" | "piped" | "null";
export type ResolvedStdioMode = "inherit" | "piped" | "null";

export interface StdioModes {
  readonly stdin: ResolvedStdioMode;
  readonly stdout: ResolvedStdioMode;
  readonly stderr: ResolvedStdioMode;
}

export const mapStdioToNode = (mode: StdioMode): NodeStdioMode => {
  if (mode === "inherit") return "inherit";
  if (mode === "piped") return "pipe";
  return "ignore";
};

export const mapStdioToDeno = (mode: StdioMode): DenoStdioMode => {
  if (mode === "inherit") return "inherit";
  if (mode === "piped") return "piped";
  return "null";
};

export const getStdioModes = (options?: SpawnOptions): StdioModes => ({
  stdin: options?.stdin ?? "null",
  stdout: options?.stdout ?? "piped",
  stderr: options?.stderr ?? "piped",
});

export const getNodeStdioArray = (
  options?: SpawnOptions,
): [NodeStdioMode, NodeStdioMode, NodeStdioMode] => {
  const modes = getStdioModes(options);
  return [
    mapStdioToNode(modes.stdin),
    mapStdioToNode(modes.stdout),
    mapStdioToNode(modes.stderr),
  ];
};

export const getDenoStdioOptions = (options?: SpawnOptions) => {
  const modes = getStdioModes(options);
  return {
    stdin: mapStdioToDeno(modes.stdin),
    stdout: mapStdioToDeno(modes.stdout),
    stderr: mapStdioToDeno(modes.stderr),
  };
};

// =============================================================================
// Shared Exec Composition
// =============================================================================

/**
 * Creates a RuntimeExec by composing runtime-specific spawn/spawnChild
 * with shared exec/execJson wrappers.
 *
 * Only spawn() and spawnChild() differ per runtime.
 * exec() and execJson() are identical wrappers that just parse output.
 */
export const createSharedExec = (
  spawnFn: RuntimeExec["spawn"],
  spawnChildFn: RuntimeExec["spawnChild"],
): RuntimeExec => {
  const execAdapter: RuntimeExec = {
    spawn: spawnFn,
    spawnChild: spawnChildFn,

    async exec(
      cmd: string,
      args: string[] = [],
      options?: SpawnOptions,
    ): Promise<string> {
      const result = await spawnFn(cmd, args, options);

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
      const output = await execAdapter.exec(cmd, args, options);
      return JSON.parse(output) as T;
    },
  };

  return execAdapter;
};

// =============================================================================
// Stub Factories
// =============================================================================

const createThrowFn = (
  capability: keyof RuntimeCapabilities,
  runtimeName: RuntimeName,
): () => never => {
  return () => {
    throw new RuntimeCapabilityError(capability, runtimeName);
  };
};

/**
 * Creates a stub filesystem adapter that throws on all operations.
 */
export const createStubFs = (runtimeName: RuntimeName): RuntimeFs => {
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
export const createStubExec = (runtimeName: RuntimeName): RuntimeExec => {
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
export const createStubProcess = (
  runtimeName: RuntimeName,
): RuntimeProcess => {
  const throwProcess = createThrowFn("process", runtimeName);

  return {
    exit: throwProcess,
    setExitCode: throwProcess,
    cwd: throwProcess,
    chdir: throwProcess,
    hostname: throwProcess,
    execPath: throwProcess,
    get argv(): readonly string[] {
      throw new RuntimeCapabilityError("process", runtimeName);
    },
    get argv0(): string {
      throw new RuntimeCapabilityError("process", runtimeName);
    },
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
export const createStubEnv = (): RuntimeEnv => ({
  get: () => undefined,
  set: () => {},
  delete: () => {},
  has: () => false,
  toObject: () => ({}),
});

/**
 * Creates a fallback runtime for unknown or limited environments.
 */
export const createFallbackRuntime = (name: RuntimeName): Runtime => ({
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
