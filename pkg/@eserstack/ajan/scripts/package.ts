// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Packaging progress and the summary table are this script's terminal output.
// deno-lint-ignore-file no-console

/**
 * Packages eser-ajan C-shared library build output into distributable archives.
 *
 * This script:
 * 1. Scans the native dist/{target}/ directories for shared libraries + headers
 * 2. Bundles each target into a tar.gz (Linux/macOS) or zip (Windows) archive
 * 3. Includes the shared library, header file, LICENSE, and a README
 * 4. Generates SHA256 hashes for each archive
 * 5. Writes dist/SHA256SUMS.txt
 *
 * Pipeline:
 *   dist/{target}/ ──▶ bundle + archive (xN) ──▶ SHA256SUMS.txt
 *
 * Usage:
 *   deno run --allow-all ./package.ts                  # package all targets in dist/
 *   deno run --allow-all ./package.ts --version=1.2.3  # override the VERSION file
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as targets from "../targets.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHARED_LIB_NAMES = [
  "libeser_ajan.so",
  "libeser_ajan.dylib",
  "libeser_ajan.dll",
] as const;

const HEADER_NAME = "libeser_ajan.h";

/** Upper bound for one tar or zip run over a target's files. */
const ARCHIVE_TIMEOUT_MINUTES = 5;

const FFI_README_CONTENT = `# eser-ajan — C-shared FFI Library

Pre-built shared library for the eser Go runtime bridge.

## Contents

- Shared library (\`.so\` / \`.dylib\` / \`.dll\`)
- C header file (\`libeser_ajan.h\`)
- LICENSE (Apache-2.0)

## FFI Usage

### C

\`\`\`c
#include "libeser_ajan.h"
#include <stdio.h>

int main() {
    EserAjanInit();
    char* version = EserAjanVersion();
    printf("Version: %s\\n", version);
    EserAjanFree(version);
    EserAjanShutdown();
    return 0;
}
\`\`\`

Compile: \`gcc -o example example.c -L. -leser_ajan\`

### Python

\`\`\`python
import ctypes, os, sys

ext = {"linux": ".so", "darwin": ".dylib", "win32": ".dll"}[sys.platform]
lib = ctypes.cdll.LoadLibrary(os.path.join(".", f"libeser_ajan{ext}"))

lib.EserAjanInit.restype = ctypes.c_int
lib.EserAjanVersion.restype = ctypes.c_char_p
lib.EserAjanFree.argtypes = [ctypes.c_char_p]

lib.EserAjanInit()
version = lib.EserAjanVersion()
print(f"Version: {version.decode()}")
lib.EserAjanFree(version)
lib.EserAjanShutdown()
\`\`\`

### Rust

\`\`\`rust
use std::ffi::CStr;
use std::os::raw::c_char;

extern "C" {
    fn EserAjanInit() -> i32;
    fn EserAjanVersion() -> *mut c_char;
    fn EserAjanFree(ptr: *mut c_char);
    fn EserAjanShutdown();
}

fn main() {
    unsafe {
        EserAjanInit();
        let ptr = EserAjanVersion();
        let version = CStr::from_ptr(ptr).to_string_lossy();
        println!("Version: {}", version);
        EserAjanFree(ptr);
        EserAjanShutdown();
    }
}
\`\`\`

Compile: \`rustc example.rs -L . -l eser_ajan\`

### Ruby

\`\`\`ruby
require "fiddle"
require "fiddle/import"

module EserAjan
  extend Fiddle::Importer
  dlload "./libeser_ajan.so" # or .dylib / .dll
  extern "int EserAjanInit()"
  extern "char* EserAjanVersion()"
  extern "void EserAjanFree(char*)"
  extern "void EserAjanShutdown()"
end

EserAjan.EserAjanInit
version = EserAjan.EserAjanVersion
puts "Version: #{version}"
EserAjan.EserAjanFree(version)
EserAjan.EserAjanShutdown
\`\`\`
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const computeFileSha256 = async (filePath: string): Promise<string> => {
  const data = await runtime.fs.readFile(filePath);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data as unknown as BufferSource,
  );
  const hashArray = new Uint8Array(hashBuffer);

  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Reads the monorepo VERSION file, the same version build.ts stamps into the
 * library. bridge.go only declares `var Version = "dev"` for -ldflags to set.
 */
const readRepoVersion = async (repoRoot: string): Promise<string> => {
  const versionPath = `${repoRoot}/VERSION`;
  if (!await runtime.fs.exists(versionPath)) {
    throw new Error(
      `${versionPath} does not exist. Run from an eser/stack checkout or pass --version=X.Y.Z.`,
    );
  }

  return (await runtime.fs.readTextFile(versionPath)).trim();
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
};

const isWindowsTarget = (targetName: string): boolean =>
  targetName.includes("windows");

// ---------------------------------------------------------------------------
// Archive creation
// ---------------------------------------------------------------------------

/**
 * Creates a tar.gz archive from a staging directory.
 */
const createTarGz = async (
  stagingDir: string,
  outputPath: string,
): Promise<void> => {
  const timeout = AbortSignal.timeout(ARCHIVE_TIMEOUT_MINUTES * 60_000);
  const { code, stderr } = await runtime.exec.spawn(
    "tar",
    ["-czf", outputPath, "-C", stagingDir, "."],
    { stdout: "piped", stderr: "piped", signal: timeout },
  );

  if (timeout.aborted) {
    throw new Error(
      `tar ${outputPath} ran past ${ARCHIVE_TIMEOUT_MINUTES} minutes and was stopped`,
    );
  }

  if (code !== 0) {
    const errText = new TextDecoder().decode(stderr);
    throw new Error(`tar failed: ${errText}`);
  }
};

/**
 * Creates a zip archive from a staging directory.
 */
const createZip = async (
  stagingDir: string,
  outputPath: string,
): Promise<void> => {
  // Collect all files in staging dir
  const files: string[] = [];
  for await (const entry of runtime.fs.readDir(stagingDir)) {
    if (entry.isFile) {
      files.push(entry.name);
    }
  }

  const timeout = AbortSignal.timeout(ARCHIVE_TIMEOUT_MINUTES * 60_000);
  const { code, stderr } = await runtime.exec.spawn(
    "zip",
    ["-j", outputPath, ...files.map((f) => `${stagingDir}/${f}`)],
    { stdout: "piped", stderr: "piped", signal: timeout },
  );

  if (timeout.aborted) {
    throw new Error(
      `zip ${outputPath} ran past ${ARCHIVE_TIMEOUT_MINUTES} minutes and was stopped`,
    );
  }

  if (code !== 0) {
    const errText = new TextDecoder().decode(stderr);
    throw new Error(`zip failed: ${errText}`);
  }
};

// ---------------------------------------------------------------------------
// Packaging logic
// ---------------------------------------------------------------------------

interface PackageResult {
  target: string;
  archiveName: string;
  archivePath: string;
  fileCount: number;
  archiveSize: number;
}

const packageTarget = async (
  targetDir: string,
  targetName: string,
  version: string,
  distDir: string,
  licensePath: string,
): Promise<PackageResult> => {
  // Find the shared library: the first name in SHARED_LIB_NAMES that exists.
  const present = await Promise.all(
    SHARED_LIB_NAMES.map((name) => runtime.fs.exists(`${targetDir}/${name}`)),
  );
  const sharedLibName = SHARED_LIB_NAMES.find((_name, i) => present[i]);

  if (sharedLibName === undefined) {
    throw new Error(
      `No shared library found in ${targetDir} (expected one of: ${
        SHARED_LIB_NAMES.join(", ")
      })`,
    );
  }

  // Check for header
  const headerPath = `${targetDir}/${HEADER_NAME}`;
  if (!await runtime.fs.exists(headerPath)) {
    throw new Error(
      `Header file not found: ${headerPath}. Rebuild the target with scripts/build.ts.`,
    );
  }

  // Create staging directory
  const stagingDir = `${distDir}/_staging_${targetName}`;
  if (await runtime.fs.exists(stagingDir)) {
    await runtime.fs.remove(stagingDir, { recursive: true });
  }
  await runtime.fs.mkdir(stagingDir, { recursive: true });

  // Copy files into staging
  await runtime.fs.copyFile(
    `${targetDir}/${sharedLibName}`,
    `${stagingDir}/${sharedLibName}`,
  );
  await runtime.fs.copyFile(headerPath, `${stagingDir}/${HEADER_NAME}`);
  await runtime.fs.copyFile(licensePath, `${stagingDir}/LICENSE`);
  await runtime.fs.writeTextFile(`${stagingDir}/README.md`, FFI_README_CONTENT);

  // Create archive
  const isWindows = isWindowsTarget(targetName);
  const archiveName = isWindows
    ? `eser-ajan-${version}-${targetName}.zip`
    : `eser-ajan-${version}-${targetName}.tar.gz`;
  const archivePath = `${distDir}/${archiveName}`;

  if (isWindows) {
    await createZip(stagingDir, archivePath);
  } else {
    await createTarGz(stagingDir, archivePath);
  }

  const archiveStat = await runtime.fs.stat(archivePath);

  // Count files bundled
  let fileCount = 0;
  for await (const _entry of runtime.fs.readDir(stagingDir)) {
    fileCount++;
  }

  // Clean up staging
  await runtime.fs.remove(stagingDir, { recursive: true });

  return {
    target: targetName,
    archiveName,
    archivePath,
    fileCount,
    archiveSize: archiveStat.size,
  };
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const printUsage = (): void => {
  console.log(`Usage: deno run --allow-all package.ts [options]

Options:
  --version=X.Y.Z    Override version (default: the repository VERSION file)
  --help             Show this help

Packages all targets found in dist/ into distributable archives containing
the shared library, header file, LICENSE, and README with FFI examples.`);
};

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  // Strip the trailing "scripts" segment regardless of path separator
  // (import.meta.dirname uses backslashes on Windows).
  const pkgDir = scriptDir.replace(/[/\\]scripts$/, "");
  const distDir = `${pkgDir}/dist`;
  const repoRoot = `${pkgDir}/../../..`;

  const args = runtime.process.args as string[];

  // --help
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  // --version
  const versionFlag = "--version=";
  const versionArg = args.find((a) => a.startsWith(versionFlag));
  const version = versionArg !== undefined
    ? versionArg.slice(versionFlag.length)
    : await readRepoVersion(repoRoot);

  console.log(`Packaging eser-ajan v${version} ...\n`);

  // Locate LICENSE
  const licensePath = `${repoRoot}/LICENSE`;
  if (!await runtime.fs.exists(licensePath)) {
    throw new Error(
      `LICENSE not found at ${licensePath}. Expected repo root LICENSE file.`,
    );
  }

  if (!await runtime.fs.exists(distDir)) {
    console.error(
      `dist/ directory not found. Run build.ts first:\n  deno run --allow-all scripts/build.ts`,
    );
    Deno.exitCode = 1;
    return;
  }

  // Discover targets in dist/
  const targetDirs: { name: string; path: string }[] = [];

  for await (const entry of runtime.fs.readDir(distDir)) {
    if (!entry.isDirectory) continue;
    // Staging dirs start with "_"; WASM builds (wasi/, wasi-reactor/) ship in
    // @eserstack/ajan-wasm, not in these archives.
    if (targets.findNativeTarget(entry.name) === undefined) continue;

    targetDirs.push({ name: entry.name, path: `${distDir}/${entry.name}` });
  }

  if (targetDirs.length === 0) {
    console.error(
      `No target directories found in dist/. Run build.ts first.`,
    );
    Deno.exitCode = 1;
    return;
  }

  // Sort for deterministic output
  targetDirs.sort((a, b) => a.name.localeCompare(b.name));

  console.log(
    `Found ${targetDirs.length} target(s): ${
      targetDirs.map((t) => t.name).join(", ")
    }\n`,
  );

  // Package each target
  const results: PackageResult[] = [];
  const failed: string[] = [];

  for (const { name, path } of targetDirs) {
    console.log(`  Packaging ${name} ...`);

    try {
      // One target at a time: each archive runs tar or zip over a large
      // library, and the per-target progress lines stay grouped.
      // deno-lint-ignore no-await-in-loop
      const result = await packageTarget(
        path,
        name,
        version,
        distDir,
        licensePath,
      );
      console.log(
        `    OK  ${result.fileCount} files, archive ${
          formatBytes(result.archiveSize)
        }`,
      );
      results.push(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    FAIL: ${msg}`);
      failed.push(name);
    }
  }

  // Generate SHA256SUMS.txt
  console.log("\nGenerating SHA256SUMS.txt ...");

  const sha256Lines: string[] = [];

  for (const { archiveName, archivePath } of results) {
    // One archive at a time: computeFileSha256 reads the whole file into
    // memory, so hashing them together would hold every archive at once.
    // deno-lint-ignore no-await-in-loop
    const hash = await computeFileSha256(archivePath);
    sha256Lines.push(`${hash}  ${archiveName}`);
  }

  const sha256Path = `${distDir}/SHA256SUMS.txt`;
  await runtime.fs.writeTextFile(sha256Path, sha256Lines.join("\n") + "\n");

  // Summary
  console.log(`\n${"─".repeat(62)}`);
  console.log(
    `${"Target".padEnd(22)} ${"Archive".padEnd(24)} ${"Size".padEnd(12)}`,
  );
  console.log(`${"─".repeat(62)}`);

  for (const r of results) {
    console.log(
      `${r.target.padEnd(22)} ${r.archiveName.padEnd(24)} ${
        formatBytes(r.archiveSize).padEnd(12)
      }`,
    );
  }

  console.log(`${"─".repeat(62)}`);

  console.log(
    `\n${results.length}/${targetDirs.length} packaged successfully`,
  );

  if (failed.length > 0) {
    console.error(`${failed.length} failed: ${failed.join(", ")}`);
  }

  console.log(`\nOutput: ${distDir}/`);
  for (const { archiveName } of results) {
    console.log(`  ${archiveName}`);
  }
  console.log(`  SHA256SUMS.txt`);

  if (failed.length > 0) {
    Deno.exitCode = 1;
  }
};

if (import.meta.main) {
  // A script entry point: the process has nothing else to do until main ends.
  // deno-lint-ignore no-top-level-await
  await main();
}
