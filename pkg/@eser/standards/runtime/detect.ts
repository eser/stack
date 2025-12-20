// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Runtime detection utilities.
 *
 * @module
 */

import type { RuntimeName } from "./types.ts";

// Type declarations for runtime globals
declare const Deno: { version: { deno: string } } | undefined;
declare const Bun: { version: string } | undefined;
declare const process:
  | { versions?: { node?: string; bun?: string }; version?: string }
  | undefined;

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
 *
 * @returns The detected runtime name
 */
export const detectRuntime = (): RuntimeName => {
  // Bun check must come first - Bun sets process.versions.node for compatibility
  if (typeof globalThis !== "undefined") {
    // deno-lint-ignore no-explicit-any
    if (typeof (globalThis as any).Bun !== "undefined") {
      return "bun";
    }

    // deno-lint-ignore no-explicit-any
    if (typeof (globalThis as any).Deno !== "undefined") {
      return "deno";
    }

    // Node.js - has process.versions.node but we already excluded Bun
    // deno-lint-ignore no-explicit-any
    const proc = (globalThis as any).process;
    if (proc?.versions?.node && !proc?.versions?.bun) {
      return "node";
    }

    // Cloudflare Workers - has caches API and Request/Response but no window
    // deno-lint-ignore no-explicit-any
    const g = globalThis as any;
    if (
      typeof g.caches !== "undefined" &&
      typeof g.Request !== "undefined" &&
      typeof g.Response !== "undefined" &&
      typeof g.window === "undefined" &&
      typeof g.document === "undefined"
    ) {
      return "workerd";
    }

    // Browser - has window or document
    if (typeof g.window !== "undefined" || typeof g.document !== "undefined") {
      return "browser";
    }
  }

  return "unknown";
};

/**
 * Gets the version string for the current runtime.
 *
 * @returns Version string or "unknown"
 */
export const getRuntimeVersion = (): string => {
  const runtime = detectRuntime();

  switch (runtime) {
    case "deno": {
      // deno-lint-ignore no-explicit-any
      return (globalThis as any).Deno?.version?.deno ?? "unknown";
    }
    case "bun": {
      // deno-lint-ignore no-explicit-any
      return (globalThis as any).Bun?.version ?? "unknown";
    }
    case "node": {
      // deno-lint-ignore no-explicit-any
      return (globalThis as any).process?.versions?.node ?? "unknown";
    }
    case "workerd": {
      // Cloudflare Workers doesn't expose version
      return "unknown";
    }
    case "browser": {
      // deno-lint-ignore no-explicit-any
      return (globalThis as any).navigator?.userAgent ?? "unknown";
    }
    default: {
      return "unknown";
    }
  }
};

/**
 * Check if running in Deno.
 */
export const isDeno = (): boolean => detectRuntime() === "deno";

/**
 * Check if running in Node.js.
 */
export const isNode = (): boolean => detectRuntime() === "node";

/**
 * Check if running in Bun.
 */
export const isBun = (): boolean => detectRuntime() === "bun";

/**
 * Check if running in Cloudflare Workers.
 */
export const isWorkerd = (): boolean => detectRuntime() === "workerd";

/**
 * Check if running in a browser.
 */
export const isBrowser = (): boolean => detectRuntime() === "browser";

/**
 * Check if running in a server-side runtime (Deno, Node, Bun).
 */
export const isServer = (): boolean => {
  const rt = detectRuntime();
  return rt === "deno" || rt === "node" || rt === "bun";
};

/**
 * Check if running in an edge runtime (Workers, Deno Deploy).
 */
export const isEdge = (): boolean => {
  const rt = detectRuntime();
  return rt === "workerd";
};
