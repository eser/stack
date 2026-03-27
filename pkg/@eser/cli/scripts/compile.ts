// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Compiles the CLI into standalone binaries for multiple platforms.
 *
 * This script:
 * 1. Reads the VERSION file
 * 2. Runs `deno compile` for each target platform
 * 3. Validates each binary is not corrupted (>1MB)
 * 4. Creates compressed archives (.tar.gz / .zip)
 * 5. Generates SHA256SUMS.txt with streaming hash computation
 *
 * Pipeline:
 *   VERSION ──▶ deno compile (×5) ──▶ validate ──▶ archive ──▶ SHA256SUMS.txt
 *
 * Usage: deno run --allow-all ./compile.ts
 *
 * @module
 */

import { runtime } from "@eser/standards/cross-runtime";
import * as shellExec from "@eser/shell/exec";

const TARGETS = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
] as const;

const MIN_BINARY_SIZE = 1_000_000; // 1MB — Deno binaries are 80-130MB

/**
 * Computes SHA256 hash of a file using streaming (64KB chunks, <1MB peak memory).
 */
const computeFileSha256 = async (filePath: string): Promise<string> => {
  const file = await Deno.open(filePath, { read: true });

  try {
    const chunks: Uint8Array[] = [];
    const buffer = new Uint8Array(65_536); // 64KB chunks

    while (true) {
      const bytesRead = await file.read(buffer);
      if (bytesRead === null) {
        break;
      }
      chunks.push(buffer.slice(0, bytesRead));
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
  } finally {
    file.close();
  }
};

/**
 * Creates a .tar.gz archive containing a single binary file.
 */
const createTarGz = async (
  binaryPath: string,
  binaryName: string,
  outputPath: string,
): Promise<void> => {
  const dir = runtime.path.dirname(binaryPath);

  await shellExec.exec`tar -czf ${outputPath} -C ${dir} ${binaryName}`.spawn();
};

/**
 * Creates a .zip archive containing a single binary file.
 */
const createZip = async (
  binaryPath: string,
  binaryName: string,
  outputPath: string,
): Promise<void> => {
  const dir = runtime.path.dirname(binaryPath);

  await shellExec.exec`zip -j ${outputPath} ${
    runtime.path.join(dir, binaryName)
  }`
    .spawn();
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

  // Step 1: Read version
  const version = (await runtime.fs.readTextFile(versionPath)).trim();
  // deno-lint-ignore no-console
  console.log(
    `Compiling eser v${version} for ${TARGETS.length} platforms...\n`,
  );

  // Step 2: Clean output directory
  try {
    await runtime.fs.remove(outputDir, { recursive: true });
  } catch {
    // Directory doesn't exist
  }
  await runtime.fs.mkdir(outputDir, { recursive: true });

  // Step 3: Compile for each target
  const results: {
    target: string;
    archiveName: string;
    archivePath: string;
  }[] = [];
  const failed: string[] = [];

  for (const target of TARGETS) {
    const isWindows = target.includes("windows");
    const binaryName = isWindows ? `eser.exe` : `eser`;
    const binaryPath = runtime.path.join(outputDir, binaryName);

    // deno-lint-ignore no-console
    console.log(`  Compiling for ${target}...`);

    try {
      await shellExec
        .exec`deno compile --allow-all --target ${target} --output ${binaryPath} ${mainTsPath}`
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

      // Create archive
      const archiveBase = `eser-v${version}-${target}`;
      const archiveName = isWindows
        ? `${archiveBase}.zip`
        : `${archiveBase}.tar.gz`;
      const archivePath = runtime.path.join(outputDir, archiveName);

      if (isWindows) {
        await createZip(binaryPath, binaryName, archivePath);
      } else {
        await createTarGz(binaryPath, binaryName, archivePath);
      }

      results.push({ target, archiveName, archivePath });

      // Remove raw binary after archiving
      await runtime.fs.remove(binaryPath);
    } catch (error) {
      // deno-lint-ignore no-console
      console.error(
        `    ✗ Failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      failed.push(target);

      // Clean up partial binary
      try {
        await runtime.fs.remove(binaryPath);
      } catch {
        // May not exist
      }
    }
  }

  // Step 4: Generate SHA256SUMS.txt
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

  // Step 5: Summary
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
