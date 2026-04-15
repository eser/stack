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
 * │    detectInvoker(execBasename, argv,                             │
 * │                  envVars, mainMod?,                              │
 * │                  isDevContext?)          → { invoker, mode }     │
 * │    buildCommand(invoker, mode, opts)     → string                │
 * │                                                                  │
 * │  ASYNC (thin shell over pure functions):                         │
 * │  PURE (argv-based):                                              │
 * │    getCliPrefix(cmd, subs, args, argv) → string | undefined     │
 * │                                                                  │
 * │  ASYNC (thin shell over pure functions):                         │
 * │    isCommandInPath(name)                 → Promise<boolean>      │
 * │    getCliPrefix(opts, subs)             → Promise<string?>     │
 * │    detectExecutionContext(opts)          → Promise<CliContext>   │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 *
 * Circular import note: Async functions import `current` from `./mod.ts`,
 * while `mod.ts` re-exports from this file. This mirrors the existing pattern
 * in `file-search.ts`. It works because ES module namespace objects (MNOs)
 * are live views — `mod.current` is only accessed inside function bodies,
 * never at module evaluation time.
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
export type CliRuntime = "deno" | "node" | "bun" | "compiled";

/** Whether the CLI was installed or invoked on-demand. */
export type CliMode = "installed" | "on-demand" | "dev";

/**
 * The specific mechanism used to invoke the CLI.
 *
 * ```
 * binary  — compiled standalone binary (deno compile output)
 * deno    — deno install -g / deno run
 * npm     — npm install -g eser
 * npx     — npx eser (on-demand, never installed)
 * pnpm    — pnpm install -g eser
 * pnpx    — pnpx eser / pnpm dlx eser (on-demand)
 * bun     — bun install -g eser
 * bunx    — bunx eser (on-demand)
 * dev     — deno task cli (project-local workspace)
 * unknown — could not determine
 * ```
 */
export type CliInvoker =
  | "binary"
  | "deno"
  | "npm"
  | "npx"
  | "pnpm"
  | "pnpx"
  | "bun"
  | "bunx"
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
  /** Command for dev/workspace mode (e.g. "deno task cli") */
  readonly devCommand: string;
  /** npm package name for npx/pnpx/bunx (e.g. "eser") */
  readonly npmPackage: string;
  /** JSR package for deno fallback (e.g. "@eserstack/cli") */
  readonly jsrPackage: string;
};

// =============================================================================
// Pure functions (no I/O — fully testable without mocks)
// =============================================================================

/**
 * Splits a PATH environment variable string into individual directory entries.
 * Filters out empty segments (e.g. from `::` on Unix or `;;` on Windows).
 */
export const resolvePathDirs = (
  pathStr: string,
  os: Platform,
): string[] => {
  const sep = os === "windows" ? ";" : ":";

  return pathStr.split(sep).filter((dir) => dir.length > 0);
};

/**
 * Known runtime executable names.
 */
const KNOWN_RUNTIMES = new Set(["deno", "node", "bun"]);

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
 * runtime not in [deno,node,bun]  → binary/installed
 * runtime="bun":
 *   BUN_INSTALL set               → bun/installed
 *   else                          → bunx/on-demand
 * runtime="node":
 *   argv[1] ~ "_npx" or "npx"    → npx/on-demand
 *   argv[1] ~ "pnpm" or "pnpx"   → pnpx/on-demand
 *   npm_execpath ~ "npx"          → npx/on-demand   (env fallback)
 *   npm_execpath ~ "pnpm"         → pnpx/on-demand  (env fallback)
 *   npm_config_user_agent~"pnpm"  → pnpm/installed
 *   else                          → npm/installed
 * runtime="deno":
 *   mainModule starts "jsr:|https:" → deno/on-demand
 *   isDevContext=true               → dev/dev
 *   else                            → deno/installed
 * ```
 */
export const detectInvoker = (
  execBasename: string,
  runtimeName: string,
  argv: readonly string[],
  envVars: Record<string, string | undefined>,
  mainModule?: string,
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

  if (runtime === "bun") {
    return envVars["BUN_INSTALL"] !== undefined
      ? { invoker: "bun", mode: "installed" }
      : { invoker: "bunx", mode: "on-demand" };
  }

  if (runtime === "node") {
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

  if (runtime === "deno") {
    if (
      mainModule !== undefined &&
      (mainModule.startsWith("jsr:") || mainModule.startsWith("https:"))
    ) {
      return { invoker: "deno", mode: "on-demand" };
    }
    if (isDevContext === true) {
      return { invoker: "dev", mode: "dev" };
    }

    return { invoker: "deno", mode: "installed" };
  }

  return { invoker: "unknown", mode: "installed" };
};

/**
 * Builds the CLI command string from invoker context and options.
 *
 * | Invoker                          | Mode       | Command                             |
 * |----------------------------------|------------|-------------------------------------|
 * | binary/npm/pnpm/bun/deno/unknown | installed  | opts.command                        |
 * | npx                              | on-demand  | npx {opts.npmPackage}               |
 * | pnpx                             | on-demand  | pnpx {opts.npmPackage}              |
 * | bunx                             | on-demand  | bunx {opts.npmPackage}              |
 * | deno                             | on-demand  | deno run --allow-all jsr:{pkg}      |
 * | dev                              | dev        | opts.devCommand                     |
 */
export const buildCommand = (
  invoker: CliInvoker,
  mode: CliMode,
  opts: CliCommandOptions,
): string => {
  if (invoker === "npx") return `npx ${opts.npmPackage}`;
  if (invoker === "pnpx") return `pnpx ${opts.npmPackage}`;
  if (invoker === "bunx") return `bunx ${opts.npmPackage}`;
  if (invoker === "deno" && mode === "on-demand") {
    return `deno run --allow-all jsr:${opts.jsrPackage}`;
  }
  if (invoker === "dev") return opts.devCommand;

  return opts.command;
};

// =============================================================================
// Async functions (thin shells over pure functions — use real environment)
// =============================================================================

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
 * and embedded matches (`["deno", "run", "-A", "npm:noskills", "init"]` → `"deno run -A npm:noskills"`).
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
    const embeddedIdx = argv.findIndex((arg) =>
      arg.endsWith(`/${sub}`) ||
      arg.endsWith(`\\${sub}`) ||
      arg.includes(`:${sub}`)
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
 * await getCliPrefix(ESER_OPTS, ["noskills", "nos"])
 * // → "npx eser noskills"  (when invoked via npx)
 * // → "deno task cli nos"  (when invoked via deno task)
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
    const hasEmbedded = argv.some((arg) =>
      arg.endsWith(`/${sub}`) ||
      arg.endsWith(`\\${sub}`) ||
      arg.includes(`:${sub}`)
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
 * PATH lookup into a single async call.
 */
export const detectExecutionContext = async (
  opts: CliCommandOptions,
): Promise<CliExecutionContext> => {
  const execBasename = mod.runtime.path.basename(
    mod.runtime.process.execPath(),
  );
  const runtimeName = shared.detectRuntime();
  const argv = mod.runtime.process.argv;
  const mainModule = import.meta.url;

  // Resolve the effective runtime: prefer execBasename, fall back to
  // detectRuntime() for custom binary names (nvm, fnm, volta, etc.)
  const effectiveRuntime = KNOWN_RUNTIMES.has(execBasename)
    ? execBasename
    : runtimeName;

  const envVars: Record<string, string | undefined> = {
    BUN_INSTALL: mod.runtime.env.get("BUN_INSTALL"),
    npm_execpath: mod.runtime.env.get("npm_execpath"),
    npm_config_user_agent: mod.runtime.env.get("npm_config_user_agent"),
  };

  // Dev context: file:// URL (local on-disk module) + "cli" task/script in cwd.
  // Deno's `deno task` reads from both deno.json tasks AND package.json scripts,
  // so we check both.
  let isDevContext = false;

  if (effectiveRuntime === "deno" && mainModule.startsWith("file://")) {
    const cwd = mod.runtime.process.cwd();

    // Check deno.json tasks
    try {
      const denoJsonPath = mod.runtime.path.join(cwd, "deno.json");
      const content = await mod.runtime.fs.readTextFile(denoJsonPath);
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const tasks = parsed["tasks"] as Record<string, unknown> | undefined;

      if (tasks !== undefined && "cli" in tasks) {
        isDevContext = true;
      }
    } catch {
      // deno.json not found or unparseable
    }

    // Check package.json scripts (deno task also reads these)
    if (!isDevContext) {
      try {
        const pkgJsonPath = mod.runtime.path.join(cwd, "package.json");
        const content = await mod.runtime.fs.readTextFile(pkgJsonPath);
        const parsed = JSON.parse(content) as Record<string, unknown>;
        const scripts = parsed["scripts"] as
          | Record<string, unknown>
          | undefined;

        if (scripts !== undefined && "cli" in scripts) {
          isDevContext = true;
        }
      } catch {
        // package.json not found or unparseable
      }
    }
  }

  const { invoker, mode } = detectInvoker(
    execBasename,
    runtimeName,
    argv,
    envVars,
    mainModule,
    isDevContext,
  );

  const runtime: CliRuntime = KNOWN_RUNTIMES.has(effectiveRuntime)
    ? effectiveRuntime as CliRuntime
    : "compiled";

  const command = buildCommand(invoker, mode, opts);
  const isInPath = await isCommandInPath(opts.command);

  return { runtime, mode, invoker, command, isInPath };
};
