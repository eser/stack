// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * WASM file resolution for the eser-ajan WASM modules.
 *
 * Searches multiple well-known locations for the WASM file and returns the
 * first path that exists. Mirrors the resolution strategy in `ffi/resolve.ts`.
 *
 * @module
 */

/**
 * `node:fs` module resolved once via top-level await.
 * Works identically on Node 25+, Bun 1.3+, and Deno 2.7+.
 */
const nodeFs = await import("node:fs");

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

/**
 * Returns the directory containing this module file.
 * Falls back to the current working directory if detection fails.
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

/** WASM file names for each mode. */
const WASM_FILENAMES: Record<string, string> = {
  command: "eser-ajan.wasm",
  reactor: "eser-ajan-reactor.wasm",
};

/**
 * Resolves the path to a WASM file.
 *
 * Search order:
 * 1. `ESER_AJAN_WASM_PATH` environment variable (explicit override)
 * 2. Adjacent to this module (`./eser-ajan.wasm`)
 * 3. In the dist directory (`dist/wasi/` or `dist/wasi-reactor/`)
 * 4. npm package (`node_modules/@eserstack/ajan-wasm/`)
 * 5. System paths (`/usr/local/lib/`)
 *
 * @param mode - The WASM mode: "command" or "reactor"
 * @param moduleDirHint - Optional path to the directory containing this module.
 *   Callers should pass `import.meta.dirname` when available.
 * @throws {Error} If no WASM file is found at any location.
 */
export const resolveWasmPath = (
  mode: "command" | "reactor" = "command",
  moduleDirHint?: string,
): string => {
  const wasmFile = WASM_FILENAMES[mode] ?? WASM_FILENAMES["command"]!;
  const distSubdir = mode === "reactor" ? "wasi-reactor" : "wasi";
  const checkedPaths: string[] = [];

  // 1. Environment variable override
  const envPath = getEnvVar("ESER_AJAN_WASM_PATH");
  if (envPath !== undefined) {
    if (fileExists(envPath)) {
      return envPath;
    }
    checkedPaths.push(`$ESER_AJAN_WASM_PATH = ${envPath}`);
  }

  const moduleDir = getModuleDir(moduleDirHint);

  // 2. Adjacent to this module (wasm/ directory)
  const adjacentPath = `${moduleDir}/${wasmFile}`;
  checkedPaths.push(adjacentPath);
  if (fileExists(adjacentPath)) {
    return adjacentPath;
  }

  // 3. In the dist directory for the WASM build output
  // wasm/ is one level below the package root, so go up one level to reach dist/
  const pkgRoot = `${moduleDir}/..`;
  const distPath = `${pkgRoot}/dist/${distSubdir}/${wasmFile}`;
  checkedPaths.push(distPath);
  if (fileExists(distPath)) {
    return distPath;
  }

  // Also try dist/ when moduleDir IS the package root (e.g. cwd fallback)
  const cwdDistPath = `${moduleDir}/dist/${distSubdir}/${wasmFile}`;
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
    const monoDistPath = `${cwd}/pkg/@eser/ajan/dist/${distSubdir}/${wasmFile}`;
    checkedPaths.push(monoDistPath);
    if (fileExists(monoDistPath)) {
      return monoDistPath;
    }
  }

  // 4. npm package (e.g. node_modules/@eserstack/ajan-wasm/)
  const searchRoots = [moduleDir, pkgRoot, cwd];
  for (const root of searchRoots) {
    const npmPath = `${root}/node_modules/@eserstack/ajan-wasm/${wasmFile}`;
    checkedPaths.push(npmPath);
    if (fileExists(npmPath)) {
      return npmPath;
    }
  }

  // 5. System paths
  const systemPaths = [
    `/usr/local/lib/${wasmFile}`,
    `/usr/lib/${wasmFile}`,
  ];
  for (const sysPath of systemPaths) {
    checkedPaths.push(sysPath);
    if (fileExists(sysPath)) {
      return sysPath;
    }
  }

  throw new Error(
    `Could not find eser-ajan WASM module (${wasmFile}).\n` +
      `Checked the following locations:\n` +
      checkedPaths.map((p) => `  - ${p}`).join("\n") +
      `\n\nTo fix this:\n` +
      `  1. Build the WASM module: deno run --allow-all scripts/build.ts --wasm\n` +
      `  2. Or set ESER_AJAN_WASM_PATH to the full path of ${wasmFile}`,
  );
};
