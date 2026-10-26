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
  HttpHandler,
  Platform,
  PlatformInfo,
  Runtime,
  RuntimeCapabilities,
  RuntimeEnv,
  RuntimeExec,
  RuntimeFs,
  RuntimeHttp,
  RuntimeName,
  RuntimeProcess,
  ServeHandlerInfo,
  SpawnOptions,
} from "../types.ts";
import * as types from "../types.ts";
import * as path from "../polyfills/path.ts";

// =============================================================================
// Helper Utilities
// =============================================================================

/**
 * Gets an environment variable from the `process` global.
 * Returns undefined if the variable is not set or not accessible.
 */
export const getEnvVar = (key: string): string | undefined => {
  // The Node types declare process as always present, but browsers and
  // workers lack it, so it is read untyped and checked before use.
  // oxlint-disable-next-line typescript/no-explicit-any
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
    // require exists only in CommonJS contexts, while the Node types declare it
    // everywhere; it is read untyped and narrowed by the instanceof check.
    // oxlint-disable-next-line typescript/no-explicit-any
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
 * The fields of the Node.js `process` object that platform detection
 * reads. Each one is optional because a bundler's browser shim of `process`
 * can lack it.
 */
export interface NodeProcessInfo {
  readonly platform?: string;
  readonly arch?: string;
}

/**
 * The field of the `navigator` object that platform detection reads.
 */
export interface NavigatorInfo {
  readonly userAgent?: string;
}

/**
 * Reads a property that holds a string, or undefined when it is absent or
 * holds another type.
 */
const readStringProperty = (
  target: object,
  key: string,
): string | undefined => {
  const value: unknown = Reflect.get(target, key);

  return typeof value === "string" ? value : undefined;
};

/**
 * Narrows a `process` global to the fields platform detection reads.
 * Returns null when the value is not an object.
 */
export const toNodeProcessInfo = (value: unknown): NodeProcessInfo | null => {
  if (!(value instanceof Object)) {
    return null;
  }

  return {
    platform: readStringProperty(value, "platform"),
    arch: readStringProperty(value, "arch"),
  };
};

/**
 * Narrows a `navigator` global to the field platform detection reads.
 * Returns null when the value is not an object.
 */
export const toNavigatorInfo = (value: unknown): NavigatorInfo | null => {
  if (!(value instanceof Object)) {
    return null;
  }

  return { userAgent: readStringProperty(value, "userAgent") };
};

/**
 * Gets the platform fields of the Node.js process object, or null when
 * the runtime has no `process` global. The global is read as unknown because
 * the Node types declare it as always present, while browsers and workers
 * lack it.
 */
export const getProcess = (): NodeProcessInfo | null =>
  toNodeProcessInfo(Reflect.get(globalThis, "process"));

/**
 * Gets the user agent field of the `navigator` object, or null when the
 * runtime has no `navigator` global.
 */
export const getNavigator = (): NavigatorInfo | null =>
  toNavigatorInfo(Reflect.get(globalThis, "navigator"));

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

// Detection probes globals (process, caches, window) that exist in
// only some runtimes, so they are read untyped and checked with typeof.
// oxlint-disable-next-line typescript/no-explicit-any
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
 * 1. Node.js - has process.versions.node
 * 2. Cloudflare Workers (workerd) - has caches and Response but no window
 * 3. Browser - has window/document
 * 4. Unknown - fallback
 */
export const detectRuntime = (): RuntimeName => {
  if (typeof globalThis === "undefined") return "unknown";

  const proc = globalRef.process;
  if (typeof proc?.versions?.node === "string") return "node";

  if (isWorkerdEnv()) return "workerd";
  if (isBrowserEnv()) return "browser";

  return "unknown";
};

/**
 * Version getters by runtime.
 */
const versionGetters: Record<RuntimeName, () => string> = {
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
const SERVER_RUNTIMES: ReadonlySet<RuntimeName> = new Set(["node"]);

/**
 * Check if running in a server-side runtime (Node).
 */
export const isServer = (): boolean => SERVER_RUNTIMES.has(detectRuntime());

/**
 * Check if running in an edge runtime (Workers).
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
  // Node.js
  const proc = getProcess();
  if (proc?.platform !== undefined) {
    return PLATFORM_MAP[proc.platform] ?? "linux";
  }

  // Browser detection via userAgent
  const nav = getNavigator();
  if (nav?.userAgent !== undefined) {
    const ua = nav.userAgent.toLowerCase();
    if (ua.includes("mac")) return "darwin";
    if (ua.includes("win")) return "windows";
    if (ua.includes("linux")) return "linux";
  }

  return "linux";
};

// Keys are the names that Node's process.arch and browser user agents report.
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
  // Node.js
  const proc = getProcess();
  if (proc?.arch !== undefined) {
    return ARCH_MAP[proc.arch] ?? "amd64";
  }

  // Browser detection via userAgent
  const nav = getNavigator();
  if (nav?.userAgent !== undefined) {
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
  const isWindows = getPlatform() === "windows";

  // Use the platform's own temp-dir env-var precedence. On Windows the
  // canonical vars are TMP/TEMP (what os.tmpdir() and the Win32 GetTempPath
  // API consult); TMPDIR is a POSIX convention the Windows
  // runtime ignores. Checking them in platform order keeps getTmpdir()
  // consistent with where temp files are actually created.
  const tmp = isWindows
    ? getFirstEnvVar("TMP", "TEMP", "TMPDIR")
    : getFirstEnvVar("TMPDIR", "TMP", "TEMP");
  if (tmp) return tmp;

  const os = tryRequire<NodeOsModule>("os");
  if (os?.tmpdir) {
    return os.tmpdir();
  }

  return isWindows ? "C:\\Windows\\Temp" : "/tmp";
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
      args?: string[],
      options?: SpawnOptions,
    ): Promise<string> {
      const result = await spawnFn(cmd, args, options);

      if (!result.success) {
        const stderr = new TextDecoder().decode(result.stderr);
        throw new types.ProcessError(cmd, result.code, stderr);
      }

      return new TextDecoder().decode(result.stdout).trim();
    },

    async execJson<T = unknown>(
      cmd: string,
      args?: string[],
      options?: SpawnOptions,
    ): Promise<T> {
      const output = await execAdapter.exec(cmd, args, options);
      return JSON.parse(output) as T;
    },
  };

  return execAdapter;
};

// =============================================================================
// Shared HTTP Composition
// =============================================================================

/** The address `runtime.http.serve` listens on when the caller names none. */
export const DEFAULT_SERVE_HOSTNAME = "127.0.0.1";

/**
 * Wraps a serve handler so that an error it throws becomes a 500 response.
 *
 * Node has no fetch-style server that answers such an error, so the adapter
 * wraps the handler itself.
 *
 * @param handler - The caller's handler
 * @returns A handler that never rejects
 */
export const createSafeHandler =
  (
    handler: HttpHandler,
  ): ((request: Request, info: ServeHandlerInfo) => Promise<Response>) =>
  async (request, info) => {
    try {
      return await handler(request, info);
    } catch (error) {
      // The query string is left out because it can carry tokens.
      const { pathname } = new URL(request.url);
      reportServeError(
        `the handler threw for ${request.method} ${pathname}; the client got a 500 response.`,
        error,
      );

      return new Response("Internal Server Error", { status: 500 });
    }
  };

/**
 * Prints an error of `runtime.http.serve` that has no other owner, such as one
 * a handler did not catch.
 *
 * @param problem - What failed, without request data that can hold secrets
 * @param error - The error
 */
export const reportServeError = (problem: string, error: unknown): void => {
  // standards cannot depend on @eserstack/logging, and stderr is where the
  // runtimes' own servers report these errors.
  // oxlint-disable-next-line no-console
  console.error(`runtime.http.serve: ${problem}`, error);
};

// =============================================================================
// Stub Factories
// =============================================================================

const createThrowFn = (
  capability: keyof RuntimeCapabilities,
  runtimeName: RuntimeName,
): (() => never) => {
  return () => {
    throw new types.RuntimeCapabilityError(capability, runtimeName);
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
    statSync: throwFs,
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
export const createStubProcess = (runtimeName: RuntimeName): RuntimeProcess => {
  const throwProcess = createThrowFn("process", runtimeName);

  return {
    exit: throwProcess,
    setExitCode: throwProcess,
    cwd: throwProcess,
    chdir: throwProcess,
    hostname: throwProcess,
    execPath: throwProcess,
    // A runtime with no process model runs no single executable application.
    isStandalone: false,
    // Answered rather than thrown. A runtime with no process model has no live
    // processes to speak of, and callers use this to decide whether a recorded
    // claim still stands — throwing would turn "no process model" into a crash
    // on a question that has a correct answer here.
    isAlive: (): boolean => false,
    addSignalListener: throwProcess,
    removeSignalListener: throwProcess,
    get argv(): readonly string[] {
      throw new types.RuntimeCapabilityError("process", runtimeName);
    },
    get argv0(): string {
      throw new types.RuntimeCapabilityError("process", runtimeName);
    },
    get args(): readonly string[] {
      throw new types.RuntimeCapabilityError("process", runtimeName);
    },
    get pid(): number {
      throw new types.RuntimeCapabilityError("process", runtimeName);
    },
    get stdin(): ReadableStream<Uint8Array> {
      throw new types.RuntimeCapabilityError("process", runtimeName);
    },
    get stdout(): WritableStream<Uint8Array> {
      throw new types.RuntimeCapabilityError("process", runtimeName);
    },
    get stderr(): WritableStream<Uint8Array> {
      throw new types.RuntimeCapabilityError("process", runtimeName);
    },
    isTerminal(): boolean {
      return false;
    },
    setStdinRaw(): void {
      throw new types.RuntimeCapabilityError("process", runtimeName);
    },
    writeToStdout(): void {
      throw new types.RuntimeCapabilityError("process", runtimeName);
    },
    consoleSize(): { columns: number; rows: number } {
      return { columns: 80, rows: 24 };
    },
  };
};

/**
 * Creates a stub HTTP adapter that throws on all operations.
 */
export const createStubHttp = (runtimeName: RuntimeName): RuntimeHttp => {
  const throwHttp = createThrowFn("http", runtimeName);

  return {
    serve: throwHttp,
    upgradeWebSocket: throwHttp,
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
    http: false,
  },
  fs: createStubFs(name),
  path: path.posixPath,
  exec: createStubExec(name),
  env: createStubEnv(),
  process: createStubProcess(name),
  http: createStubHttp(name),
});
