// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Platform detection utilities for cross-runtime environments.
 * Provides OS, architecture, and directory information.
 *
 * @example
 * ```typescript
 * import * as platform from "@eser/standards/runtime/platform";
 *
 * const os = platform.getPlatform(); // "darwin" | "linux" | "windows"
 * const arch = platform.getArch();   // "amd64" | "arm64"
 * const home = platform.getHomedir();
 * const info = platform.getPlatformInfo();
 * ```
 *
 * @module
 */

import type { Arch, Platform, PlatformInfo } from "./types.ts";

/**
 * Detects the current operating system platform.
 * Returns Go-style platform names for consistency.
 *
 * @returns The detected platform
 *
 * @example
 * ```typescript
 * const os = getPlatform();
 * if (os === "darwin") {
 *   console.log("Running on macOS");
 * }
 * ```
 */
export const getPlatform = (): Platform => {
  // Deno
  if (typeof Deno !== "undefined" && Deno.build?.os) {
    const os = Deno.build.os;
    if (os === "darwin") return "darwin";
    if (os === "linux") return "linux";
    if (os === "windows") return "windows";
  }

  // Node.js / Bun (check for process.platform)
  // deno-lint-ignore no-explicit-any
  const proc = (globalThis as any).process;
  if (proc?.platform) {
    const platform = proc.platform;
    if (platform === "darwin") return "darwin";
    if (platform === "linux") return "linux";
    if (platform === "win32") return "windows";
  }

  // Browser detection via userAgent (best effort)
  // deno-lint-ignore no-explicit-any
  const nav = (globalThis as any).navigator;
  if (nav?.userAgent) {
    const ua = nav.userAgent.toLowerCase();
    if (ua.includes("mac")) return "darwin";
    if (ua.includes("win")) return "windows";
    if (ua.includes("linux")) return "linux";
  }

  // Default to linux as most common server OS
  return "linux";
};

/**
 * Detects the current CPU architecture.
 * Returns Go-style architecture names (amd64 instead of x86_64).
 *
 * @returns The detected architecture
 *
 * @example
 * ```typescript
 * const arch = getArch();
 * if (arch === "arm64") {
 *   console.log("Running on ARM64");
 * }
 * ```
 */
export const getArch = (): Arch => {
  // Deno
  if (typeof Deno !== "undefined" && Deno.build?.arch) {
    const arch = Deno.build.arch;
    if (arch === "x86_64") return "amd64";
    if (arch === "aarch64") return "arm64";
  }

  // Node.js / Bun (check for process.arch)
  // deno-lint-ignore no-explicit-any
  const proc = (globalThis as any).process;
  if (proc?.arch) {
    const arch = proc.arch;
    if (arch === "x64") return "amd64";
    if (arch === "arm64") return "arm64";
  }

  // Browser detection via userAgent (best effort)
  // deno-lint-ignore no-explicit-any
  const nav = (globalThis as any).navigator;
  if (nav?.userAgent) {
    const ua = nav.userAgent.toLowerCase();
    if (ua.includes("arm64") || ua.includes("aarch64")) return "arm64";
  }

  // Default to amd64 as most common
  return "amd64";
};

/**
 * Gets the user's home directory.
 *
 * @returns The home directory path
 *
 * @example
 * ```typescript
 * const home = getHomedir();
 * const configPath = `${home}/.config/myapp`;
 * ```
 */
export const getHomedir = (): string => {
  // Deno
  if (typeof Deno !== "undefined" && Deno.env?.get) {
    const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
    if (home) return home;
  }

  // Node.js / Bun
  // deno-lint-ignore no-explicit-any
  const proc = (globalThis as any).process;
  if (proc?.env) {
    const home = proc.env.HOME ?? proc.env.USERPROFILE;
    if (home) return home;
  }

  // Try os.homedir() for Node.js
  try {
    // deno-lint-ignore no-explicit-any
    const os = (globalThis as any).require?.("os");
    if (os?.homedir) {
      return os.homedir();
    }
  } catch {
    // Ignore
  }

  // Default fallback
  const platform = getPlatform();
  if (platform === "windows") {
    return "C:\\Users\\Default";
  }
  return "/home";
};

/**
 * Gets the system temporary directory.
 *
 * @returns The temporary directory path
 *
 * @example
 * ```typescript
 * const tmp = getTmpdir();
 * const tempFile = `${tmp}/myapp-temp.txt`;
 * ```
 */
export const getTmpdir = (): string => {
  // Deno
  if (typeof Deno !== "undefined" && Deno.env?.get) {
    const tmp = Deno.env.get("TMPDIR") ?? Deno.env.get("TMP") ??
      Deno.env.get("TEMP");
    if (tmp) return tmp;
  }

  // Node.js / Bun
  // deno-lint-ignore no-explicit-any
  const proc = (globalThis as any).process;
  if (proc?.env) {
    const tmp = proc.env.TMPDIR ?? proc.env.TMP ?? proc.env.TEMP;
    if (tmp) return tmp;
  }

  // Try os.tmpdir() for Node.js
  try {
    // deno-lint-ignore no-explicit-any
    const os = (globalThis as any).require?.("os");
    if (os?.tmpdir) {
      return os.tmpdir();
    }
  } catch {
    // Ignore
  }

  // Default fallback
  const platform = getPlatform();
  if (platform === "windows") {
    return "C:\\Windows\\Temp";
  }
  return "/tmp";
};

/**
 * Gets complete platform information.
 * Combines OS, architecture, and directory information.
 *
 * @returns Complete platform information
 *
 * @example
 * ```typescript
 * const info = getPlatformInfo();
 * console.log(`Running on ${info.platform}/${info.arch}`);
 * console.log(`Home: ${info.homedir}`);
 * ```
 */
export const getPlatformInfo = (): PlatformInfo => {
  return {
    platform: getPlatform(),
    arch: getArch(),
    homedir: getHomedir(),
    tmpdir: getTmpdir(),
  };
};
