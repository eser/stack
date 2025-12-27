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
import {
  getFirstEnvVar,
  getNavigator,
  getProcess,
  type NodeOsModule,
  tryRequire,
} from "./helpers.ts";

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
const PLATFORM_MAP: Record<string, Platform> = {
  darwin: "darwin",
  linux: "linux",
  windows: "windows",
  win32: "windows",
};

export const getPlatform = (): Platform => {
  // Deno
  if (typeof Deno !== "undefined" && Deno.build?.os) {
    return PLATFORM_MAP[Deno.build.os] ?? "linux";
  }

  // Node.js / Bun
  const proc = getProcess();
  if (proc?.platform) {
    return PLATFORM_MAP[proc.platform] ?? "linux";
  }

  // Browser detection via userAgent
  const nav = getNavigator();
  if (nav?.userAgent) {
    const ua = nav.userAgent.toLowerCase();
    if (ua.includes("mac")) return "darwin";
    if (ua.includes("win")) return "windows";
    if (ua.includes("linux")) return "linux";
  }

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
const ARCH_MAP: Record<string, Arch> = {
  x86_64: "amd64",
  x64: "amd64",
  aarch64: "arm64",
  arm64: "arm64",
};

export const getArch = (): Arch => {
  // Deno
  if (typeof Deno !== "undefined" && Deno.build?.arch) {
    return ARCH_MAP[Deno.build.arch] ?? "amd64";
  }

  // Node.js / Bun
  const proc = getProcess();
  if (proc?.arch) {
    return ARCH_MAP[proc.arch] ?? "amd64";
  }

  // Browser detection via userAgent
  const nav = getNavigator();
  if (nav?.userAgent) {
    const ua = nav.userAgent.toLowerCase();
    if (ua.includes("arm64") || ua.includes("aarch64")) return "arm64";
  }

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
  // Try env vars first (works in Deno, Node, Bun)
  const home = getFirstEnvVar("HOME", "USERPROFILE");
  if (home) return home;

  // Try os.homedir() for Node.js
  const os = tryRequire<NodeOsModule>("os");
  if (os?.homedir) {
    return os.homedir();
  }

  // Default fallback
  return getPlatform() === "windows" ? "C:\\Users\\Default" : "/home";
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
  // Try env vars first (works in Deno, Node, Bun)
  const tmp = getFirstEnvVar("TMPDIR", "TMP", "TEMP");
  if (tmp) return tmp;

  // Try os.tmpdir() for Node.js
  const os = tryRequire<NodeOsModule>("os");
  if (os?.tmpdir) {
    return os.tmpdir();
  }

  // Default fallback
  return getPlatform() === "windows" ? "C:\\Windows\\Temp" : "/tmp";
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
