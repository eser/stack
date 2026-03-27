// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Cross-runtime helper utilities for environment detection.
 * Reduces code duplication across platform detection functions.
 *
 * @module
 */

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
