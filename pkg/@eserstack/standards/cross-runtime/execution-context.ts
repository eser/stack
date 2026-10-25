// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CLI execution context detection.
 *
 * Determines how the CLI was invoked and provides the best command string
 * for git hook generation.
 *
 * Architecture:
 * ```
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  PURE (testable without mocks):                                  │
 * │    resolvePathDirs(pathStr, platform)    → string[]              │
 * │    detectInvoker(execBasename,                                   │
 * │                  runtimeName, argv,                              │
 * │                  envVars,                                        │
 * │                  isDevContext?)          → { invoker, mode }     │
 * │    buildCommand(invoker, mode, opts)     → string                │
 * │    matchCliPrefix(subs, argv)            → string | undefined    │
 * │                                                                  │
 * │  ASYNC (thin shell over pure functions):                         │
 * │    isCommandInPath(name)                 → Promise<boolean>      │
 * │    getCliPrefix(opts, subs)              → Promise<string?>      │
 * │    detectExecutionContext(opts)          → Promise<CliContext>   │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 *
 * Circular import note: the async functions read `runtime` from `./mod.ts`,
 * while `mod.ts` re-exports from this file. This works because ES module
 * namespace objects are live views: `mod.runtime` is read only inside function
 * bodies, never while the module evaluates.
 *
 * @module
 */

import * as shared from "./adapters/shared.ts";
import * as mod from "./mod.ts";
import type { Platform } from "./types.ts";

// =============================================================================
// Types
// =============================================================================

/** The JavaScript runtime the CLI is running under. */
export type CliRuntime = "node" | "compiled";

/** Whether the CLI was installed or invoked on-demand. */
export type CliMode = "installed" | "on-demand" | "dev";

/**
 * The specific mechanism used to invoke the CLI.
 *
 * ```
 * binary  — single executable application (a Node SEA build)
 * npm     — npm install -g eser
 * npx     — npx eser (on-demand, never installed)
 * pnpm    — pnpm install -g eser
 * pnpx    — pnpx eser / pnpm dlx eser (on-demand)
 * dev     — pnpm cli (project-local workspace)
 * unknown — could not determine
 * ```
 */
export type CliInvoker =
  | "binary"
  | "npm"
  | "npx"
  | "pnpm"
  | "pnpx"
  | "dev"
  | "unknown";

/** Full context describing how the CLI is being executed. */
export type CliExecutionContext = {
  readonly runtime: CliRuntime;
  readonly mode: CliMode;
  readonly invoker: CliInvoker;
  /** The command string that reproduces the current invocation. */
  readonly command: string;
  /** Whether the binary name (opts.command) is available in PATH. */
  readonly isInPath: boolean;
};

/**
 * Options for CLI command resolution.
 *
 * All fields are eser-specific — keeping them here lets @eserstack/standards
 * stay free of hardcoded package names.
 */
export type CliCommandOptions = {
  /** Binary name to look for in PATH (e.g. "eser") */
  readonly command: string;
  /** Command for dev/workspace mode (e.g. "pnpm cli") */
  readonly devCommand: string;
  /** npm package name for npx/pnpx (e.g. "eser") */
  readonly npmPackage: string;
};

// =============================================================================
// Pure functions (no I/O — fully testable without mocks)
// =============================================================================

/**
 * Splits a PATH environment variable string into individual directory entries.
 * Filters out empty segments (e.g. from `::` on Unix or `;;` on Windows).
 */
export const resolvePathDirs = (pathStr: string, os: Platform): string[] => {
  const sep = os === "windows" ? ";" : ":";

  return pathStr.split(sep).filter((dir) => dir.length > 0);
};

/**
 * Known runtime executable names.
 */
const KNOWN_RUNTIMES: ReadonlySet<string> = new Set(["node"]);

/**
 * Determines the CLI invoker and mode from process introspection data.
 *
 * All parameters are plain data values — no I/O. The async entry point
 * (`detectExecutionContext`) reads the real environment and passes results here.
 *
 * Detection uses `execBasename` (from `basename(execPath())`) as the primary
 * signal for identifying the runtime. When `execBasename` doesn't match a known
 * runtime (e.g. custom binary names like "node20", "n25.0" from version managers),
 * `runtimeName` (from `detectRuntime()`) is used as a fallback.
 *
 * Decision tree:
 * ```
 * runtime not "node"              → binary/installed
 * runtime="node":
 *   isDevContext=true             → dev/dev
 *   argv[1] ~ "_npx" or "npx"     → npx/on-demand
 *   argv[1] ~ "pnpm" or "pnpx"    → pnpx/on-demand
 *   npm_execpath ~ "npx"          → npx/on-demand   (env fallback)
 *   npm_execpath ~ "pnpm"         → pnpx/on-demand  (env fallback)
 *   npm_config_user_agent~"pnpm"  → pnpm/installed
 *   else                          → npm/installed
 * ```
 */
export const detectInvoker = (
  execBasename: string,
  runtimeName: string,
  argv: readonly string[],
  envVars: Record<string, string | undefined>,
  isDevContext?: boolean,
): { invoker: CliInvoker; mode: CliMode } => {
  // Use execBasename when it's a known runtime, otherwise fall back to
  // runtimeName (from detectRuntime). Handles custom binary names like
  // "node20", "n25.0" from version managers (nvm, fnm, volta, etc.).
  const runtime = KNOWN_RUNTIMES.has(execBasename) ? execBasename : runtimeName;

  // Neither exec nor runtime detection matched — compiled binary
  if (!KNOWN_RUNTIMES.has(runtime)) {
    return { invoker: "binary", mode: "installed" };
  }

  if (runtime === "node") {
    // A workspace script such as `pnpm cli` also sets npm_execpath, so the
    // dev context is checked before the package manager hints.
    if (isDevContext === true) {
      return { invoker: "dev", mode: "dev" };
    }

    const scriptPath = argv[1] ?? "";

    // Check argv[1] (script path) for package manager hints
    if (scriptPath.includes("_npx") || scriptPath.includes("/npx")) {
      return { invoker: "npx", mode: "on-demand" };
    }
    if (scriptPath.includes("pnpm") || scriptPath.includes("pnpx")) {
      return { invoker: "pnpx", mode: "on-demand" };
    }

    // Fallback to env vars for package manager disambiguation
    const npmExecpath = envVars["npm_execpath"] ?? "";

    if (npmExecpath.includes("npx")) {
      return { invoker: "npx", mode: "on-demand" };
    }
    if (npmExecpath.includes("pnpm")) {
      return { invoker: "pnpx", mode: "on-demand" };
    }

    const userAgent = envVars["npm_config_user_agent"] ?? "";

    if (userAgent.includes("pnpm")) {
      return { invoker: "pnpm", mode: "installed" };
    }

    return { invoker: "npm", mode: "installed" };
  }

  return { invoker: "unknown", mode: "installed" };
};

/**
 * Builds the CLI command string from invoker context and options.
 *
 * | Invoker                  | Mode       | Command                 |
 * |--------------------------|------------|-------------------------|
 * | binary/npm/pnpm/unknown  | installed  | opts.command            |
 * | npx                      | on-demand  | npx {opts.npmPackage}   |
 * | pnpx                     | on-demand  | pnpx {opts.npmPackage}  |
 * | dev                      | dev        | opts.devCommand         |
 */
export const buildCommand = (
  invoker: CliInvoker,
  _mode: CliMode,
  opts: CliCommandOptions,
): string => {
  if (invoker === "npx") return `npx ${opts.npmPackage}`;
  if (invoker === "pnpx") return `pnpx ${opts.npmPackage}`;
  if (invoker === "dev") return opts.devCommand;

  return opts.command;
};

// =============================================================================
// Async functions (thin shells over pure functions — use real environment)
// =============================================================================

/**
 * Reports whether the package.json in `dir` has a "cli" script. A missing or
 * unparseable file counts as no.
 */
const hasCliScript = async (dir: string): Promise<boolean> => {
  try {
    const content = await mod.runtime.fs.readTextFile(
      mod.runtime.path.join(dir, "package.json"),
    );
    const parsed: unknown = JSON.parse(content);
    if (!(parsed instanceof Object)) {
      return false;
    }

    const scripts: unknown = Reflect.get(parsed, "scripts");

    return scripts instanceof Object && "cli" in scripts;
  } catch {
    return false;
  }
};

/**
 * Checks if a named binary exists anywhere in PATH.
 *
 * Cross-platform: uses `;` separator and `.exe` extension on Windows.
 * Uses filesystem `stat()` rather than spawning `which`/`where`.
 */
export const isCommandInPath = async (name: string): Promise<boolean> => {
  const os = shared.getPlatform();
  const exeName = os === "windows" ? `${name}.exe` : name;
  const pathStr = mod.runtime.env.get("PATH") ?? "";
  const dirs = resolvePathDirs(pathStr, os);

  for (const dir of dirs) {
    try {
      // PATH order decides which binary runs, and the first hit ends the scan.
      // oxlint-disable-next-line no-await-in-loop
      await mod.runtime.fs.stat(mod.runtime.path.join(dir, exeName));
      return true;
    } catch {
      continue;
    }
  }

  return false;
};

/**
 * Find the CLI invocation prefix by scanning argv for a subcommand.
 *
 * Returns everything in argv up to and including the matched subcommand,
 * joined as a single string. This is the command the user typed to reach
 * the subcommand.
 *
 * Handles both exact matches (`["eser", "noskills", "init"]` → `"eser noskills"`)
 * and embedded matches (`["npx", "-y", "npm:noskills", "init"]` → `"npx -y npm:noskills"`).
 *
 * Pure function for testability.
 */
export const matchCliPrefix = (
  subcommands: readonly string[],
  argv: readonly string[],
): string | undefined => {
  for (const sub of subcommands) {
    // Exact match — subcommand is a standalone argv element
    const exactIdx = argv.indexOf(sub);
    if (exactIdx >= 0) {
      return argv.slice(0, exactIdx + 1).join(" ");
    }

    // Embedded match — subcommand in a path or package specifier
    // e.g., /path/to/noskills, npm:noskills, jsr:@eserstack/noskills
    const embeddedIdx = argv.findIndex(
      (arg) =>
        arg.endsWith(`/${sub}`) ||
        arg.endsWith(`\\${sub}`) ||
        arg.includes(`:${sub}`),
    );
    if (embeddedIdx >= 0) {
      return argv.slice(0, embeddedIdx + 1).join(" ");
    }
  }

  return undefined;
};

/**
 * Find the canonical CLI invocation prefix for a subcommand.
 *
 * Detects the execution context (how the CLI was invoked), then searches
 * argv for the subcommand to produce a reproducible hook command.
 *
 * Honors the user's choice: if they ran `npx eser noskills init`, the prefix
 * will be `"npx eser noskills"` — not whatever happens to be in PATH.
 *
 * @param opts - CLI command options (binary name, npm/jsr packages, dev command)
 * @param subcommands - Subcommand aliases to search for (e.g., ["noskills", "nos"])
 *
 * @example
 * ```typescript
 * import * as standards from "@eserstack/standards";
 *
 * const ESER_OPTS = {
 *   command: "eser",
 *   devCommand: "pnpm cli",
 *   npmPackage: "eser",
 * };
 *
 * await standards.crossRuntime.getCliPrefix(ESER_OPTS, ["noskills", "nos"]);
 * // → "npx eser noskills"  (when invoked via npx)
 * // → "pnpm cli nos"       (when invoked via pnpm cli)
 * // → "eser noskills"      (when installed globally)
 * ```
 */
export const getCliPrefix = async (
  opts: CliCommandOptions,
  subcommands: readonly string[],
): Promise<string | undefined> => {
  const ctx = await detectExecutionContext(opts);
  const argv = mod.runtime.process.argv;

  for (const sub of subcommands) {
    // Exact match in argv
    if (argv.includes(sub)) {
      return `${ctx.command} ${sub}`;
    }

    // Embedded in package specifier / path
    const hasEmbedded = argv.some(
      (arg) =>
        arg.endsWith(`/${sub}`) ||
        arg.endsWith(`\\${sub}`) ||
        arg.includes(`:${sub}`),
    );
    if (hasEmbedded) {
      return ctx.command;
    }
  }

  return undefined;
};

/**
 * Detects the full CLI execution context by reading the real environment.
 *
 * Combines runtime detection, invoker detection, command resolution, and
 * PATH lookup into a single async call. A single executable application
 * counts as a binary whatever its file is named.
 */
export const detectExecutionContext = async (
  opts: CliCommandOptions,
): Promise<CliExecutionContext> => {
  const execBasename = mod.runtime.path.basename(
    mod.runtime.process.execPath(),
  );
  const runtimeName = mod.runtime.process.isStandalone
    ? "compiled"
    : shared.detectRuntime();
  const argv = mod.runtime.process.argv;
  const mainModule = import.meta.url;

  // Resolve the effective runtime: prefer execBasename, fall back to
  // detectRuntime() for custom binary names (nvm, fnm, volta, etc.)
  const effectiveRuntime = KNOWN_RUNTIMES.has(execBasename)
    ? execBasename
    : runtimeName;

  // Keys are the environment variable names that npm and pnpm set.
  const envVars: Record<string, string | undefined> = {
    npm_execpath: mod.runtime.env.get("npm_execpath"),
    npm_config_user_agent: mod.runtime.env.get("npm_config_user_agent"),
  };

  // Dev context: the module is a local file and the cwd's package.json has a
  // "cli" script, as in the workspace where `pnpm cli` runs the CLI.
  let isDevContext = false;

  if (effectiveRuntime === "node" && mainModule.startsWith("file://")) {
    isDevContext = await hasCliScript(mod.runtime.process.cwd());
  }

  const { invoker, mode } = detectInvoker(
    execBasename,
    runtimeName,
    argv,
    envVars,
    isDevContext,
  );

  const runtime: CliRuntime = KNOWN_RUNTIMES.has(effectiveRuntime)
    ? (effectiveRuntime as CliRuntime)
    : "compiled";

  const command = buildCommand(invoker, mode, opts);
  const isInPath = await isCommandInPath(opts.command);

  return { runtime, mode, invoker, command, isInPath };
};
