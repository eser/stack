// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Library path resolution for the eser-ajan C-shared library.
 *
 * Searches multiple well-known locations for the platform-appropriate shared
 * library file and returns the first path that exists.
 *
 * @module
 */

import type * as types from "./types.ts";

/**
 * `node:fs` module resolved once via top-level await.
 * Works identically on Node 25+, Bun 1.3+, and Deno 2.7+.
 */
const nodeFs = await import("node:fs");

/**
 * Returns the shared library file extension for the current OS.
 */
export const getLibraryExtension = (): types.LibraryExtension => {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;

  // Deno
  if (typeof g.Deno !== "undefined") {
    const os = g.Deno.build.os as string;
    if (os === "darwin") return ".dylib";
    if (os === "windows") return ".dll";
    return ".so";
  }

  // Node.js / Bun — use process.platform
  if (
    typeof g.process !== "undefined" && typeof g.process.platform === "string"
  ) {
    const platform = g.process.platform as string;
    if (platform === "darwin") return ".dylib";
    if (platform === "win32") return ".dll";
    return ".so";
  }

  // Fallback
  return ".so";
};

/**
 * Returns the platform-architecture slug used in npm optional dependency
 * package names (e.g. "darwin-arm64", "linux-x64", "win32-x64").
 *
 * Uses npm-canonical values: `darwin`, `linux`, `win32` for OS, and
 * `arm64`, `x64` for CPU — matching the npm `os` and `cpu` fields in the
 * platform-specific packages.
 */
const getPlatformSlug = (): string => {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;

  let os = "linux";
  let arch = "x64";

  if (typeof g.Deno !== "undefined") {
    const denoOs = g.Deno.build.os as string;
    os = denoOs === "windows" ? "win32" : denoOs;
    arch = g.Deno.build.arch === "aarch64" ? "arm64" : "x64";
  } else if (typeof g.process !== "undefined") {
    // Node.js / Bun: process.platform already uses npm-canonical values
    // ("darwin", "linux", "win32")
    os = g.process.platform as string;
    const nodeArch = g.process.arch as string;
    arch = nodeArch === "arm64" ? "arm64" : "x64";
  }

  return `${os}-${arch}`;
};

/**
 * Checks whether a file exists at the given path.
 * Uses `node:fs` resolved via top-level await — works on all runtimes.
 */
const fileExists = (path: string): boolean => {
  try {
    nodeFs.statSync(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Returns the directory containing this module file.
 * Falls back to the current working directory if detection fails.
 *
 * Because `import.meta.dirname` is only accessible at the call-site (not in
 * a helper function), callers should pass a `hint` when they can.
 */
const getModuleDir = (hint?: string): string => {
  if (hint !== undefined) {
    return hint;
  }

  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;

  // Node / Bun: __dirname is available in CommonJS; for ESM, fallback to cwd
  if (typeof g.__dirname === "string") {
    return g.__dirname;
  }

  if (typeof g.process !== "undefined" && typeof g.process.cwd === "function") {
    return g.process.cwd();
  }

  return ".";
};

/**
 * Resolves the path to the eser-ajan shared library.
 *
 * Search order:
 * 1. `ESER_AJAN_LIB_PATH` environment variable (explicit override)
 * 2. Adjacent to this module (`./libeser_ajan.{ext}`)
 * 3. In the dist directory for the current platform (`dist/{target}/libeser_ajan.{ext}`)
 * 4. Platform npm package (`@eser/eser-ajan-{platform}/libeser_ajan.{ext}`)
 * 5. System library paths (`/usr/local/lib/`, `/usr/lib/`)
 *
 * @param moduleDirHint - Optional path to the directory containing this module
 *   (i.e. the `ffi/` directory). When provided, relative paths are resolved
 *   from this location. Callers should pass `import.meta.dirname` when
 *   available.
 * @throws {Error} If no library file is found at any location.
 */
export const resolveLibraryPath = (moduleDirHint?: string): string => {
  const ext = getLibraryExtension();
  const libName = `libeser_ajan${ext}`;
  const checkedPaths: string[] = [];

  // 1. Environment variable override
  const envPath = getEnvVar("ESER_AJAN_LIB_PATH");
  if (envPath !== undefined) {
    if (fileExists(envPath)) {
      return envPath;
    }
    checkedPaths.push(`$ESER_AJAN_LIB_PATH = ${envPath}`);
  }

  const moduleDir = getModuleDir(moduleDirHint);

  // 2. Adjacent to this module (ffi/ directory)
  const adjacentPath = `${moduleDir}/${libName}`;
  checkedPaths.push(adjacentPath);
  if (fileExists(adjacentPath)) {
    return adjacentPath;
  }

  // 3. In the dist directory for the current platform build output
  const platformSlug = getPlatformSlug();

  // Map npm platform slug to build target name format
  // (e.g. "darwin-arm64" → "aarch64-darwin", "win32-x64" → "x86_64-windows")
  const archMap: Record<string, string> = {
    "x64": "x86_64",
    "arm64": "aarch64",
  };
  const osMap: Record<string, string> = {
    "win32": "windows",
  };
  const parts = platformSlug.split("-");
  const slugOs = parts[0] ?? "linux";
  const archKey = parts[1] ?? "x64";
  const targetArch = archMap[archKey] ?? archKey;
  const targetOs = osMap[slugOs] ?? slugOs;
  const targetName = `${targetArch}-${targetOs}`;

  // ffi/ is one level below the package root, so go up one level to reach dist/
  const pkgRoot = `${moduleDir}/..`;
  const distPath = `${pkgRoot}/dist/${targetName}/${libName}`;
  checkedPaths.push(distPath);
  if (fileExists(distPath)) {
    return distPath;
  }

  // Also try dist/ when moduleDir IS the package root (e.g. cwd fallback)
  const cwdDistPath = `${moduleDir}/dist/${targetName}/${libName}`;
  checkedPaths.push(cwdDistPath);
  if (fileExists(cwdDistPath)) {
    return cwdDistPath;
  }

  // Try pkg/@eser/ajan/dist/ from the monorepo root (cwd)
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  const cwd =
    typeof g.process !== "undefined" && typeof g.process.cwd === "function"
      ? g.process.cwd()
      : ".";
  if (cwd !== moduleDir) {
    const monoDistPath = `${cwd}/pkg/@eser/ajan/dist/${targetName}/${libName}`;
    checkedPaths.push(monoDistPath);
    if (fileExists(monoDistPath)) {
      return monoDistPath;
    }
  }

  // 4. Platform npm package (e.g. node_modules/@eserstack/ajan-darwin-arm64/)
  const searchRoots = [moduleDir, pkgRoot, cwd];
  for (const root of searchRoots) {
    const npmPath =
      `${root}/node_modules/@eserstack/ajan-${platformSlug}/${libName}`;
    checkedPaths.push(npmPath);
    if (fileExists(npmPath)) {
      return npmPath;
    }
  }

  // 5. System library paths (Linux / macOS)
  const systemPaths = [
    `/usr/local/lib/${libName}`,
    `/usr/lib/${libName}`,
  ];
  for (const sysPath of systemPaths) {
    checkedPaths.push(sysPath);
    if (fileExists(sysPath)) {
      return sysPath;
    }
  }

  throw new Error(
    `Could not find eser-ajan shared library (${libName}).\n` +
      `Checked the following locations:\n` +
      checkedPaths.map((p) => `  - ${p}`).join("\n") +
      `\n\nTo fix this:\n` +
      `  1. Install: npm install @eser/ajan\n` +
      `  2. Or set ESER_AJAN_LIB_PATH to the full path of ${libName}`,
  );
};

/**
 * Reads an environment variable across runtimes.
 *
 * Uses `process.env` which works on Deno 2.7+, Node.js, and Bun.
 */
const getEnvVar = (name: string): string | undefined => {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;

  // process.env works on Node, Bun, and Deno 2.7+
  if (typeof g.process !== "undefined" && typeof g.process.env === "object") {
    return g.process.env[name] ?? undefined;
  }

  return undefined;
};
