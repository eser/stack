// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Build progress and the summary table are this script's terminal output.
// deno-lint-ignore-file no-console

/**
 * Cross-compiles the eser-ajan C-shared library and WASM modules.
 *
 * This script:
 * 1. Detects the current platform or accepts --target / --all / --wasm flags
 * 2. Runs `go build -buildmode=c-shared` for native targets
 * 3. Runs `go build` with GOOS=wasip1/GOARCH=wasm for WASM targets
 * 4. Validates each output file exists and is > 1KB
 * 5. Prints a summary table
 *
 * Pipeline:
 *   targets ──▶ go build (×N) ──▶ validate ──▶ summary
 *
 * Usage:
 *   deno run --allow-all ./build.ts              # build for current platform
 *   deno run --allow-all ./build.ts --target=x86_64-darwin
 *   deno run --allow-all ./build.ts --all        # build all targets (native + WASM)
 *   deno run --allow-all ./build.ts --wasm       # build only WASM targets
 *   deno run --allow-all ./build.ts --clean      # remove dist/
 *
 * Note: Cross-compilation requires the appropriate C cross-compilers to be
 * installed (e.g., x86_64-linux-gnu-gcc, aarch64-linux-gnu-gcc,
 * x86_64-w64-mingw32-gcc, aarch64-w64-mingw32-gcc).
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as targets from "../targets.ts";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

/** Internal build target — derived from the shared targets module. */
interface BuildTarget {
  id: string;
  goos: string;
  goarch: string;
  outputFile: string;
  cc?: string;
  buildMode: "c-shared" | "wasm";
  tags?: string;
}

/** Convert shared NativeTarget → BuildTarget. */
const nativeToBuild = (t: targets.NativeTarget): BuildTarget => ({
  id: t.id,
  goos: t.goos,
  goarch: t.goarch,
  outputFile: t.libFile,
  cc: t.cc,
  buildMode: "c-shared",
});

/** Convert shared WasmTarget → BuildTarget. */
const wasmToBuild = (t: targets.WasmTarget): BuildTarget => ({
  id: t.id,
  goos: t.goos,
  goarch: t.goarch,
  outputFile: t.outputFile,
  buildMode: "wasm",
  tags: t.tags,
});

const NATIVE_TARGETS: readonly BuildTarget[] = targets.NATIVE_TARGETS.map(
  nativeToBuild,
);

const WASM_TARGETS: readonly BuildTarget[] = targets.WASM_TARGETS.map(
  wasmToBuild,
);

const ALL_TARGETS: readonly BuildTarget[] = [
  ...NATIVE_TARGETS,
  ...WASM_TARGETS,
];

const MIN_OUTPUT_SIZE = 1_024; // 1KB — output files should be much larger

/** Upper bound for one `go build`, so a stuck toolchain cannot hang the build. */
const GO_BUILD_TIMEOUT_MINUTES = 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const goosFromDeno = (): string => {
  const os = Deno.build.os;
  if (os === "darwin") return "darwin";
  if (os === "windows") return "windows";
  return "linux";
};

const goarchFromDeno = (): string => {
  const arch = Deno.build.arch;
  if (arch === "aarch64") return "arm64";
  return "amd64";
};

const detectCurrentTarget = (): BuildTarget | undefined => {
  const goos = goosFromDeno();
  const goarch = goarchFromDeno();

  return NATIVE_TARGETS.find((t) => t.goos === goos && t.goarch === goarch);
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
};

// ---------------------------------------------------------------------------
// Build logic
// ---------------------------------------------------------------------------

interface BuildResult {
  target: string;
  status: "ok" | "fail";
  fileSize?: number;
  error?: string;
}

/**
 * Reads the monorepo VERSION file for the -ldflags version stamp, or "dev" when
 * the package is built outside the monorepo and the file does not exist.
 */
const readVersion = async (pkgDir: string): Promise<string> => {
  const versionPath = `${pkgDir}/../../../VERSION`;
  if (!await runtime.fs.exists(versionPath)) {
    return "dev";
  }

  return (await runtime.fs.readTextFile(versionPath)).trim();
};

const buildTarget = async (
  target: BuildTarget,
  pkgDir: string,
  distDir: string,
  version: string,
): Promise<BuildResult> => {
  const targetDir = `${distDir}/${target.id}`;
  await runtime.fs.mkdir(targetDir, { recursive: true });

  const outputPath = `${targetDir}/${target.outputFile}`;

  const env: Record<string, string> = {
    GOOS: target.goos,
    GOARCH: target.goarch,
    // Belt-and-braces: there is deliberately no go.work in this repo (see
    // .eser/manifest.yml), but if anyone adds one, shipped artifacts must still
    // resolve from this module's own go.mod alone rather than a merged
    // workspace graph.
    GOWORK: "off",
  };

  // -s -w strips the symbol table and DWARF debug info: 40.9 MB -> 34.7 MB
  // measured on darwin/arm64, and this library is copied into every release
  // archive, so it is paid per binary per platform. Nothing needs the symbols --
  // the library is loaded through a C ABI by FFI, and a Go panic still prints
  // its stack because that is built from runtime tables, not DWARF.
  const buildArgs: string[] = [
    "build",
    `-ldflags=-s -w -X main.Version=${version}`,
  ];

  if (target.buildMode === "c-shared") {
    env["CGO_ENABLED"] = "1";

    // Determine if this is the native platform — skip CC override if so
    const isNative = target.goos === goosFromDeno() &&
      target.goarch === goarchFromDeno();

    if (!isNative && target.cc !== undefined) {
      env["CC"] = target.cc;
    }

    buildArgs.push("-buildmode=c-shared");
  } else {
    // WASM builds: no cgo
    env["CGO_ENABLED"] = "0";
  }

  if (target.tags !== undefined) {
    buildArgs.push(`-tags=${target.tags}`);
  }

  buildArgs.push("-o", outputPath, ".");

  console.log(`  Building ${target.id} ...`);

  const timeout = AbortSignal.timeout(GO_BUILD_TIMEOUT_MINUTES * 60_000);
  const { code, stderr } = await runtime.exec.spawn("go", buildArgs, {
    cwd: pkgDir,
    env,
    stdout: "piped",
    stderr: "piped",
    signal: timeout,
  });

  if (code !== 0) {
    const errText = timeout.aborted
      ? `go build ran past ${GO_BUILD_TIMEOUT_MINUTES} minutes and was stopped`
      : new TextDecoder().decode(stderr).trim();
    console.error(`    FAIL: ${errText}`);
    return { target: target.id, status: "fail", error: errText };
  }

  // Validate output
  try {
    const stat = await runtime.fs.stat(outputPath);
    if (stat.size < MIN_OUTPUT_SIZE) {
      const msg = `Output too small (${stat.size} bytes), likely corrupted`;
      console.error(`    FAIL: ${msg}`);
      return { target: target.id, status: "fail", error: msg };
    }

    console.log(`    OK  ${formatBytes(stat.size)}`);
    return { target: target.id, status: "ok", fileSize: stat.size };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`    FAIL: ${msg}`);
    return { target: target.id, status: "fail", error: msg };
  }
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const printUsage = (): void => {
  console.log(`Usage: deno run --allow-all build.ts [options]

Options:
  --all              Build all targets (native + WASM)
  --wasm             Build only WASM targets
  --target=<name>    Build a single target (e.g. x86_64-linux, wasi)
  --clean            Remove the dist/ directory
  --help             Show this help

Available targets:
${ALL_TARGETS.map((t) => `  ${t.id}`).join("\n")}

When no flag is given, builds for the current platform only (native).`);
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

  const args = runtime.process.args as string[];

  // --help
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  // --clean
  if (args.includes("--clean")) {
    if (!await runtime.fs.exists(distDir)) {
      console.log("dist/ does not exist — nothing to clean.");
      return;
    }

    console.log("Removing dist/ ...");
    await runtime.fs.remove(distDir, { recursive: true });
    console.log("Done.");
    return;
  }

  // Determine which targets to build
  let selectedTargets: BuildTarget[];

  if (args.includes("--all")) {
    selectedTargets = [...ALL_TARGETS];
  } else if (args.includes("--wasm")) {
    selectedTargets = [...WASM_TARGETS];
  } else {
    const targetArg = args.find((a) => a.startsWith("--target="));
    if (targetArg !== undefined) {
      const name = targetArg.split("=")[1];
      const found = ALL_TARGETS.find((t) => t.id === name);
      if (found === undefined) {
        console.error(`Unknown target: ${name}`);
        console.error(
          `Available: ${ALL_TARGETS.map((t) => t.id).join(", ")}`,
        );
        Deno.exitCode = 1;
        return;
      }
      selectedTargets = [found];
    } else {
      // Auto-detect current platform (native only)
      const current = detectCurrentTarget();
      if (current === undefined) {
        console.error(
          `Could not detect current platform (${Deno.build.os}/${Deno.build.arch})`,
        );
        Deno.exitCode = 1;
        return;
      }
      selectedTargets = [current];
    }
  }

  const hasNative = selectedTargets.some((t) => t.buildMode === "c-shared");
  const hasWasm = selectedTargets.some((t) => t.buildMode === "wasm");
  const modeLabel = hasNative && hasWasm
    ? "native + WASM"
    : hasWasm
    ? "WASM"
    : "native";

  console.log(
    `Building eser-ajan ${modeLabel} for ${selectedTargets.length} target(s)...\n`,
  );

  const version = await readVersion(pkgDir);

  // Build each target
  const results: BuildResult[] = [];

  for (const target of selectedTargets) {
    // One go build at a time: each one already uses every core, and the
    // progress lines of parallel builds would interleave.
    // deno-lint-ignore no-await-in-loop
    const result = await buildTarget(target, pkgDir, distDir, version);
    results.push(result);
  }

  // Summary table
  console.log(`\n${"─".repeat(58)}`);
  console.log(
    `${"Target".padEnd(22)} ${"Size".padEnd(12)} ${"Status"}`,
  );
  console.log(`${"─".repeat(58)}`);

  for (const r of results) {
    const size = r.fileSize !== undefined ? formatBytes(r.fileSize) : "-";
    const status = r.status === "ok" ? "OK" : `FAIL: ${r.error ?? "unknown"}`;
    console.log(
      `${r.target.padEnd(22)} ${size.padEnd(12)} ${status}`,
    );
  }

  console.log(`${"─".repeat(58)}`);

  const ok = results.filter((r) => r.status === "ok").length;
  const fail = results.filter((r) => r.status === "fail").length;

  console.log(`\n${ok}/${results.length} succeeded, ${fail} failed`);
  console.log(`Output: ${distDir}`);

  if (fail > 0) {
    Deno.exitCode = 1;
  }
};

if (import.meta.main) {
  // A script entry point: the process has nothing else to do until main ends.
  // deno-lint-ignore no-top-level-await
  await main();
}
