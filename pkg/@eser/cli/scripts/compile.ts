// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Compiles the CLI into standalone binaries for multiple platforms.
 *
 * This script:
 * 1. Reads the VERSION file
 * 2. Optionally builds Go shared libraries (--with-go)
 * 3. Runs `deno compile` for each target platform, embedding Go shared
 *    libraries and WASM files when available via --include
 * 4. Validates each binary is not corrupted (>1MB)
 * 5. Creates compressed archives (.tar.gz / .zip)
 * 6. Generates SHA256SUMS.txt with streaming hash computation
 *
 * Pipeline:
 *   VERSION ──▶ [go build] ──▶ deno compile (×5) ──▶ validate ──▶ archive ──▶ SHA256SUMS.txt
 *
 * Usage:
 *   deno run --allow-all ./compile.ts
 *   deno run --allow-all ./compile.ts --with-go   # build Go libs first
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";
import * as shellExec from "@eser/shell/exec";
import * as ajanTargets from "../../ajan/targets.ts";

/** Deno compile target triples — derived from canonical targets. */
const TARGETS = ajanTargets.NATIVE_TARGETS.map((t) => t.denoTarget);

const MIN_BINARY_SIZE = 1_000_000; // 1MB — Deno binaries are 80-130MB

/**
 * Computes SHA256 hash of a file using streaming (64KB chunks, <1MB peak memory).
 */
const computeFileSha256 = async (filePath: string): Promise<string> => {
  const nodeFs = await import("node:fs");
  const { createReadStream } = nodeFs;

  const stream = createReadStream(filePath, { highWaterMark: 65_536 });
  const chunks: Uint8Array[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  }

  // Concatenate all chunks for digest
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    combined as unknown as BufferSource,
  );
  const hashArray = new Uint8Array(hashBuffer);

  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Creates a .tar.gz archive containing files from a staging directory.
 */
const createTarGz = async (
  stagingDir: string,
  fileNames: string[],
  outputPath: string,
): Promise<void> => {
  await shellExec.exec`tar -czf ${outputPath} -C ${stagingDir} ${fileNames}`
    .spawn();
};

/**
 * Creates a .zip archive containing files from a staging directory.
 */
const createZip = async (
  stagingDir: string,
  fileNames: string[],
  outputPath: string,
): Promise<void> => {
  const filePaths = fileNames.map((f) => runtime.path.join(stagingDir, f));

  await shellExec.exec`zip -j ${outputPath} ${filePaths}`.spawn();
};

/**
 * Checks whether a file exists at the given path.
 */
const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await runtime.fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Resolves --include flags for Go shared library and WASM files.
 *
 * Returns an array of `--include=<path>` strings for files that exist.
 * If a file doesn't exist, a warning is logged but compilation continues.
 */
const resolveGoIncludes = async (
  eserGoDistDir: string,
  target: string,
): Promise<string[]> => {
  const includes: string[] = [];
  const nativeTarget = ajanTargets.findByDenoTarget(target);

  // 1. Platform-specific shared library
  if (nativeTarget !== undefined) {
    const libPath = runtime.path.join(
      eserGoDistDir,
      nativeTarget.id,
      nativeTarget.libFile,
    );

    if (await fileExists(libPath)) {
      includes.push(`--include=${libPath}`);
      // deno-lint-ignore no-console
      console.log(`    + Including Go library: ${nativeTarget.libFile}`);
    } else {
      // deno-lint-ignore no-console
      console.warn(
        `    ~ Go library not found for ${target} (looked at ${libPath}), skipping FFI embed`,
      );
    }
  } else {
    // deno-lint-ignore no-console
    console.warn(
      `    ~ No Go target mapping for ${target}, skipping FFI embed`,
    );
  }

  // 2. WASM files (platform-independent fallback)
  for (const wt of ajanTargets.WASM_TARGETS) {
    const wasmPath = runtime.path.join(eserGoDistDir, wt.id, wt.outputFile);

    if (await fileExists(wasmPath)) {
      includes.push(`--include=${wasmPath}`);
      // deno-lint-ignore no-console
      console.log(`    + Including WASM fallback: ${wt.outputFile}`);
    }
  }

  return includes;
};

/**
 * Builds Go shared libraries by invoking the ajan build script.
 *
 * Called when --with-go is passed. Builds all native targets plus WASM.
 */
const buildGoLibraries = async (projectRoot: string): Promise<void> => {
  const buildScript = runtime.path.join(
    projectRoot,
    "pkg",
    "@eser",
    "ajan",
    "scripts",
    "build.ts",
  );

  // deno-lint-ignore no-console
  console.log("Building Go shared libraries (--with-go)...\n");

  await shellExec
    .exec`deno run --allow-all ${buildScript} --all`
    .spawn();

  // deno-lint-ignore no-console
  console.log("");
};

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  const pkgDir = runtime.path.dirname(scriptDir);
  const projectRoot = runtime.path.resolve(pkgDir, "../../..");
  const mainTsPath = runtime.path.join(pkgDir, "main.ts");
  const versionPath = runtime.path.join(projectRoot, "VERSION");
  const outputDir = runtime.path.join(projectRoot, "etc", "temp", "binaries");
  const eserGoDistDir = runtime.path.join(
    projectRoot,
    "pkg",
    "@eser",
    "ajan",
    "dist",
  );

  // Parse CLI flags
  const args = runtime.process.args;
  const withGo = args.includes("--with-go");

  // Step 1: Read version
  const version = (await runtime.fs.readTextFile(versionPath)).trim();
  // deno-lint-ignore no-console
  console.log(
    `Compiling eser v${version} for ${TARGETS.length} platforms...\n`,
  );

  // Step 2: Build Go shared libraries if requested
  if (withGo) {
    await buildGoLibraries(projectRoot);
  }

  // Step 3: Clean output directory
  try {
    await runtime.fs.remove(outputDir, { recursive: true });
  } catch {
    // Directory doesn't exist
  }
  await runtime.fs.mkdir(outputDir, { recursive: true });

  // Step 4: Compile for each target
  const results: {
    target: string;
    archiveName: string;
    archivePath: string;
  }[] = [];
  const failed: string[] = [];

  for (const target of TARGETS) {
    const isWindows = target.includes("windows");
    const binaryName = isWindows ? `eser.exe` : `eser`;

    // Use a per-target staging directory so the shared library can sit
    // alongside the binary inside the archive.
    const stagingDir = runtime.path.join(outputDir, `staging-${target}`);
    await runtime.fs.mkdir(stagingDir, { recursive: true });
    const binaryPath = runtime.path.join(stagingDir, binaryName);

    // deno-lint-ignore no-console
    console.log(`  Compiling for ${target}...`);

    try {
      // Resolve --include flags for Go shared lib + WASM
      const includeFlags = await resolveGoIncludes(eserGoDistDir, target);

      await shellExec
        .exec`deno compile --no-check --allow-all --target ${target} ${includeFlags} --output ${binaryPath} ${mainTsPath}`
        .stderr("inherit")
        .spawn();

      // Validate binary size
      const stat = await runtime.fs.stat(binaryPath);
      if (stat.size < MIN_BINARY_SIZE) {
        // deno-lint-ignore no-console
        console.error(
          `    ✗ Binary too small (${stat.size} bytes), likely corrupted`,
        );
        failed.push(target);
        continue;
      }

      // deno-lint-ignore no-console
      console.log(
        `    ✓ ${(stat.size / 1_000_000).toFixed(1)}MB`,
      );

      // Collect files to archive: binary + Go shared library (if present)
      const archiveFiles = [binaryName];
      const nativeTarget = ajanTargets.findByDenoTarget(target);

      if (nativeTarget !== undefined) {
        const libSrcPath = runtime.path.join(
          eserGoDistDir,
          nativeTarget.id,
          nativeTarget.libFile,
        );

        if (await fileExists(libSrcPath)) {
          // Copy the shared library into the staging dir for archiving
          const libDestPath = runtime.path.join(
            stagingDir,
            nativeTarget.libFile,
          );
          await runtime.fs.copyFile(libSrcPath, libDestPath);
          archiveFiles.push(nativeTarget.libFile);
        }
      }

      // Create archive
      const archiveBase = `eser-v${version}-${target}`;
      const archiveName = isWindows
        ? `${archiveBase}.zip`
        : `${archiveBase}.tar.gz`;
      const archivePath = runtime.path.join(outputDir, archiveName);

      if (isWindows) {
        await createZip(stagingDir, archiveFiles, archivePath);
      } else {
        await createTarGz(stagingDir, archiveFiles, archivePath);
      }

      results.push({ target, archiveName, archivePath });

      // Remove staging directory after archiving
      await runtime.fs.remove(stagingDir, { recursive: true });
    } catch (error) {
      // deno-lint-ignore no-console
      console.error(
        `    ✗ Failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      // Surface captured stderr so CI logs show the actual deno compile error
      if (
        error !== null && typeof error === "object" && "stderr" in error &&
        typeof (error as { stderr: unknown }).stderr === "string"
      ) {
        const stderr = (error as { stderr: string }).stderr.trim();
        if (stderr.length > 0) {
          // deno-lint-ignore no-console
          console.error(`    stderr:\n${stderr}`);
        }
      }

      failed.push(target);

      // Clean up staging directory
      try {
        await runtime.fs.remove(stagingDir, { recursive: true });
      } catch {
        // May not exist
      }
    }
  }

  // Step 5: Generate SHA256SUMS.txt
  // deno-lint-ignore no-console
  console.log("\nGenerating SHA256SUMS.txt...");
  const sha256Lines: string[] = [];

  for (const { archiveName, archivePath } of results) {
    const hash = await computeFileSha256(archivePath);
    sha256Lines.push(`${hash}  ${archiveName}`);
  }

  const sha256Path = runtime.path.join(outputDir, "SHA256SUMS.txt");
  await runtime.fs.writeTextFile(
    sha256Path,
    sha256Lines.join("\n") + "\n",
  );

  // Step 6: Summary
  // deno-lint-ignore no-console
  console.log(`\n${"─".repeat(50)}`);
  // deno-lint-ignore no-console
  console.log(
    `✓ ${results.length}/${TARGETS.length} targets compiled successfully`,
  );

  if (failed.length > 0) {
    // deno-lint-ignore no-console
    console.error(`✗ ${failed.length} targets failed: ${failed.join(", ")}`);
  }

  // deno-lint-ignore no-console
  console.log(`\nOutput: ${outputDir}`);
  for (const { archiveName } of results) {
    // deno-lint-ignore no-console
    console.log(`  ${archiveName}`);
  }
  // deno-lint-ignore no-console
  console.log(`  SHA256SUMS.txt`);

  // Exit with error if any target failed
  if (failed.length > 0) {
    runtime.process.setExitCode(1);
  }
};

main();
