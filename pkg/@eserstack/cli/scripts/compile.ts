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
 *   deno run --allow-all ./compile.ts --current-only   # host platform only (preflight)
 *
 * @module
 */

// Build script: the progress lines and the summary it prints are the build log
// that CI shows.
// deno-lint-ignore-file no-console

import { runtime } from "@eserstack/standards/cross-runtime";
import * as shellExec from "@eserstack/shell/exec";
import * as ajanTargets from "../../ajan/targets.ts";

/** Deno compile target triples — derived from canonical targets. */
const TARGETS = ajanTargets.NATIVE_TARGETS.map((t) => t.denoTarget);

const MIN_BINARY_SIZE = 1_000_000; // 1MB — Deno binaries are 80-130MB

/** Read size of the streaming hash: memory stays at one chunk per archive. */
const HASH_CHUNK_BYTES = 65_536;

/** A finished release archive. */
type Archive = {
  readonly target: string;
  readonly archiveName: string;
  readonly archivePath: string;
};

/** Paths and the version shared by every build in one run. */
type BuildContext = {
  readonly version: string;
  readonly projectRoot: string;
  readonly outputDir: string;
  readonly eserGoDistDir: string;
};

/** A TypeScript entry point compiled with `deno compile`. */
type DenoBinary = {
  readonly name: string;
  readonly entry: string;
  /**
   * Whether the archive carries the Go shared library.
   *
   * It is 34.7 MB and is copied per binary per platform, so shipping it with a
   * tool that never calls into it multiplies the download for nothing. `laroux`
   * touches no FFI; `noskills` does (ffi-client.ts, and the ai bridge behind
   * `noskills run`).
   */
  readonly needsNativeLib: boolean;
};

/** A Go executable cross-compiled with `go build`. */
type GoBinary = {
  readonly name: string;
  readonly main: string;
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Computes the SHA-256 of a file by streaming it in 64KB chunks, so peak memory
 * stays at one chunk whatever the archive size.
 */
const computeFileSha256 = async (filePath: string): Promise<string> => {
  const [nodeCrypto, nodeFs] = await Promise.all([
    import("node:crypto"),
    import("node:fs"),
  ]);

  const hash = nodeCrypto.createHash("sha256");
  const stream = nodeFs.createReadStream(filePath, {
    highWaterMark: HASH_CHUNK_BYTES,
  });

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest("hex");
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
 * Archives the staged files: .zip for Windows targets, .tar.gz for the rest.
 */
const createArchive = async (
  isWindows: boolean,
  stagingDir: string,
  fileNames: string[],
  outputPath: string,
): Promise<void> => {
  if (isWindows) {
    await createZip(stagingDir, fileNames, outputPath);
    return;
  }

  await createTarGz(stagingDir, fileNames, outputPath);
};

/**
 * Removes a staging directory. Cleanup is best effort: a leftover staging
 * directory does not change the archives, so a failure here must not fail the
 * build.
 */
const removeStagingDir = async (stagingDir: string): Promise<void> => {
  try {
    await runtime.fs.remove(stagingDir, { recursive: true });
  } catch {
    // Already gone, or not removable; either way the archives are complete.
  }
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
 * Copies one WASM build to `<file>.wasm.bin` and returns its `--include` flag,
 * or null when the WASM build is absent or cannot be copied.
 *
 * deno compile validates .wasm imports statically and chokes on
 * wasi_snapshot_preview1 (provided at runtime via our custom shim). Copying
 * .wasm to .wasm.bin makes Deno treat it as opaque data, and the resolver finds
 * it at runtime.
 */
const includeWasmFallback = async (
  eserGoDistDir: string,
  wasmTarget: ajanTargets.WasmTarget,
): Promise<string | null> => {
  const wasmPath = runtime.path.join(
    eserGoDistDir,
    wasmTarget.id,
    wasmTarget.outputFile,
  );

  if (!(await fileExists(wasmPath))) {
    return null;
  }

  const binPath = `${wasmPath}.bin`;

  try {
    await runtime.fs.copyFile(wasmPath, binPath);
  } catch (error) {
    console.warn(
      `    ~ Failed to copy WASM for embed: ${wasmTarget.outputFile} (${
        describeError(error)
      })`,
    );
    return null;
  }

  console.log(`    + Including WASM fallback: ${wasmTarget.outputFile}.bin`);
  return `--include=${binPath}`;
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
      console.log(`    + Including Go library: ${nativeTarget.libFile}`);
    } else {
      console.warn(
        `    ~ Go library not found for ${target} (looked at ${libPath}), skipping FFI embed`,
      );
    }
  } else {
    console.warn(
      `    ~ No Go target mapping for ${target}, skipping FFI embed`,
    );
  }

  // 2. WASM files (platform-independent fallback). Each WASM target is its own
  // file, so the copies run concurrently; Promise.all keeps the flag order.
  const wasmIncludes = await Promise.all(
    ajanTargets.WASM_TARGETS.map((wasmTarget) =>
      includeWasmFallback(eserGoDistDir, wasmTarget)
    ),
  );

  for (const include of wasmIncludes) {
    if (include !== null) {
      includes.push(include);
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
    "@eserstack",
    "ajan",
    "scripts",
    "build.ts",
  );

  console.log("Building Go shared libraries (--with-go)...\n");

  await shellExec
    .exec`deno run --allow-all ${buildScript} --all`
    .spawn();

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
 * for -- it is not today, next to the 278 MB that dropping one oversized
 * dependency took off every binary.
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
const GO_BINARIES: readonly GoBinary[] = [
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
const BINARIES: readonly DenoBinary[] = [
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

/**
 * Compiles one TypeScript binary for one target and archives it, with the Go
 * shared library when the binary needs it. Returns null when the build fails;
 * the failure is already printed.
 */
const compileDenoBinary = async (
  binary: DenoBinary,
  target: string,
  context: BuildContext,
): Promise<Archive | null> => {
  const { version, outputDir, eserGoDistDir } = context;
  const entryPath = runtime.path.join(context.projectRoot, binary.entry);
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
      console.error(
        `    ✗ Binary too small (${stat.size} bytes), likely corrupted`,
      );
      return null;
    }

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

    await createArchive(isWindows, stagingDir, archiveFiles, archivePath);

    return { target, archiveName, archivePath };
  } catch (error) {
    console.error(`    ✗ Failed: ${describeError(error)}`);

    // Surface captured stderr so CI logs show the actual deno compile error
    if (
      error !== null && typeof error === "object" && "stderr" in error &&
      typeof (error as { stderr: unknown }).stderr === "string"
    ) {
      const stderr = (error as { stderr: string }).stderr.trim();
      if (stderr.length > 0) {
        console.error(`    stderr:\n${stderr}`);
      }
    }

    return null;
  } finally {
    await removeStagingDir(stagingDir);
  }
};

/**
 * Cross-compiles one Go executable for one target and archives it. Returns
 * null when the build fails; the failure is already printed.
 */
const compileGoBinary = async (
  goBinary: GoBinary,
  nativeTarget: ajanTargets.NativeTarget,
  context: BuildContext,
): Promise<Archive | null> => {
  const { version, outputDir } = context;
  const target = nativeTarget.denoTarget;
  const isWindows = target.includes("windows");
  const binaryName = isWindows ? `${goBinary.name}.exe` : goBinary.name;
  const stagingDir = runtime.path.join(
    outputDir,
    `staging-${goBinary.name}-${target}`,
  );

  await runtime.fs.mkdir(stagingDir, { recursive: true });

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
      // runs depends on whether the native library loaded, so a build that
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

    await createArchive(isWindows, stagingDir, [binaryName], archivePath);

    return { target, archiveName, archivePath };
  } catch (error) {
    console.error(`    ✗ ${goBinary.name}/${target}: ${describeError(error)}`);
    return null;
  } finally {
    await removeStagingDir(stagingDir);
  }
};

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
    "@eserstack",
    "ajan",
    "dist",
  );

  // Parse CLI flags
  const args = runtime.process.args;
  const withGo = args.includes("--with-go");

  // --current-only: the release preflight compiles for the host platform
  // alone. It is the same `deno compile` invocation the release run makes for
  // all five targets, so it catches what only that invocation can — a
  // dependency Deno refuses to embed, an npm package missing from DENO_DIR, a
  // broken --include — without the five-way cost on every push to main.
  const currentOnly = args.includes("--current-only");
  const targets = currentOnly
    ? TARGETS.filter((t) => t === Deno.build.target)
    : TARGETS;

  if (targets.length === 0) {
    throw new Error(
      `--current-only: no release target matches this host (${Deno.build.target})`,
    );
  }

  // Step 1: Read version
  const version = (await runtime.fs.readTextFile(versionPath)).trim();
  console.log(
    `Compiling ${BINARIES.map((b) => b.name).join(", ")} v${version} ` +
      `for ${targets.length} platform${targets.length === 1 ? "" : "s"}...\n`,
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

  const context: BuildContext = {
    version,
    projectRoot,
    outputDir,
    eserGoDistDir,
  };

  // Step 4: Compile for each target
  const archives: Archive[] = [];
  const failed: string[] = [];

  for (const binary of BINARIES) {
    for (const target of targets) {
      // One `deno compile` at a time: each run takes several cores and
      // gigabytes of memory, and every run rewrites the same .wasm.bin copies
      // in the shared dist directory.
      // deno-lint-ignore no-await-in-loop
      const archive = await compileDenoBinary(binary, target, context);

      if (archive === null) {
        failed.push(`${binary.name}/${target}`);
      } else {
        archives.push(archive);
      }
    }
  }

  // Step 4b: Cross-compile the Go executables into the same output directory,
  // so they land in the same SHA256SUMS.txt and the same release.
  for (const goBinary of GO_BINARIES) {
    for (const target of targets) {
      const nativeTarget = ajanTargets.findByDenoTarget(target);

      if (nativeTarget === undefined) {
        continue;
      }

      // One `go build` at a time: each build already uses every core, and
      // running them in turn keeps each target's log lines together.
      // deno-lint-ignore no-await-in-loop
      const archive = await compileGoBinary(goBinary, nativeTarget, context);

      if (archive === null) {
        failed.push(`${goBinary.name}/${target}`);
      } else {
        archives.push(archive);
      }
    }
  }

  // Step 5: Generate SHA256SUMS.txt. Each hash streams its own file, so they
  // run concurrently; Promise.all keeps the lines in build order.
  console.log("\nGenerating SHA256SUMS.txt...");
  const sha256Lines = await Promise.all(
    archives.map(async ({ archiveName, archivePath }) =>
      `${await computeFileSha256(archivePath)}  ${archiveName}`
    ),
  );

  const sha256Path = runtime.path.join(outputDir, "SHA256SUMS.txt");
  await runtime.fs.writeTextFile(
    sha256Path,
    sha256Lines.join("\n") + "\n",
  );

  // Step 6: Summary
  const attempted = targets.length * (BINARIES.length + GO_BINARIES.length);
  console.log(`\n${"─".repeat(50)}`);
  console.log(
    `✓ ${archives.length}/${attempted} builds compiled successfully`,
  );

  if (failed.length > 0) {
    console.error(`✗ ${failed.length} targets failed: ${failed.join(", ")}`);
  }

  console.log(`\nOutput: ${outputDir}`);
  for (const { archiveName } of archives) {
    console.log(`  ${archiveName}`);
  }
  console.log(`  SHA256SUMS.txt`);

  // Exit with error if any target failed
  if (failed.length > 0) {
    runtime.process.setExitCode(1);
  }
};

if (import.meta.main) {
  // Script entry point: the await runs only when this file is the program,
  // never on import.
  // deno-lint-ignore no-top-level-await
  await main();
}
