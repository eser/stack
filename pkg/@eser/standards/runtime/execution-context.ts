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
 * │    detectInvoker(envVars, runtime,                               │
 * │                  isCompiled, mainMod?,                           │
 * │                  isDevContext?)          → { invoker, mode }     │
 * │    buildCommand(invoker, mode, opts)     → string                │
 * │                                                                  │
 * │  ASYNC (thin shell over pure functions):                         │
 * │    isCommandInPath(name)                 → Promise<boolean>      │
 * │    getCliCommand(opts)                   → Promise<string>       │
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

import * as detect from "./detect.ts";
import * as platform from "./platform.ts";
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
 * All fields are eser-specific — keeping them here lets @eser/standards
 * stay free of hardcoded package names.
 */
export type CliCommandOptions = {
  /** Binary name to look for in PATH (e.g. "eser") */
  readonly command: string;
  /** Command for dev/workspace mode (e.g. "deno task cli") */
  readonly devCommand: string;
  /** npm package name for npx/pnpx/bunx (e.g. "eser") */
  readonly npmPackage: string;
  /** JSR package for deno fallback (e.g. "@eser/cli") */
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
 * Determines the CLI invoker and mode from plain environment data.
 *
 * All parameters are plain data values — no I/O. The async entry point
 * (`detectExecutionContext`) reads the real environment and passes results here.
 *
 * Decision tree:
 * ```
 * isCompiled=true → binary/installed
 * runtime="bun":
 *   BUN_INSTALL set → bun/installed
 *   else           → bunx/on-demand
 * runtime="node":
 *   npm_execpath ~ "npx"  → npx/on-demand
 *   npm_execpath ~ "pnpm" → pnpx/on-demand
 *   npm_config_user_agent ~ "pnpm" → pnpm/installed
 *   else                  → npm/installed
 * runtime="deno":
 *   mainModule starts "jsr:" | "https:" → deno/on-demand
 *   isDevContext=true                   → dev/dev
 *   else                                → deno/installed
 * else → unknown/installed
 * ```
 */
export const detectInvoker = (
  envVars: Record<string, string | undefined>,
  runtime: string,
  isCompiled: boolean,
  mainModule?: string,
  isDevContext?: boolean,
): { invoker: CliInvoker; mode: CliMode } => {
  if (isCompiled) {
    return { invoker: "binary", mode: "installed" };
  }

  if (runtime === "bun") {
    return envVars["BUN_INSTALL"] !== undefined
      ? { invoker: "bun", mode: "installed" }
      : { invoker: "bunx", mode: "on-demand" };
  }

  if (runtime === "node") {
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
  const os = platform.getPlatform();
  const exeName = os === "windows" ? `${name}.exe` : name;
  const pathStr = mod.current.env.get("PATH") ?? "";
  const dirs = resolvePathDirs(pathStr, os);

  for (const dir of dirs) {
    try {
      await mod.current.fs.stat(mod.current.path.join(dir, exeName));
      return true;
    } catch {
      continue;
    }
  }

  return false;
};

/**
 * Determines the best CLI command for git hook generation.
 *
 * Independent of how the CLI was invoked — checks what is actually available
 * on the system:
 *
 * ```
 * 1. opts.command in PATH → "{opts.command}"
 * 2. npx in PATH          → "npx {opts.npmPackage}"
 * 3. pnpx in PATH         → "pnpx {opts.npmPackage}"
 * 4. bunx in PATH         → "bunx {opts.npmPackage}"
 * 5. deno in PATH         → "deno run --allow-all jsr:{opts.jsrPackage}"
 * 6. FALLBACK             → "{opts.command}"
 * ```
 *
 * The fallback produces a clear "command not found" error at hook execution
 * time rather than a confusing "deno.json not found" from `deno task cli`.
 */
export const getCliCommand = async (
  opts: CliCommandOptions,
): Promise<string> => {
  if (await isCommandInPath(opts.command)) return opts.command;
  if (await isCommandInPath("npx")) return `npx ${opts.npmPackage}`;
  if (await isCommandInPath("pnpx")) return `pnpx ${opts.npmPackage}`;
  if (await isCommandInPath("bunx")) return `bunx ${opts.npmPackage}`;
  if (await isCommandInPath("deno")) {
    return `deno run --allow-all jsr:${opts.jsrPackage}`;
  }

  return opts.command;
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
  const isCompiled = import.meta.filename === undefined;
  const runtimeName = detect.detectRuntime();
  const mainModule = import.meta.url;

  const envVars: Record<string, string | undefined> = {
    BUN_INSTALL: mod.current.env.get("BUN_INSTALL"),
    npm_execpath: mod.current.env.get("npm_execpath"),
    npm_config_user_agent: mod.current.env.get("npm_config_user_agent"),
  };

  // Dev context: file:// URL (local on-disk module) + deno.json with "cli" task in cwd
  let isDevContext = false;

  if (runtimeName === "deno" && mainModule.startsWith("file://")) {
    try {
      const cwd = mod.current.process.cwd();
      const denoJsonPath = mod.current.path.join(cwd, "deno.json");
      const content = await mod.current.fs.readTextFile(denoJsonPath);
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const tasks = parsed["tasks"] as Record<string, unknown> | undefined;

      if (tasks !== undefined && "cli" in tasks) {
        isDevContext = true;
      }
    } catch {
      // deno.json not found or unparseable — not a dev context
    }
  }

  const { invoker, mode } = detectInvoker(
    envVars,
    runtimeName,
    isCompiled,
    mainModule,
    isDevContext,
  );

  const runtime: CliRuntime = isCompiled
    ? "compiled"
    : (["deno", "node", "bun"].includes(runtimeName)
      ? runtimeName as CliRuntime
      : "deno");

  const command = buildCommand(invoker, mode, opts);
  const isInPath = await isCommandInPath(opts.command);

  return { runtime, mode, invoker, command, isInPath };
};
