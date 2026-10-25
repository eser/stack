// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * WASM file resolution for the eser-ajan WASM modules.
 *
 * Searches multiple well-known locations for the WASM file and returns the
 * first path that exists. Mirrors the resolution strategy in `ffi/resolve.ts`
 * and probes files through its `fileExists`, which acquires a synchronous
 * `stat` on first use. Importing this module performs no I/O.
 *
 * @module
 */

import * as ffiResolve from "../ffi/resolve.ts";

/** Reads an environment variable; `undefined` where there is no `process`. */
const getEnvVar = (name: string): string | undefined =>
  globalThis.process?.env[name];

/** The WASM module's file name. */
const WASM_FILENAME = "eser-ajan.wasm";

/**
 * Resolves the path to a WASM file.
 *
 * Search order:
 * 1. `ESER_AJAN_WASM_PATH` environment variable (explicit override)
 * 2. Adjacent to this module (`./eser-ajan.wasm`)
 * 3. In the dist directory (`dist/wasi/`)
 * 4. npm package (`node_modules/@eserstack/ajan-wasm/`)
 * 5. System paths (`/usr/local/lib/`)
 *
 * @param moduleDirHint - Optional path to the directory containing this module.
 *   Callers should pass `import.meta.dirname` when available.
 * @throws {Error} If no WASM file is found at any location.
 */
export const resolveWasmPath = (moduleDirHint?: string): string => {
  const wasmFile = WASM_FILENAME;
  const distSubdir = "wasi";
  const checkedPaths: string[] = [];

  /** Records a candidate in the diagnostic list and reports whether it exists. */
  const probe = (candidate: string): boolean => {
    checkedPaths.push(candidate);

    return ffiResolve.fileExists(candidate);
  };

  // 1. Environment variable override
  const envPath = getEnvVar("ESER_AJAN_WASM_PATH");
  if (envPath !== undefined) {
    if (ffiResolve.fileExists(envPath)) {
      return envPath;
    }
    checkedPaths.push(`$ESER_AJAN_WASM_PATH = ${envPath}`);
  }

  const moduleDir = ffiResolve.getModuleDir(moduleDirHint);

  // 2. Adjacent to this module (wasm/ directory)
  const adjacentPath = `${moduleDir}/${wasmFile}`;
  if (probe(adjacentPath)) {
    return adjacentPath;
  }

  // 3. In the dist directory for the WASM build output
  // wasm/ is one level below the package root, so go up one level to reach dist/
  const pkgRoot = `${moduleDir}/..`;
  const distPath = `${pkgRoot}/dist/${distSubdir}/${wasmFile}`;
  if (probe(distPath)) {
    return distPath;
  }

  // Also try dist/ when moduleDir IS the package root (e.g. cwd fallback)
  const cwdDistPath = `${moduleDir}/dist/${distSubdir}/${wasmFile}`;
  if (probe(cwdDistPath)) {
    return cwdDistPath;
  }

  // Try pkg/@eserstack/ajan/dist/ from the monorepo root (cwd)
  const cwd = globalThis.process?.cwd() ?? ".";
  if (cwd !== moduleDir) {
    const monoDistPath = `${cwd}/pkg/@eserstack/ajan/dist/${distSubdir}/${wasmFile}`;
    if (probe(monoDistPath)) {
      return monoDistPath;
    }
  }

  // 4. npm package (e.g. node_modules/@eserstack/ajan-wasm/)
  const searchRoots = [moduleDir, pkgRoot, cwd];
  for (const root of searchRoots) {
    const npmPath = `${root}/node_modules/@eserstack/ajan-wasm/${wasmFile}`;
    if (probe(npmPath)) {
      return npmPath;
    }
  }

  // 5. System paths
  for (const sysPath of [
    `/usr/local/lib/${wasmFile}`,
    `/usr/lib/${wasmFile}`,
  ]) {
    if (probe(sysPath)) {
      return sysPath;
    }
  }

  throw new Error(
    `Could not find eser-ajan WASM module (${wasmFile}).\n` +
      `Checked the following locations:\n` +
      checkedPaths.map((p) => `  - ${p}`).join("\n") +
      `\n\nTo fix this:\n` +
      `  1. Install: npm install @eserstack/ajan\n` +
      `  2. Or set ESER_AJAN_WASM_PATH to the full path of ${wasmFile}`,
  );
};
