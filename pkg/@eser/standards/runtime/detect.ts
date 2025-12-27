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
 *
 * @returns The detected runtime name
 */
export const detectRuntime = (): RuntimeName => {
  if (typeof globalThis === "undefined") return "unknown";

  // Bun check must come first - Bun sets process.versions.node for compatibility
  if (typeof globalRef.Bun !== "undefined") return "bun";
  if (typeof globalRef.Deno !== "undefined") return "deno";

  // Node.js - has process.versions.node but we already excluded Bun
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
 *
 * @returns Version string or "unknown"
 */
export const getRuntimeVersion = (): string =>
  versionGetters[detectRuntime()]();

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
