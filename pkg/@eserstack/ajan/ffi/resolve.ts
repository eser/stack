// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Library path resolution for the eser-ajan C-shared library.
 *
 * Searches multiple well-known locations for the platform-appropriate shared
 * library file and returns the first path that exists.
 *
 * ## JSR installs
 *
 * JSR has no `optionalDependencies`, so a JSR-resolved import never brings an
 * `@eserstack/ajan-{slug}` package with it. Worse, for remote or cached modules
 * `import.meta.dirname` is `undefined`, so `getModuleDir()` falls back to the
 * current working directory and every "module-relative" candidate below is
 * really a cwd-relative one. Under JSR, resolution therefore succeeds only via
 * `ESER_AJAN_LIB_PATH`, a `node_modules` tree reachable from the cwd, or a
 * system library path; otherwise the caller lands on the WASM fallback in
 * `mod.ts`.
 *
 * @module
 */

import type * as types from "./types.ts";

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
 *
 * Only five targets are published (darwin-arm64, darwin-x64, linux-arm64,
 * linux-x64, win32-x64), so this assumes any non-arm64 CPU is x64 rather than
 * detecting the full set. On a CPU that is neither, the slug names a package
 * that does not exist — resolution then falls through to the system paths and
 * ultimately to the WASM fallback, which is the correct outcome anyway.
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

/** Memoized `statSync`; `null` once the runtime is known to have none. */
let statSyncImpl: ((path: string) => unknown) | null | undefined;

/**
 * Resolves a synchronous `stat` lazily, treating its absence as a soft failure.
 *
 * `mod.ts` imports this module statically, so acquiring `node:fs` at module
 * scope took down the whole entry module on any runtime lacking it — before the
 * WASM fallback, the branch that exists for exactly those runtimes, could run.
 *
 * `process.getBuiltinModule` is the only synchronous route to `node:fs` from an
 * ES module; it exists on every runtime this package supports (Node 22.3+,
 * Bun 1.1+, Deno 2.x). Deno's own `statSync` is preferred where present so the
 * node compatibility layer is not involved at all.
 */
const getStatSync = (): ((path: string) => unknown) | null => {
  if (statSyncImpl !== undefined) {
    return statSyncImpl;
  }

  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;

  statSyncImpl = null;

  if (typeof g.Deno?.statSync === "function") {
    statSyncImpl = (path: string) => g.Deno.statSync(path);

    return statSyncImpl;
  }

  try {
    const fs = typeof g.process?.getBuiltinModule === "function"
      ? g.process.getBuiltinModule("node:fs")
      : undefined;

    if (typeof fs?.statSync === "function") {
      statSyncImpl = (path: string) => fs.statSync(path);
    }
  } catch {
    // No synchronous `node:fs` here — every probe reports "not found".
  }

  return statSyncImpl;
};

/**
 * Checks whether a file exists at the given path.
 * Returns `false` when the runtime offers no synchronous filesystem access.
 */
const fileExists = (path: string): boolean => {
  const statSync = getStatSync();

  if (statSync === null) {
    return false;
  }

  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Returns `dir` and every ancestor directory above it, nearest first, stopping
 * before the filesystem root.
 *
 * Separators are normalized to `/`, which Windows accepts on every supported
 * runtime. The walk is textual, so it does not follow symlinks — that is the
 * point: under pnpm it names the public `node_modules` tree the package is
 * linked into, not the store directory the link points at.
 */
const getAncestorDirs = (dir: string): string[] => {
  const dirs: string[] = [];
  let current = dir.replaceAll("\\", "/");

  while (current.length > 0) {
    if (!current.endsWith("/")) {
      dirs.push(current);
    }

    const separator = current.lastIndexOf("/");
    if (separator < 0) {
      break;
    }

    current = current.slice(0, separator);
  }

  return dirs;
};

/** Last path segment of an already normalized directory path. */
const getBaseName = (dir: string): string =>
  dir.slice(dir.lastIndexOf("/") + 1);

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
 * 2. Adjacent to this module (`{moduleDir}/libeser_ajan.{ext}`)
 * 3. Build output for the current target: `{moduleDir}/../dist/{target}/`,
 *    `{moduleDir}/dist/{target}/`, then `{cwd}/pkg/@eserstack/ajan/dist/{target}/`
 * 4. Platform npm package `@eserstack/ajan-{slug}`, probed first as the scope
 *    sibling of this package (`{moduleDir}/../../ajan-{slug}/`) and then under
 *    `node_modules/@eserstack/` of every ancestor directory of this module and
 *    of the current working directory
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
  const probed = new Set<string>();

  /** Records a candidate in the diagnostic list and reports whether it exists. */
  const probe = (candidate: string): boolean => {
    if (probed.has(candidate)) {
      return false;
    }

    probed.add(candidate);
    checkedPaths.push(candidate);

    return fileExists(candidate);
  };

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
  if (probe(adjacentPath)) {
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
  if (probe(distPath)) {
    return distPath;
  }

  // Also try dist/ when moduleDir IS the package root (e.g. cwd fallback)
  const cwdDistPath = `${moduleDir}/dist/${targetName}/${libName}`;
  if (probe(cwdDistPath)) {
    return cwdDistPath;
  }

  // Try pkg/@eserstack/ajan/dist/ from the monorepo root (cwd)
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  const cwd =
    typeof g.process !== "undefined" && typeof g.process.cwd === "function"
      ? g.process.cwd()
      : ".";
  if (cwd !== moduleDir) {
    const monoDistPath =
      `${cwd}/pkg/@eserstack/ajan/dist/${targetName}/${libName}`;
    if (probe(monoDistPath)) {
      return monoDistPath;
    }
  }

  // 4. Platform npm package (e.g. node_modules/@eserstack/ajan-darwin-arm64/)
  //
  // npm hoists the optional dependency next to this package rather than inside
  // it, so the sibling below is the ordinary install layout and must be probed
  // directly. It is kept unresolved on purpose: the OS walks `..` through the
  // symlink pnpm installs at the package directory, which lands in the store
  // copy that the textual ancestor walk cannot name.
  const siblingPath = `${moduleDir}/../../ajan-${platformSlug}/${libName}`;
  if (probe(siblingPath)) {
    return siblingPath;
  }

  // Anything else (nested installs, pnpm's isolated store, a cwd elsewhere in
  // the project) sits in some ancestor's node_modules, so walk upward instead
  // of guessing a single root — resolution must not depend on where the process
  // was started.
  const npmRoots = [...getAncestorDirs(moduleDir), ...getAncestorDirs(cwd)];
  for (const root of npmRoots) {
    if (getBaseName(root) === "node_modules") {
      continue;
    }

    const npmPath =
      `${root}/node_modules/@eserstack/ajan-${platformSlug}/${libName}`;
    if (probe(npmPath)) {
      return npmPath;
    }
  }

  // 5. System library paths (Linux / macOS)
  const systemPaths = [
    `/usr/local/lib/${libName}`,
    `/usr/lib/${libName}`,
  ];
  for (const sysPath of systemPaths) {
    if (probe(sysPath)) {
      return sysPath;
    }
  }

  throw new Error(
    `Could not find eser-ajan shared library (${libName}).\n` +
      `Checked the following locations:\n` +
      checkedPaths.map((p) => `  - ${p}`).join("\n") +
      `\n\nTo fix this:\n` +
      `  1. Install: npm install @eserstack/ajan\n` +
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
