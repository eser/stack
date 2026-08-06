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

import { runtime } from "@eserstack/standards/cross-runtime";
import * as shellExec from "@eserstack/shell/exec";
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
  // deno compile validates .wasm imports statically and chokes on
  // wasi_snapshot_preview1 (provided at runtime via our custom shim).
  // Workaround: copy .wasm → .wasm.bin so Deno treats it as opaque data,
  // then the resolver finds it at runtime.
  for (const wt of ajanTargets.WASM_TARGETS) {
    const wasmPath = runtime.path.join(eserGoDistDir, wt.id, wt.outputFile);

    if (await fileExists(wasmPath)) {
      // Copy to .wasm.bin to avoid Deno's static WASM import validation
      const binPath = `${wasmPath}.bin`;
      try {
        const bytes = await runtime.fs.readFile(wasmPath);
        await runtime.fs.writeFile(binPath, bytes);
        includes.push(`--include=${binPath}`);
        // deno-lint-ignore no-console
        console.log(`    + Including WASM fallback: ${wt.outputFile}.bin`);
      } catch {
        // deno-lint-ignore no-console
        console.warn(`    ~ Failed to copy WASM for embed: ${wt.outputFile}`);
      }
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

/**
 * On `deno compile --engine quickjs` — evaluated, not adopted.
 *
 * Deno 2.9 added an experimental QuickJS backend (denoland/deno#36194, merged
 * 2026-08-04). It is a large size win and it does NOT work for this CLI.
 *
 * Measured on pkg/@eserstack/noskills/bin-main.ts, same tree, same flags:
 *
 *     v8       268.0 MB   every command works
 *     quickjs  236.9 MB   only `--help` works
 *
 * Any command that dispatches through `Command.lazyCommand` dies with
 * "Top-level await promise never resolved" — the load promise never settles, so
 * the handler never runs. Since the whole command tree is lazily loaded, that is
 * every real command.
 *
 * What was ruled OUT, each verified in a compiled quickjs binary:
 *   - dynamic import in general, including nested inside awaited async
 *     functions, and of modules that themselves contain top-level await
 *   - the size of the imported graph: importing cli-system/mod.ts directly and
 *     constructing the command from it works fine
 *   - setTimeout, fetch, Deno.dlopen and a full FFI library load
 *   - @eserstack/streams output + close()
 *   - `async () => { await import() }` vs `() => import().then()` — both fail
 *     identically, so it is not the await shape
 *
 * What still works under quickjs: MODULE dispatch, i.e.
 * `modules: { x: { load: () => import(...) } }`. Only lazyCommand fails. That is
 * also the workaround, if the 31 MB ever becomes worth restructuring dispatch
 * for -- it is not today, next to the 278 MB that removing the Claude Agent SDK
 * took off every binary.
 *
 * Related upstream, same shape but not the same backend: bellard/quickjs#113
 * (import() promise callbacks never fire — QuickJS only supports synchronous
 * module loading) and denoland/deno#24069.
 *
 * Do not add --engine quickjs here without re-testing a lazily-dispatched
 * command end to end. `--help` passing proves nothing: it is the one path that
 * never triggers a lazy load.
 */

/**
 * Go executables released alongside the TypeScript ones.
 *
 * These are NOT deno-compiled. `noskills-server` is a long-running daemon, and
 * at ~11 MB of pure Go it is a fraction of a Deno runtime plus the shared
 * library — putting a server inside a JS runtime holding a C ABI open would be
 * the opposite of a diet. Go is the right tool here, and it stays Go.
 *
 * What it does NOT need is a second release pipeline. GoReleaser used to build
 * and publish these on a separate workflow with a separate trigger, which is why
 * every release carried either the `eser-*` family or the `noskills_*` family
 * and never both. Building them here puts every product of the family in one
 * version, one SHA256SUMS.txt, one release.
 *
 * All are CGO_ENABLED=0, so cross-compiling is just GOOS/GOARCH — no toolchain
 * per target, which is what made GoReleaser worth its complexity in the first
 * place.
 */
const GO_BINARIES: readonly { name: string; main: string }[] = [
  { name: "noskills-server", main: "./cmd/noskills-server" },
];

/**
 * The binaries compiled from this workspace.
 *
 * `eser` carries every module. The others are submodules of it, re-rooted and
 * shipped on their own so that someone who wants only that tool can install
 * only that tool -- `brew install noskills`, then `noskills next`. They are
 * ENTRY POINTS, not forks: each mounts the same module object `eser` mounts, so
 * `noskills next` and `eser noskills next` are one code path. Adding a binary
 * here must never mean adding an implementation.
 */
const BINARIES: readonly {
  name: string;
  entry: string;
  /**
   * Whether the archive carries the Go shared library.
   *
   * It is 34.7 MB and is copied per binary per platform, so shipping it with a
   * tool that never calls into it multiplies the download for nothing. `laroux`
   * touches no FFI; `noskills` does (ffi-client.ts, and the ai bridge behind
   * `noskills run`).
   */
  needsNativeLib: boolean;
}[] = [
  { name: "eser", entry: "pkg/@eserstack/cli/main.ts", needsNativeLib: true },
  {
    name: "noskills",
    entry: "pkg/@eserstack/noskills/bin-main.ts",
    needsNativeLib: true,
  },
  {
    name: "laroux",
    entry: "pkg/@eserstack/laroux-server/bin-main.ts",
    needsNativeLib: false,
  },
];

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  const pkgDir = runtime.path.dirname(scriptDir);
  const projectRoot = runtime.path.resolve(pkgDir, "../../..");
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
    `Compiling ${BINARIES.map((b) => b.name).join(", ")} v${version} ` +
      `for ${TARGETS.length} platforms...\n`,
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

  for (const binary of BINARIES) {
    const entryPath = runtime.path.join(projectRoot, binary.entry);

    for (const target of TARGETS) {
      const isWindows = target.includes("windows");
      const binaryName = isWindows ? `${binary.name}.exe` : binary.name;

      // Use a per-target staging directory so the shared library can sit
      // alongside the binary inside the archive.
      const stagingDir = runtime.path.join(
        outputDir,
        `staging-${binary.name}-${target}`,
      );
      await runtime.fs.mkdir(stagingDir, { recursive: true });
      const binaryPath = runtime.path.join(stagingDir, binaryName);

      // deno-lint-ignore no-console
      console.log(`  Compiling ${binary.name} for ${target}...`);

      try {
        // Resolve --include flags for Go shared lib + WASM
        const includeFlags = await resolveGoIncludes(eserGoDistDir, target);

        await shellExec
          // --node-modules-dir=none is not a micro-optimisation.
          //
          // Root deno.json sets nodeModulesDir "manual", and `deno compile`
          // otherwise walks and EMBEDS the entire resolved node_modules tree --
          // in a pnpm workspace that means every package's dependencies, 647 MB,
          // not just this entry point's. Measured: 916 CPU-seconds to compile
          // main.ts with the tree, 5.8 CPU-seconds without it. A one-line
          // console.log with zero imports still took 10m32s with the tree and
          // 0.475s without, which is what proves the cost is the walk and not our
          // code.
          //
          // It also closes a reliability hole: a 10-minute tree walk races
          // anything that touches the working copy, and compiles aborted with
          // "Opening <path>: No such file or directory" when a file moved
          // underneath it.
          //
          // The requirement this adds: npm packages must be in DENO_DIR at compile
          // time, so CI needs its Deno cache warm before this runs.
          .exec`deno compile --no-check --allow-all --node-modules-dir=none --target ${target} ${includeFlags} --output ${binaryPath} ${entryPath}`
          .stderr("inherit")
          .spawn();

        // Validate binary size
        const stat = await runtime.fs.stat(binaryPath);
        if (stat.size < MIN_BINARY_SIZE) {
          // deno-lint-ignore no-console
          console.error(
            `    ✗ Binary too small (${stat.size} bytes), likely corrupted`,
          );
          failed.push(`${binary.name}/${target}`);
          continue;
        }

        // deno-lint-ignore no-console
        console.log(
          `    ✓ ${(stat.size / 1_000_000).toFixed(1)}MB`,
        );

        // Collect files to archive: binary + Go shared library (if present)
        const archiveFiles = [binaryName];
        const nativeTarget = binary.needsNativeLib
          ? ajanTargets.findByDenoTarget(target)
          : undefined;

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
        const archiveBase = `${binary.name}-v${version}-${target}`;
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

        failed.push(`${binary.name}/${target}`);

        // Clean up staging directory
        try {
          await runtime.fs.remove(stagingDir, { recursive: true });
        } catch {
          // May not exist
        }
      }
    }
  }

  // Step 4b: Cross-compile the Go executables into the same output directory,
  // so they land in the same SHA256SUMS.txt and the same release.
  for (const goBinary of GO_BINARIES) {
    for (const target of TARGETS) {
      const nativeTarget = ajanTargets.findByDenoTarget(target);

      if (nativeTarget === undefined) {
        continue;
      }

      const isWindows = target.includes("windows");
      const binaryName = isWindows ? `${goBinary.name}.exe` : goBinary.name;
      const stagingDir = runtime.path.join(
        outputDir,
        `staging-${goBinary.name}-${target}`,
      );

      await runtime.fs.mkdir(stagingDir, { recursive: true });

      // deno-lint-ignore no-console
      console.log(`  Compiling ${goBinary.name} for ${target}...`);

      try {
        await shellExec
          .exec`go build -trimpath -ldflags ${
          "-s -w -X github.com/eser/stack/pkg/ajan/noskillsserverfx.Version=" +
          version
        } -o ${runtime.path.join(stagingDir, binaryName)} ${goBinary.main}`
          // The parent environment is spread in explicitly rather than relying
          // on the builder to merge. The two exec backends disagree: the Deno
          // path merges with the parent (Deno.Command's default), while the Go
          // bridge does `cmd.Env = opts.Env`, replacing it outright. Which one
          // runs depends on whether the native library loaded — so a build that
          // works locally could lose PATH, HOME and GOCACHE in CI and fail with
          // a baffling "go: not found".
          .env({
            ...runtime.env.toObject(),
            GOOS: nativeTarget.goos,
            GOARCH: nativeTarget.goarch,
            CGO_ENABLED: "0",
          })
          .stderr("inherit")
          .spawn();

        const archiveBase = `${goBinary.name}-v${version}-${target}`;
        const archiveName = isWindows
          ? `${archiveBase}.zip`
          : `${archiveBase}.tar.gz`;
        const archivePath = runtime.path.join(outputDir, archiveName);

        if (isWindows) {
          await createZip(stagingDir, [binaryName], archivePath);
        } else {
          await createTarGz(stagingDir, [binaryName], archivePath);
        }

        results.push({ target, archiveName, archivePath });
      } catch (error) {
        // deno-lint-ignore no-console
        console.error(`    ✗ ${goBinary.name}/${target}: ${error}`);
        failed.push(`${goBinary.name}/${target}`);
      }

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
    `✓ ${results.length}/${
      TARGETS.length * BINARIES.length
    } builds compiled successfully`,
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
