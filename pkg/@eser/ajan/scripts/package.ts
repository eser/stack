// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Packages eser-ajan C-shared library build output into distributable archives.
 *
 * This script:
 * 1. Scans dist/{target}/ directories for built shared libraries + headers
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
 *   deno run --allow-all ./package.ts --version=1.2.3  # override version
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHARED_LIB_NAMES = [
  "libeser_ajan.so",
  "libeser_ajan.dylib",
  "libeser_ajan.dll",
] as const;

const HEADER_NAME = "libeser_ajan.h";

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

const readVersionFromBridgeGo = async (pkgDir: string): Promise<string> => {
  const bridgePath = `${pkgDir}/bridge.go`;
  const content = await runtime.fs.readTextFile(bridgePath);
  const match = content.match(/const\s+Version\s*=\s*"([^"]+)"/);

  if (match === null) {
    throw new Error(
      `Could not extract Version from ${bridgePath}`,
    );
  }

  return match[1];
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
  const { code, stderr } = await runtime.exec.spawn(
    "tar",
    ["-czf", outputPath, "-C", stagingDir, "."],
    { stdout: "piped", stderr: "piped" },
  );

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

  const { code, stderr } = await runtime.exec.spawn(
    "zip",
    ["-j", outputPath, ...files.map((f) => `${stagingDir}/${f}`)],
    { stdout: "piped", stderr: "piped" },
  );

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
  // Find the shared library
  let sharedLibName: string | undefined;
  for (const name of SHARED_LIB_NAMES) {
    try {
      await runtime.fs.stat(`${targetDir}/${name}`);
      sharedLibName = name;
      break;
    } catch {
      // not found, try next
    }
  }

  if (sharedLibName === undefined) {
    throw new Error(
      `No shared library found in ${targetDir} (expected one of: ${
        SHARED_LIB_NAMES.join(", ")
      })`,
    );
  }

  // Check for header
  const headerPath = `${targetDir}/${HEADER_NAME}`;
  try {
    await runtime.fs.stat(headerPath);
  } catch {
    throw new Error(`Header file not found: ${headerPath}`);
  }

  // Create staging directory
  const stagingDir = `${distDir}/_staging_${targetName}`;
  try {
    await runtime.fs.remove(stagingDir, { recursive: true });
  } catch {
    // doesn't exist
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
  // deno-lint-ignore no-console
  console.log(`Usage: deno run --allow-all package.ts [options]

Options:
  --version=X.Y.Z    Override version (default: read from bridge.go)
  --help             Show this help

Packages all targets found in dist/ into distributable archives containing
the shared library, header file, LICENSE, and README with FFI examples.`);
};

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  const pkgDir = scriptDir.replace(/\/scripts$/, "");
  const distDir = `${pkgDir}/dist`;
  const repoRoot = `${pkgDir}/../../..`;

  const args = runtime.process.args as string[];

  // --help
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  // --version
  const versionArg = args.find((a) => a.startsWith("--version="));
  const version = versionArg !== undefined
    ? versionArg.split("=")[1]
    : await readVersionFromBridgeGo(pkgDir);

  // deno-lint-ignore no-console
  console.log(`Packaging eser-ajan v${version} ...\n`);

  // Locate LICENSE
  const licensePath = `${repoRoot}/LICENSE`;
  try {
    await runtime.fs.stat(licensePath);
  } catch {
    throw new Error(
      `LICENSE not found at ${licensePath}. Expected repo root LICENSE file.`,
    );
  }

  // Discover targets in dist/
  const targetDirs: { name: string; path: string }[] = [];

  try {
    for await (const entry of runtime.fs.readDir(distDir)) {
      if (!entry.isDirectory) continue;
      if (entry.name.startsWith("_")) continue; // skip staging dirs

      targetDirs.push({ name: entry.name, path: `${distDir}/${entry.name}` });
    }
  } catch {
    // deno-lint-ignore no-console
    console.error(
      `dist/ directory not found. Run build.ts first:\n  deno run --allow-all scripts/build.ts`,
    );
    Deno.exitCode = 1;
    return;
  }

  if (targetDirs.length === 0) {
    // deno-lint-ignore no-console
    console.error(
      `No target directories found in dist/. Run build.ts first.`,
    );
    Deno.exitCode = 1;
    return;
  }

  // Sort for deterministic output
  targetDirs.sort((a, b) => a.name.localeCompare(b.name));

  // deno-lint-ignore no-console
  console.log(
    `Found ${targetDirs.length} target(s): ${
      targetDirs.map((t) => t.name).join(", ")
    }\n`,
  );

  // Package each target
  const results: PackageResult[] = [];
  const failed: string[] = [];

  for (const { name, path } of targetDirs) {
    // deno-lint-ignore no-console
    console.log(`  Packaging ${name} ...`);

    try {
      const result = await packageTarget(
        path,
        name,
        version,
        distDir,
        licensePath,
      );
      // deno-lint-ignore no-console
      console.log(
        `    OK  ${result.fileCount} files, archive ${
          formatBytes(result.archiveSize)
        }`,
      );
      results.push(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // deno-lint-ignore no-console
      console.error(`    FAIL: ${msg}`);
      failed.push(name);
    }
  }

  // Generate SHA256SUMS.txt
  // deno-lint-ignore no-console
  console.log("\nGenerating SHA256SUMS.txt ...");

  const sha256Lines: string[] = [];

  for (const { archiveName, archivePath } of results) {
    const hash = await computeFileSha256(archivePath);
    sha256Lines.push(`${hash}  ${archiveName}`);
  }

  const sha256Path = `${distDir}/SHA256SUMS.txt`;
  await runtime.fs.writeTextFile(sha256Path, sha256Lines.join("\n") + "\n");

  // Summary
  // deno-lint-ignore no-console
  console.log(`\n${"─".repeat(62)}`);
  // deno-lint-ignore no-console
  console.log(
    `${"Target".padEnd(22)} ${"Archive".padEnd(24)} ${"Size".padEnd(12)}`,
  );
  // deno-lint-ignore no-console
  console.log(`${"─".repeat(62)}`);

  for (const r of results) {
    // deno-lint-ignore no-console
    console.log(
      `${r.target.padEnd(22)} ${r.archiveName.padEnd(24)} ${
        formatBytes(r.archiveSize).padEnd(12)
      }`,
    );
  }

  // deno-lint-ignore no-console
  console.log(`${"─".repeat(62)}`);

  // deno-lint-ignore no-console
  console.log(
    `\n${results.length}/${targetDirs.length} packaged successfully`,
  );

  if (failed.length > 0) {
    // deno-lint-ignore no-console
    console.error(`${failed.length} failed: ${failed.join(", ")}`);
  }

  // deno-lint-ignore no-console
  console.log(`\nOutput: ${distDir}/`);
  for (const { archiveName } of results) {
    // deno-lint-ignore no-console
    console.log(`  ${archiveName}`);
  }
  // deno-lint-ignore no-console
  console.log(`  SHA256SUMS.txt`);

  if (failed.length > 0) {
    Deno.exitCode = 1;
  }
};

main();
