// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cross-runtime abstraction types for @eser/standards/runtime.
 * Provides runtime-agnostic interfaces for filesystem, path, exec, and environment.
 *
 * @module
 */

// =============================================================================
// Runtime Identification
// =============================================================================

/**
 * Known JavaScript runtime names.
 */
export type RuntimeName =
  | "deno"
  | "node"
  | "bun"
  | "workerd"
  | "browser"
  | "unknown";

// =============================================================================
// Platform Types
// =============================================================================

/**
 * Operating system platform.
 * Uses Go-style naming conventions for consistency.
 */
export type Platform = "darwin" | "linux" | "windows";

/**
 * CPU architecture.
 * Uses Go-style naming conventions (amd64 instead of x86_64, arm64 instead of aarch64).
 */
export type Arch = "amd64" | "arm64";

/**
 * Complete platform information.
 * Contains OS, architecture, and common directory paths.
 */
export interface PlatformInfo {
  /** Operating system platform */
  readonly platform: Platform;
  /** CPU architecture */
  readonly arch: Arch;
  /** User's home directory */
  readonly homedir: string;
  /** System temporary directory */
  readonly tmpdir: string;
}

// =============================================================================
// Capability Flags
// =============================================================================

/**
 * Runtime capability flags indicating which features are available.
 * Check these before using optional features like fs or exec.
 *
 * @example
 * ```typescript
 * if (runtime.capabilities.fs) {
 *   await runtime.fs.readTextFile("config.json");
 * }
 * ```
 */
export interface RuntimeCapabilities {
  /** Filesystem access (async) */
  readonly fs: boolean;
  /** Synchronous filesystem access */
  readonly fsSync: boolean;
  /** Process execution (spawn/exec) */
  readonly exec: boolean;
  /** Process control (exit, cwd, chdir) */
  readonly process: boolean;
  /** Environment variable access */
  readonly env: boolean;
  /** Standard input stream */
  readonly stdin: boolean;
  /** Standard output stream */
  readonly stdout: boolean;
  /** Key-value storage (Deno KV, Cloudflare KV) */
  readonly kv: boolean;
}

// =============================================================================
// Filesystem Types
// =============================================================================

/**
 * File or directory information.
 */
export interface FileInfo {
  /** True if this is a regular file */
  readonly isFile: boolean;
  /** True if this is a directory */
  readonly isDirectory: boolean;
  /** True if this is a symbolic link */
  readonly isSymlink: boolean;
  /** File size in bytes */
  readonly size: number;
  /** Last modification time (may be null on some systems) */
  readonly mtime: Date | null;
  /** Last access time (may be null on some systems) */
  readonly atime: Date | null;
  /** Creation time (may be null on some systems) */
  readonly birthtime: Date | null;
}

/**
 * Directory entry returned by readDir.
 */
export interface DirEntry {
  /** Entry name (not full path) */
  readonly name: string;
  /** True if this is a regular file */
  readonly isFile: boolean;
  /** True if this is a directory */
  readonly isDirectory: boolean;
  /** True if this is a symbolic link */
  readonly isSymlink: boolean;
}

/**
 * Options for mkdir operation.
 */
export interface MkdirOptions {
  /** Create parent directories if they don't exist */
  recursive?: boolean;
  /** File mode (permissions) - Unix only */
  mode?: number;
}

/**
 * Options for remove operation.
 */
export interface RemoveOptions {
  /** Remove directories and their contents recursively */
  recursive?: boolean;
}

/**
 * Options for readFile and writeFile operations.
 */
export interface FileOptions {
  /** AbortSignal to cancel the operation */
  signal?: AbortSignal;
}

/**
 * Options for writeFile operation.
 */
export interface WriteFileOptions extends FileOptions {
  /** File mode (permissions) - Unix only */
  mode?: number;
  /** Create file if it doesn't exist (default: true) */
  create?: boolean;
  /** Append to file instead of overwriting */
  append?: boolean;
}

/**
 * Options for makeTempDir operation.
 */
export interface MakeTempOptions {
  /** Directory to create the temp directory in (defaults to system temp dir) */
  dir?: string;
  /** Prefix for the temp directory name */
  prefix?: string;
  /** Suffix for the temp directory name */
  suffix?: string;
}

/**
 * Filesystem abstraction interface.
 * Check `runtime.capabilities.fs` before using.
 */
export interface RuntimeFs {
  /**
   * Read a file as binary data.
   * @throws {NotFoundError} If file doesn't exist
   */
  readFile(path: string, options?: FileOptions): Promise<Uint8Array>;

  /**
   * Read a file as UTF-8 text.
   * @throws {NotFoundError} If file doesn't exist
   */
  readTextFile(path: string, options?: FileOptions): Promise<string>;

  /**
   * Write binary data to a file.
   * Creates the file if it doesn't exist.
   */
  writeFile(
    path: string,
    data: Uint8Array,
    options?: WriteFileOptions,
  ): Promise<void>;

  /**
   * Write text to a file (UTF-8 encoded).
   * Creates the file if it doesn't exist.
   */
  writeTextFile(
    path: string,
    data: string,
    options?: WriteFileOptions,
  ): Promise<void>;

  /**
   * Check if a path exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file or directory information.
   * @throws {NotFoundError} If path doesn't exist
   */
  stat(path: string): Promise<FileInfo>;

  /**
   * Get file or directory information, following symlinks.
   * @throws {NotFoundError} If path doesn't exist
   */
  lstat(path: string): Promise<FileInfo>;

  /**
   * Create a directory.
   * @throws {AlreadyExistsError} If directory exists and recursive is false
   */
  mkdir(path: string, options?: MkdirOptions): Promise<void>;

  /**
   * Remove a file or directory.
   * @throws {NotFoundError} If path doesn't exist
   */
  remove(path: string, options?: RemoveOptions): Promise<void>;

  /**
   * Read directory contents.
   */
  readDir(path: string): AsyncIterable<DirEntry>;

  /**
   * Copy a file.
   */
  copyFile(from: string, to: string): Promise<void>;

  /**
   * Rename/move a file or directory.
   */
  rename(from: string, to: string): Promise<void>;

  /**
   * Create a temporary directory.
   * @returns Path to the created directory
   */
  makeTempDir(options?: MakeTempOptions): Promise<string>;
}

// =============================================================================
// Path Types
// =============================================================================

/**
 * Path utilities interface.
 * Always available - uses polyfill on limited runtimes.
 */
export interface RuntimePath {
  /**
   * Join path segments with the platform separator.
   * @example path.join("src", "lib", "utils.ts") // "src/lib/utils.ts"
   */
  join(...paths: string[]): string;

  /**
   * Resolve a sequence of paths to an absolute path.
   */
  resolve(...paths: string[]): string;

  /**
   * Get the directory name of a path.
   * @example path.dirname("/home/user/file.txt") // "/home/user"
   */
  dirname(path: string): string;

  /**
   * Get the last portion of a path.
   * @example path.basename("/home/user/file.txt") // "file.txt"
   */
  basename(path: string, suffix?: string): string;

  /**
   * Get the extension of a path.
   * @example path.extname("file.txt") // ".txt"
   */
  extname(path: string): string;

  /**
   * Normalize a path, resolving '..' and '.' segments.
   */
  normalize(path: string): string;

  /**
   * Check if a path is absolute.
   */
  isAbsolute(path: string): boolean;

  /**
   * Get the relative path from one path to another.
   */
  relative(from: string, to: string): string;

  /**
   * Parse a path into its components.
   */
  parse(path: string): ParsedPath;

  /**
   * Format path components into a path string.
   */
  format(pathObject: Partial<ParsedPath>): string;

  /** Platform-specific path segment separator ('/' or '\\') */
  readonly sep: string;

  /** Platform-specific path delimiter (':' or ';') */
  readonly delimiter: string;
}

/**
 * Parsed path components.
 */
export interface ParsedPath {
  /** Root of the path (e.g., '/' or 'C:\\') */
  root: string;
  /** Directory portion */
  dir: string;
  /** Full file name including extension */
  base: string;
  /** File extension including the dot */
  ext: string;
  /** File name without extension */
  name: string;
}

// =============================================================================
// Process Execution Types
// =============================================================================

/**
 * Options for spawn operation.
 */
export interface SpawnOptions {
  /** Current working directory for the process */
  cwd?: string;
  /** Environment variables for the process */
  env?: Record<string, string>;
  /** Standard input handling */
  stdin?: "inherit" | "piped" | "null";
  /** Standard output handling */
  stdout?: "inherit" | "piped" | "null";
  /** Standard error handling */
  stderr?: "inherit" | "piped" | "null";
  /** AbortSignal to cancel the process */
  signal?: AbortSignal;
}

/**
 * Result of a spawned process.
 */
export interface ProcessOutput {
  /** True if process exited with code 0 */
  readonly success: boolean;
  /** Exit code */
  readonly code: number;
  /** Standard output as bytes */
  readonly stdout: Uint8Array;
  /** Standard error as bytes */
  readonly stderr: Uint8Array;
}

/**
 * Status of a completed process.
 */
export interface ProcessStatus {
  /** True if process exited with code 0 */
  readonly success: boolean;
  /** Exit code */
  readonly code: number;
  /** Signal that terminated the process (if any) */
  readonly signal?: string;
}

/**
 * Handle to a spawned child process with streaming I/O.
 */
export interface ChildProcess {
  /** Process ID */
  readonly pid: number;

  /** Writable stream for stdin (null if not piped) */
  readonly stdin: WritableStream<Uint8Array> | null;

  /** Readable stream for stdout (null if not piped) */
  readonly stdout: ReadableStream<Uint8Array> | null;

  /** Readable stream for stderr (null if not piped) */
  readonly stderr: ReadableStream<Uint8Array> | null;

  /** Promise that resolves when process exits */
  readonly status: Promise<ProcessStatus>;

  /**
   * Wait for process and get buffered output.
   * Closes stdin if still open.
   */
  output(): Promise<ProcessOutput>;

  /**
   * Kill the process with optional signal.
   * @param signal - Signal to send (e.g., "SIGTERM", "SIGKILL")
   */
  kill(signal?: string): void;
}

/**
 * Process execution interface.
 * Check `runtime.capabilities.exec` before using.
 */
export interface RuntimeExec {
  /**
   * Spawn a process and wait for it to complete.
   *
   * @param cmd - Command to execute
   * @param args - Command arguments
   * @param options - Spawn options
   * @returns Process output with stdout/stderr
   *
   * @example
   * ```typescript
   * const result = await runtime.exec.spawn("git", ["status"]);
   * if (result.success) {
   *   console.log(new TextDecoder().decode(result.stdout));
   * }
   * ```
   */
  spawn(
    cmd: string,
    args?: string[],
    options?: SpawnOptions,
  ): Promise<ProcessOutput>;

  /**
   * Execute a command and return stdout as text.
   * Throws if the command fails.
   *
   * @param cmd - Command to execute
   * @param args - Command arguments
   * @returns stdout as UTF-8 string
   *
   * @example
   * ```typescript
   * const branch = await runtime.exec.exec("git", ["branch", "--show-current"]);
   * ```
   */
  exec(cmd: string, args?: string[], options?: SpawnOptions): Promise<string>;

  /**
   * Execute a command and parse stdout as JSON.
   * Throws if the command fails or JSON is invalid.
   *
   * @param cmd - Command to execute
   * @param args - Command arguments
   * @returns Parsed JSON from stdout
   *
   * @example
   * ```typescript
   * const pkg = await runtime.exec.execJson<PackageJson>("cat", ["package.json"]);
   * ```
   */
  execJson<T = unknown>(
    cmd: string,
    args?: string[],
    options?: SpawnOptions,
  ): Promise<T>;

  /**
   * Spawn a child process with streaming I/O.
   * Returns a handle for interacting with the process.
   *
   * @param cmd - Command to execute
   * @param args - Command arguments
   * @param options - Spawn options
   * @returns Child process handle with streaming I/O
   *
   * @example Piped I/O (streaming pattern)
   * ```typescript
   * const child = runtime.exec.spawnChild("deno", ["fmt", "-"], {
   *   stdin: "piped",
   *   stdout: "piped",
   *   stderr: "null",
   * });
   *
   * // Write to stdin
   * const writer = child.stdin!.getWriter();
   * await writer.write(new TextEncoder().encode(input));
   * await writer.close();
   *
   * // Read output
   * const { stdout } = await child.output();
   * ```
   *
   * @example Interactive (REPL pattern)
   * ```typescript
   * const child = runtime.exec.spawnChild("deno", ["repl"], {
   *   stdin: "inherit",
   *   stdout: "inherit",
   *   stderr: "inherit",
   * });
   *
   * await child.status; // Wait for user to exit
   * ```
   */
  spawnChild(
    cmd: string,
    args?: string[],
    options?: SpawnOptions,
  ): ChildProcess;
}

// =============================================================================
// Environment Types
// =============================================================================

/**
 * Environment variable access interface.
 */
export interface RuntimeEnv {
  /**
   * Get an environment variable value.
   * @returns The value or undefined if not set
   */
  get(key: string): string | undefined;

  /**
   * Set an environment variable.
   */
  set(key: string, value: string): void;

  /**
   * Delete an environment variable.
   */
  delete(key: string): void;

  /**
   * Check if an environment variable exists.
   */
  has(key: string): boolean;

  /**
   * Get all environment variables as an object.
   */
  toObject(): Record<string, string>;
}

// =============================================================================
// Process Types
// =============================================================================

/**
 * Process control interface.
 * Check `runtime.capabilities.process` before using.
 */
export interface RuntimeProcess {
  /**
   * Exit the process with the given exit code.
   * @param code - Exit code (default: 0)
   */
  exit(code?: number): never;

  /**
   * Get the current working directory.
   */
  cwd(): string;

  /**
   * Change the current working directory.
   */
  chdir(path: string): void;

  /**
   * Get the system hostname.
   */
  hostname(): string;

  /**
   * Get the path to the runtime executable.
   */
  execPath(): string;

  /**
   * Command-line arguments passed to the script.
   * Does not include the runtime executable or script name.
   */
  readonly args: readonly string[];

  /**
   * The process ID of the current process.
   */
  readonly pid: number;

  /**
   * Standard input as a readable stream.
   */
  readonly stdin: ReadableStream<Uint8Array>;

  /**
   * Standard output as a writable stream.
   */
  readonly stdout: WritableStream<Uint8Array>;

  /**
   * Standard error as a writable stream.
   */
  readonly stderr: WritableStream<Uint8Array>;
}

// =============================================================================
// Main Runtime Interface
// =============================================================================

/**
 * Main runtime abstraction interface.
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
 * ```
 */
export interface Runtime {
  /** Runtime name (deno, node, bun, workerd, browser, unknown) */
  readonly name: RuntimeName;

  /** Runtime version string */
  readonly version: string;

  /** Capability flags - check before using optional features */
  readonly capabilities: RuntimeCapabilities;

  /**
   * Path utilities.
   * Always available - uses polyfill on limited runtimes.
   */
  readonly path: RuntimePath;

  /**
   * Environment variable access.
   * Always available but may be read-only on some runtimes.
   */
  readonly env: RuntimeEnv;

  /**
   * Filesystem operations.
   * Check `capabilities.fs` before using.
   * @throws {RuntimeCapabilityError} If fs is not available
   */
  readonly fs: RuntimeFs;

  /**
   * Process execution.
   * Check `capabilities.exec` before using.
   * @throws {RuntimeCapabilityError} If exec is not available
   */
  readonly exec: RuntimeExec;

  /**
   * Process control (exit, cwd, chdir).
   * Check `capabilities.process` before using.
   * @throws {RuntimeCapabilityError} If process is not available
   */
  readonly process: RuntimeProcess;
}

// =============================================================================
// Factory Types
// =============================================================================

/**
 * Options for creating a runtime instance.
 * Useful for testing with mocked implementations.
 */
export interface CreateRuntimeOptions {
  /** Override filesystem implementation */
  fs?: RuntimeFs;
  /** Override exec implementation */
  exec?: RuntimeExec;
  /** Override env implementation */
  env?: RuntimeEnv;
  /** Override path implementation */
  path?: RuntimePath;
  /** Override process implementation */
  process?: RuntimeProcess;
  /** Override capabilities */
  capabilities?: Partial<RuntimeCapabilities>;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error thrown when a capability is not available on the current runtime.
 */
export class RuntimeCapabilityError extends Error {
  public readonly capability: keyof RuntimeCapabilities;
  public readonly runtimeName: RuntimeName;

  constructor(
    capability: keyof RuntimeCapabilities,
    runtimeName: RuntimeName,
  ) {
    super(
      `Capability "${capability}" is not available on runtime "${runtimeName}"`,
    );
    this.name = "RuntimeCapabilityError";
    this.capability = capability;
    this.runtimeName = runtimeName;
  }
}

/**
 * Error thrown when a file or directory is not found.
 */
export class NotFoundError extends Error {
  public readonly path: string;

  constructor(path: string) {
    super(`No such file or directory: ${path}`);
    this.name = "NotFoundError";
    this.path = path;
  }
}

/**
 * Error thrown when a file or directory already exists.
 */
export class AlreadyExistsError extends Error {
  public readonly path: string;

  constructor(path: string) {
    super(`File or directory already exists: ${path}`);
    this.name = "AlreadyExistsError";
    this.path = path;
  }
}

/**
 * Error thrown when a process execution fails.
 */
export class ProcessError extends Error {
  public readonly cmd: string;
  public readonly code: number;
  public readonly stderr: string;

  constructor(
    cmd: string,
    code: number,
    stderr: string,
  ) {
    super(`Command "${cmd}" failed with exit code ${code}: ${stderr}`);
    this.name = "ProcessError";
    this.cmd = cmd;
    this.code = code;
    this.stderr = stderr;
  }
}
