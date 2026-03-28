// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dynamic command prefix resolver.
 *
 * Detects the noskills command prefix from process.args at runtime.
 * Never stored in manifest — always derived from how the user invoked the CLI.
 *
 * @module
 */

import { detectExecutionContext, runtime } from "@eser/standards/cross-runtime";

const DEFAULT_CMD = "npx eser@latest noskills";

const CLI_OPTS = {
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser@latest",
  jsrPackage: "@eser/cli",
} as const;

// Cache: resolved once per process via detectCommandPrefix(), then reused by sync cmd/cmdPrefix.
let _cachedPrefix: string | null = null;

/**
 * Detect the full noskills command prefix using cross-runtime execution context.
 * Resolves HOW the CLI was invoked (npx, deno task, binary, etc.) and builds
 * the correct command string. Result is cached for the process lifetime.
 *
 * Must be called (and awaited) early — init and sync do this.
 */
export const detectCommandPrefix = async (): Promise<string> => {
  if (_cachedPrefix !== null) return _cachedPrefix;

  try {
    const ctx = await detectExecutionContext(CLI_OPTS);
    _cachedPrefix = `${ctx.command} noskills`;
  } catch {
    // Check process.args as fallback
    try {
      const args = runtime.process.args;

      for (let i = 0; i < args.length; i++) {
        if (args[i] === "noskills" || args[i] === "nos") {
          _cachedPrefix = args.slice(0, i + 1).join(" ");
          break;
        }
      }
    } catch {
      // args not available
    }
  }

  _cachedPrefix ??= DEFAULT_CMD;

  return _cachedPrefix;
};

/**
 * Get the command prefix synchronously. Returns cached value from
 * detectCommandPrefix(), or DEFAULT_CMD if not yet resolved.
 */
export const cmdPrefix = (): string => {
  return _cachedPrefix ?? DEFAULT_CMD;
};

/**
 * Build a full command string: prefix + subcommand.
 * Example: cmd("next") → "deno task cli noskills next"
 */
export const cmd = (subcommand: string): string => {
  return `${cmdPrefix()} ${subcommand}`;
};
