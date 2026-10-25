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

/**
 * Reads an environment variable across runtimes.
 *
 * Uses `process.env` which works on Deno 2.7+, Node.js, and Bun.
 */
const getEnvVar = (name: string): string | undefined => {
  // globalThis does not declare Deno, Bun or process on every runtime.
  // oxlint-disable-next-line typescript/no-explicit-any
  const g = globalThis as any;

  // process.env works on Node, Bun, and Deno 2.7+
  if (typeof g.process !== "undefined" && typeof g.process.env === "object") {
    return g.process.env[name] ?? undefined;
  }

  return undefined;
};

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
  // Also try .wasm.bin — used in compiled binaries where .wasm is renamed
  // to avoid Deno's static WASM import validation during deno compile.
  const wasmVariants = [wasmFile, `${wasmFile}.bin`];
  const distSubdir = "wasi";
  const checkedPaths: string[] = [];

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
  for (const variant of wasmVariants) {
    const adjacentPath = `${moduleDir}/${variant}`;
    checkedPaths.push(adjacentPath);
    if (ffiResolve.fileExists(adjacentPath)) {
      return adjacentPath;
    }
  }

  // 3. In the dist directory for the WASM build output
  // wasm/ is one level below the package root, so go up one level to reach dist/
  const pkgRoot = `${moduleDir}/..`;
  for (const variant of wasmVariants) {
    const distPath = `${pkgRoot}/dist/${distSubdir}/${variant}`;
    checkedPaths.push(distPath);
    if (ffiResolve.fileExists(distPath)) {
      return distPath;
    }
  }

  // Also try dist/ when moduleDir IS the package root (e.g. cwd fallback)
  for (const variant of wasmVariants) {
    const cwdDistPath = `${moduleDir}/dist/${distSubdir}/${variant}`;
    checkedPaths.push(cwdDistPath);
    if (ffiResolve.fileExists(cwdDistPath)) {
      return cwdDistPath;
    }
  }

  // Try pkg/@eserstack/ajan/dist/ from the monorepo root (cwd)
  // globalThis does not declare Deno, Bun or process on every runtime.
  // oxlint-disable-next-line typescript/no-explicit-any
  const g = globalThis as any;
  const cwd =
    typeof g.process !== "undefined" && typeof g.process.cwd === "function"
      ? g.process.cwd()
      : ".";
  if (cwd !== moduleDir) {
    for (const variant of wasmVariants) {
      const monoDistPath = `${cwd}/pkg/@eserstack/ajan/dist/${distSubdir}/${variant}`;
      checkedPaths.push(monoDistPath);
      if (ffiResolve.fileExists(monoDistPath)) {
        return monoDistPath;
      }
    }
  }

  // 4. npm package (e.g. node_modules/@eserstack/ajan-wasm/)
  const searchRoots = [moduleDir, pkgRoot, cwd];
  for (const root of searchRoots) {
    for (const variant of wasmVariants) {
      const npmPath = `${root}/node_modules/@eserstack/ajan-wasm/${variant}`;
      checkedPaths.push(npmPath);
      if (ffiResolve.fileExists(npmPath)) {
        return npmPath;
      }
    }
  }

  // 5. System paths
  for (const variant of wasmVariants) {
    const systemPaths = [`/usr/local/lib/${variant}`, `/usr/lib/${variant}`];
    for (const sysPath of systemPaths) {
      checkedPaths.push(sysPath);
      if (ffiResolve.fileExists(sysPath)) {
        return sysPath;
      }
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
