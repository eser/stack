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
  const platform = globalThis.process?.platform;

  if (platform === "darwin") return ".dylib";
  if (platform === "win32") return ".dll";

  return ".so";
};

/**
 * Returns the platform-architecture slug used in npm optional dependency
 * package names (e.g. "darwin-arm64", "linux-x64", "win32-x64").
 *
 * `process.platform` already uses the npm-canonical OS values (`darwin`,
 * `linux`, `win32`) that the `os` fields of the platform packages name.
 *
 * Only five targets are published (darwin-arm64, darwin-x64, linux-arm64,
 * linux-x64, win32-x64), so this assumes any non-arm64 CPU is x64 rather than
 * detecting the full set. On a CPU that is neither, the slug names a package
 * that does not exist — resolution then falls through to the system paths and
 * ultimately to the WASM fallback, which is the correct outcome anyway.
 */
const getPlatformSlug = (): string => {
  const os = globalThis.process?.platform ?? "linux";
  const arch = globalThis.process?.arch === "arm64" ? "arm64" : "x64";

  return `${os}-${arch}`;
};

/** Memoized `fs.statSync`; `null` once the host is known to have none. */
let statSyncImpl: ((path: string) => unknown) | null | undefined;

/**
 * Resolves `fs.statSync` lazily, treating its absence as a soft failure.
 *
 * `mod.ts` imports this module statically, so acquiring `node:fs` at module
 * scope would take down the whole entry module on a host lacking it (the
 * WASM fallback also runs on Cloudflare Workers) before the WASM fallback
 * could run. `process.getBuiltinModule` is the synchronous route to `node:fs`
 * from an ES module.
 */
const getStatSync = (): ((path: string) => unknown) | null => {
  if (statSyncImpl !== undefined) {
    return statSyncImpl;
  }

  statSyncImpl = null;

  try {
    const fs = globalThis.process?.getBuiltinModule?.("node:fs");

    if (fs !== undefined) {
      statSyncImpl = (path: string) => fs.statSync(path);
    }
  } catch {
    // No synchronous `node:fs` here — every probe reports "not found".
  }

  return statSyncImpl;
};

/**
 * Checks whether a file exists at the given path.
 * Returns `false` when the host offers no synchronous filesystem access.
 * `wasm/resolve.ts` probes its candidates through this as well.
 */
export const fileExists = (path: string): boolean => {
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
 * Separators are normalized to `/`, which Windows accepts. The walk is textual, so it does not follow symlinks — that is the
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
export const getModuleDir = (hint?: string): string => {
  if (hint !== undefined) {
    return hint;
  }

  return globalThis.process?.cwd() ?? ".";
};

/**
 * Resolves the path to the eser-ajan shared library.
 *
 * Search order:
 * 1. `ESER_AJAN_LIB_PATH` environment variable (explicit override)
 * 2. Adjacent to this module (`{moduleDir}/libeser_ajan.{ext}`)
 * 3. Build output next to this module: `{moduleDir}/../dist/{target}/`,
 *    `{moduleDir}/dist/{target}/`
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
    x64: "x86_64",
    arm64: "aarch64",
  };
  const osMap: Record<string, string> = {
    win32: "windows",
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

  const cwd = globalThis.process?.cwd() ?? ".";

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

    const npmPath = `${root}/node_modules/@eserstack/ajan-${platformSlug}/${libName}`;
    if (probe(npmPath)) {
      return npmPath;
    }
  }

  // No cwd-relative probe of pkg/@eserstack/ajan/dist: the platform packages
  // are workspace members, so inside the repository the freshly built library
  // is reachable through node_modules like everywhere else, and a published
  // CLI run from the checkout can no longer pick up a stale dev build.

  // 5. System library paths (Linux / macOS)
  const systemPaths = [`/usr/local/lib/${libName}`, `/usr/lib/${libName}`];
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

/** Reads an environment variable; `undefined` where there is no `process`. */
const getEnvVar = (name: string): string | undefined =>
  globalThis.process?.env[name];
