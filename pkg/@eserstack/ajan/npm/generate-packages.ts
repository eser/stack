// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Generates platform-specific npm package directories from build output.
 *
 * For each of the 6 supported targets, this script creates a package directory
 * containing a `package.json`, the shared library, and the C header file.
 *
 * The generated packages are intended for use as npm `optionalDependencies`
 * of the root `@eserstack/ajan` package — npm installs only the one matching
 * the current platform.
 *
 * Prerequisites: run `scripts/build.ts` first so that `dist/` contains the
 * built shared libraries.
 *
 * Usage:
 *   deno run --allow-all npm/generate-packages.ts          # all available targets
 *   deno run --allow-all npm/generate-packages.ts --clean   # remove generated dirs
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as targets from "../targets.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEADER_FILE = "libeser_ajan.h";
const LICENSE = "Apache-2.0";

const REPOSITORY = {
  type: "git",
  url: "https://github.com/eser/stack",
  directory: "pkg/@eserstack/ajan",
};

const HOMEPAGE = "https://github.com/eser/stack/tree/main/pkg/@eserstack/ajan";
const BUGS_URL = "https://github.com/eser/stack/issues";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reads the package version — prefers the root VERSION file, falls back to bridge.go. */
const readVersion = async (pkgDir: string): Promise<string> => {
  // Try root VERSION file first (always has the real release version)
  const projectRoot = pkgDir.replace(/\/pkg\/.*$/, "");
  try {
    const versionFileContent = (await runtime.fs.readTextFile(
      `${projectRoot}/VERSION`,
    )).trim();
    if (versionFileContent.length > 0 && versionFileContent !== "dev") {
      return versionFileContent;
    }
  } catch {
    // VERSION file not found, fall through
  }

  // Fall back to bridge.go
  const bridgePath = `${pkgDir}/bridge.go`;
  const content = await runtime.fs.readTextFile(bridgePath);
  const match = content.match(/(?:const|var)\s+Version\s*=\s*"([^"]+)"/);

  if (match === null || match[1] === undefined) {
    throw new Error(
      `Could not determine version from VERSION file or ${bridgePath}`,
    );
  }

  return match[1];
};

/** Copies a file, creating the destination directory if needed. */
const copyFile = async (src: string, dst: string): Promise<void> => {
  await runtime.fs.copyFile(src, dst);
};

/** Checks whether a file exists. */
const fileExists = async (path: string): Promise<boolean> => {
  try {
    await runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Generation logic
// ---------------------------------------------------------------------------

interface GenerateResult {
  npmSuffix: string;
  status: "ok" | "skip" | "fail";
  reason?: string;
}

const generatePlatformPackage = async (
  target: targets.NativeTarget,
  _pkgDir: string,
  distDir: string,
  outputBaseDir: string,
  version: string,
): Promise<GenerateResult> => {
  const buildDir = `${distDir}/${target.id}`;
  const libPath = `${buildDir}/${target.libFile}`;
  const headerPath = `${buildDir}/${HEADER_FILE}`;

  // Check if build output exists for this target
  if (!await fileExists(libPath)) {
    return {
      npmSuffix: target.npmSuffix,
      status: "skip",
      reason: `No build output: ${libPath}`,
    };
  }

  const pkgName =
    `${targets.NPM_SCOPE}/${targets.NPM_PKG_PREFIX}-${target.npmSuffix}`;
  const outputDir =
    `${outputBaseDir}/${targets.NPM_PKG_PREFIX}-${target.npmSuffix}`;

  try {
    await runtime.fs.mkdir(outputDir, { recursive: true });
  } catch {
    // already exists
  }

  // Build the files array based on what exists
  const filesArray = [target.libFile];
  const hasHeader = await fileExists(headerPath);
  if (hasHeader) {
    filesArray.push(HEADER_FILE);
  }

  // Generate package.json
  const packageJson = {
    name: pkgName,
    version,
    description: target.description,
    license: LICENSE,
    repository: REPOSITORY,
    homepage: HOMEPAGE,
    bugs: { url: BUGS_URL },
    os: [target.npmOs],
    cpu: [target.npmCpu],
    main: target.libFile,
    files: filesArray,
  };

  await runtime.fs.writeTextFile(
    `${outputDir}/package.json`,
    JSON.stringify(packageJson, null, 2) + "\n",
  );

  // Copy shared library
  await copyFile(libPath, `${outputDir}/${target.libFile}`);

  // Copy header file if it exists
  if (hasHeader) {
    await copyFile(headerPath, `${outputDir}/${HEADER_FILE}`);
  }

  return { npmSuffix: target.npmSuffix, status: "ok" };
};

// ---------------------------------------------------------------------------
// WASM package generation
// ---------------------------------------------------------------------------

const generateWasmPackage = async (
  distDir: string,
  outputBaseDir: string,
  version: string,
): Promise<GenerateResult> => {
  const pkgName =
    `${targets.NPM_SCOPE}/${targets.NPM_PKG_PREFIX}-${targets.NPM_WASM_SUFFIX}`;
  const outputDir =
    `${outputBaseDir}/${targets.NPM_PKG_PREFIX}-${targets.NPM_WASM_SUFFIX}`;

  try {
    await runtime.fs.mkdir(outputDir, { recursive: true });
  } catch {
    // already exists
  }

  const copiedFiles: string[] = [];

  for (const wt of targets.WASM_TARGETS) {
    const srcPath = `${distDir}/${wt.id}/${wt.outputFile}`;
    if (await fileExists(srcPath)) {
      await copyFile(srcPath, `${outputDir}/${wt.outputFile}`);
      copiedFiles.push(wt.outputFile);
    }
  }

  if (copiedFiles.length === 0) {
    return {
      npmSuffix: targets.NPM_WASM_SUFFIX,
      status: "skip",
      reason: "No WASM build output found in dist/wasi/ or dist/wasi-reactor/",
    };
  }

  const packageJson = {
    name: pkgName,
    version,
    description:
      "WebAssembly fallback for eser-ajan \u2014 works on any platform",
    license: LICENSE,
    repository: REPOSITORY,
    homepage: HOMEPAGE,
    bugs: { url: BUGS_URL },
    files: copiedFiles,
  };

  await runtime.fs.writeTextFile(
    `${outputDir}/package.json`,
    JSON.stringify(packageJson, null, 2) + "\n",
  );

  return { npmSuffix: targets.NPM_WASM_SUFFIX, status: "ok" };
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  const pkgDir = scriptDir.replace(/\/npm$/, "");
  const distDir = `${pkgDir}/dist`;
  const outputBaseDir = `${distDir}/npm`;

  const args = runtime.process.args as string[];

  // --clean
  if (args.includes("--clean")) {
    // deno-lint-ignore no-console
    console.log("Removing generated npm package directories...");
    try {
      await runtime.fs.remove(outputBaseDir, { recursive: true });
      // deno-lint-ignore no-console
      console.log("Done.");
    } catch {
      // deno-lint-ignore no-console
      console.log("Nothing to clean.");
    }
    return;
  }

  // Read version from VERSION file (or bridge.go fallback)
  const version = await readVersion(pkgDir);
  // deno-lint-ignore no-console
  console.log(`Generating npm packages (version ${version})...\n`);

  // Create output base directory
  try {
    await runtime.fs.mkdir(outputBaseDir, { recursive: true });
  } catch {
    // already exists
  }

  // Generate each platform package
  const results: GenerateResult[] = [];

  for (const target of targets.NATIVE_TARGETS) {
    // deno-lint-ignore no-console
    console.log(
      `  ${targets.NPM_SCOPE}/${targets.NPM_PKG_PREFIX}-${target.npmSuffix} ...`,
    );
    const result = await generatePlatformPackage(
      target,
      pkgDir,
      distDir,
      outputBaseDir,
      version,
    );
    results.push(result);

    if (result.status === "ok") {
      // deno-lint-ignore no-console
      console.log("    OK");
    } else if (result.status === "skip") {
      // deno-lint-ignore no-console
      console.log(`    SKIP: ${result.reason}`);
    } else {
      // deno-lint-ignore no-console
      console.error(`    FAIL: ${result.reason}`);
    }
  }

  // Generate WASM package
  // deno-lint-ignore no-console
  console.log(
    `\n  ${targets.NPM_SCOPE}/${targets.NPM_PKG_PREFIX}-${targets.NPM_WASM_SUFFIX} ...`,
  );
  const wasmResult = await generateWasmPackage(distDir, outputBaseDir, version);
  results.push(wasmResult);

  if (wasmResult.status === "ok") {
    // deno-lint-ignore no-console
    console.log("    OK");
  } else if (wasmResult.status === "skip") {
    // deno-lint-ignore no-console
    console.log(`    SKIP: ${wasmResult.reason}`);
  } else {
    // deno-lint-ignore no-console
    console.error(`    FAIL: ${wasmResult.reason}`);
  }

  // Summary
  const ok = results.filter((r) => r.status === "ok").length;
  const skip = results.filter((r) => r.status === "skip").length;
  const fail = results.filter((r) => r.status === "fail").length;

  // deno-lint-ignore no-console
  console.log(`\n${"─".repeat(50)}`);
  // deno-lint-ignore no-console
  console.log(`Generated: ${ok}  Skipped: ${skip}  Failed: ${fail}`);
  // deno-lint-ignore no-console
  console.log(`Output:    ${outputBaseDir}`);
  // deno-lint-ignore no-console
  console.log(`${"─".repeat(50)}`);

  if (fail > 0) {
    runtime.process.setExitCode(1);
  }
};

main();
