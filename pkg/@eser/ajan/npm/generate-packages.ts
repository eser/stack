// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Generates platform-specific npm package directories from build output.
 *
 * For each of the 6 supported targets, this script creates a package directory
 * containing a `package.json`, the shared library, and the C header file.
 *
 * The generated packages are intended for use as npm `optionalDependencies`
 * of the root `@eser/ajan` package — npm installs only the one matching
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

import { runtime } from "@eser/standards/cross-runtime";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface PlatformTarget {
  /** Internal build-output directory name (e.g. "aarch64-darwin") */
  buildTarget: string;
  /** npm package suffix (e.g. "darwin-arm64") */
  npmSuffix: string;
  /** npm `os` field value */
  os: string;
  /** npm `cpu` field value */
  cpu: string;
  /** Shared library filename */
  libFile: string;
  /** Human-readable platform description */
  description: string;
}

const PLATFORM_TARGETS: readonly PlatformTarget[] = [
  {
    buildTarget: "aarch64-darwin",
    npmSuffix: "darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    libFile: "libeser_ajan.dylib",
    description: "eser-ajan shared library for macOS ARM64 (Apple Silicon)",
  },
  {
    buildTarget: "x86_64-darwin",
    npmSuffix: "darwin-x64",
    os: "darwin",
    cpu: "x64",
    libFile: "libeser_ajan.dylib",
    description: "eser-ajan shared library for macOS x64 (Intel)",
  },
  {
    buildTarget: "aarch64-linux",
    npmSuffix: "linux-arm64",
    os: "linux",
    cpu: "arm64",
    libFile: "libeser_ajan.so",
    description: "eser-ajan shared library for Linux ARM64",
  },
  {
    buildTarget: "x86_64-linux",
    npmSuffix: "linux-x64",
    os: "linux",
    cpu: "x64",
    libFile: "libeser_ajan.so",
    description: "eser-ajan shared library for Linux x64",
  },
  {
    buildTarget: "aarch64-windows",
    npmSuffix: "win32-arm64",
    os: "win32",
    cpu: "arm64",
    libFile: "libeser_ajan.dll",
    description: "eser-ajan shared library for Windows ARM64",
  },
  {
    buildTarget: "x86_64-windows",
    npmSuffix: "win32-x64",
    os: "win32",
    cpu: "x64",
    libFile: "libeser_ajan.dll",
    description: "eser-ajan shared library for Windows x64",
  },
] as const;

const HEADER_FILE = "libeser_ajan.h";
const NPM_SCOPE = "@eserstack";
const PKG_PREFIX = "ajan";
const WASM_PKG_SUFFIX = "wasm";
const LICENSE = "Apache-2.0";

const REPOSITORY = {
  type: "git",
  url: "https://github.com/eser/stack",
  directory: "pkg/@eser/ajan",
};

const HOMEPAGE = "https://github.com/eser/stack/tree/main/pkg/@eser/ajan";
const BUGS_URL = "https://github.com/eser/stack/issues";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reads the Version constant from bridge.go. */
const readGoVersion = async (pkgDir: string): Promise<string> => {
  const bridgePath = `${pkgDir}/bridge.go`;
  const content = await runtime.fs.readTextFile(bridgePath);
  const match = content.match(/(?:const|var)\s+Version\s*=\s*"([^"]+)"/);

  if (match === null || match[1] === undefined) {
    throw new Error(`Could not find Version constant in ${bridgePath}`);
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
  target: PlatformTarget,
  _pkgDir: string,
  distDir: string,
  outputBaseDir: string,
  version: string,
): Promise<GenerateResult> => {
  const buildDir = `${distDir}/${target.buildTarget}`;
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

  const pkgName = `${NPM_SCOPE}/${PKG_PREFIX}-${target.npmSuffix}`;
  const outputDir = `${outputBaseDir}/${PKG_PREFIX}-${target.npmSuffix}`;

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
    os: [target.os],
    cpu: [target.cpu],
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

/** WASM files to include: [distSubdir, filename]. */
const WASM_FILES: readonly [string, string][] = [
  ["wasi", "eser-ajan.wasm"],
  ["wasi-reactor", "eser-ajan-reactor.wasm"],
];

const generateWasmPackage = async (
  distDir: string,
  outputBaseDir: string,
  version: string,
): Promise<GenerateResult> => {
  const pkgName = `${NPM_SCOPE}/${PKG_PREFIX}-${WASM_PKG_SUFFIX}`;
  const outputDir = `${outputBaseDir}/${PKG_PREFIX}-${WASM_PKG_SUFFIX}`;

  try {
    await runtime.fs.mkdir(outputDir, { recursive: true });
  } catch {
    // already exists
  }

  const copiedFiles: string[] = [];

  for (const [subdir, filename] of WASM_FILES) {
    const srcPath = `${distDir}/${subdir}/${filename}`;
    if (await fileExists(srcPath)) {
      await copyFile(srcPath, `${outputDir}/${filename}`);
      copiedFiles.push(filename);
    }
  }

  if (copiedFiles.length === 0) {
    return {
      npmSuffix: WASM_PKG_SUFFIX,
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

  return { npmSuffix: WASM_PKG_SUFFIX, status: "ok" };
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

  // Read version from Go source
  const version = await readGoVersion(pkgDir);
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

  for (const target of PLATFORM_TARGETS) {
    // deno-lint-ignore no-console
    console.log(`  ${NPM_SCOPE}/${PKG_PREFIX}-${target.npmSuffix} ...`);
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
  console.log(`\n  ${NPM_SCOPE}/${PKG_PREFIX}-${WASM_PKG_SUFFIX} ...`);
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

  // Generate root package.json
  // deno-lint-ignore no-console
  console.log(`\n  ${NPM_SCOPE}/${PKG_PREFIX} (root) ...`);

  const optionalDependencies: Record<string, string> = {};
  for (const target of PLATFORM_TARGETS) {
    optionalDependencies[`${NPM_SCOPE}/${PKG_PREFIX}-${target.npmSuffix}`] =
      version;
  }
  optionalDependencies[`${NPM_SCOPE}/${PKG_PREFIX}-${WASM_PKG_SUFFIX}`] =
    version;

  const rootPackageJson = {
    name: `${NPM_SCOPE}/${PKG_PREFIX}`,
    version,
    description:
      "Go FFI bridge for eser CLI — cross-runtime (Node.js, Bun, Deno)",
    type: "module",
    exports: {
      ".": "./ffi/mod.ts",
      "./ffi": "./ffi/mod.ts",
    },
    optionalDependencies,
    license: LICENSE,
    repository: REPOSITORY,
    homepage: HOMEPAGE,
    bugs: { url: BUGS_URL },
  };

  const rootDir = `${outputBaseDir}/${PKG_PREFIX}`;
  try {
    await runtime.fs.mkdir(rootDir, { recursive: true });
  } catch {
    // already exists
  }

  await runtime.fs.writeTextFile(
    `${rootDir}/package.json`,
    JSON.stringify(rootPackageJson, null, 2) + "\n",
  );

  // deno-lint-ignore no-console
  console.log("    OK");

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
