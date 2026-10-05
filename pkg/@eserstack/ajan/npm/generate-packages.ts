// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// The staging report is this script's terminal output.
// deno-lint-ignore-file no-console

/**
 * Stages built shared libraries into the platform workspace packages.
 *
 * The six `@eserstack/ajan-*` packages are workspace members under
 * `pkg/@eserstack/` with committed manifests; their only payload is a build
 * output. This script copies each target's library (and the C header) from
 * `dist/<target>/` into the matching member, which is what `pnpm install`
 * links for the current platform and what the release pipeline publishes.
 *
 * Nothing here writes a package.json: the manifests are committed and their
 * version is stamped by `eser codebase versions` like every other workspace
 * package. Before TASK-8 this script generated throwaway packages under
 * `dist/npm/` with a version of their own, and the dependents pinned them
 * through a range — two mechanisms for one invariant (the library must come
 * from the same commit as the TypeScript that loads it) that broke on
 * 2026-09-17 when a stale registry cache served an older library.
 *
 * Prerequisites: run `scripts/build.ts` first so that `dist/` holds the
 * libraries for the targets you want staged.
 *
 * ## What is deliberately NOT here: Go executables
 *
 * These packages carry the shared LIBRARY only. The `noskills-server` and
 * `noskills` executables are distributed through GitHub releases, not npm.
 *
 * Usage:
 *   deno run --allow-all npm/generate-packages.ts          # stage every built target
 *   deno run --allow-all npm/generate-packages.ts --clean   # remove staged binaries
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as targets from "../targets.ts";

const HEADER_FILE = "libeser_ajan.h";

const removeIfExists = async (path: string): Promise<void> => {
  if (await runtime.fs.exists(path)) {
    await runtime.fs.remove(path);
  }
};

type StageResult = {
  member: string;
  status: "ok" | "skip";
  reason?: string;
};

/** Workspace directory of the platform package for a suffix. */
const memberDir = (workspaceDir: string, suffix: string): string =>
  `${workspaceDir}/${targets.NPM_PKG_PREFIX}-${suffix}`;

const requireMember = async (dir: string): Promise<void> => {
  if (!await runtime.fs.exists(`${dir}/package.json`)) {
    throw new Error(
      `${dir}/package.json is missing — the platform packages are committed workspace members, not generated.`,
    );
  }
};

const stageNative = async (
  target: targets.NativeTarget,
  distDir: string,
  workspaceDir: string,
): Promise<StageResult> => {
  const member = `${targets.NPM_PKG_PREFIX}-${target.npmSuffix}`;
  const buildDir = `${distDir}/${target.id}`;
  const libPath = `${buildDir}/${target.libFile}`;

  if (!await runtime.fs.exists(libPath)) {
    return { member, status: "skip", reason: `No build output: ${libPath}` };
  }

  const outDir = memberDir(workspaceDir, target.npmSuffix);
  await requireMember(outDir);
  await runtime.fs.copyFile(libPath, `${outDir}/${target.libFile}`);

  const headerPath = `${buildDir}/${HEADER_FILE}`;
  if (await runtime.fs.exists(headerPath)) {
    await runtime.fs.copyFile(headerPath, `${outDir}/${HEADER_FILE}`);
  }

  return { member, status: "ok" };
};

const stageWasm = async (
  distDir: string,
  workspaceDir: string,
): Promise<StageResult> => {
  const member = `${targets.NPM_PKG_PREFIX}-${targets.NPM_WASM_SUFFIX}`;
  const outDir = memberDir(workspaceDir, targets.NPM_WASM_SUFFIX);
  await requireMember(outDir);

  // Each module is a separate file with its own destination, so the copies
  // run concurrently.
  const copied = await Promise.all(
    targets.WASM_TARGETS.map(async (wt) => {
      const srcPath = `${distDir}/${wt.id}/${wt.outputFile}`;
      if (!await runtime.fs.exists(srcPath)) {
        return false;
      }

      await runtime.fs.copyFile(srcPath, `${outDir}/${wt.outputFile}`);
      return true;
    }),
  );

  if (!copied.includes(true)) {
    return {
      member,
      status: "skip",
      reason: "No WASM build output found in dist/wasi/ or dist/wasi-reactor/",
    };
  }

  return { member, status: "ok" };
};

const clean = async (workspaceDir: string): Promise<void> => {
  const wasmDir = memberDir(workspaceDir, targets.NPM_WASM_SUFFIX);
  const stagedFiles = [
    ...targets.NATIVE_TARGETS.flatMap((t) => {
      const dir = memberDir(workspaceDir, t.npmSuffix);
      return [`${dir}/${t.libFile}`, `${dir}/${HEADER_FILE}`];
    }),
    ...targets.WASM_TARGETS.map((wt) => `${wasmDir}/${wt.outputFile}`),
  ];

  // Every path is a different file, so the removals run concurrently.
  await Promise.all(stagedFiles.map(removeIfExists));
};

const main = async (): Promise<void> => {
  const scriptDir = import.meta.dirname;
  if (scriptDir === undefined) {
    throw new Error("Cannot determine script directory");
  }

  const pkgDir = scriptDir.replace(/[/\\]npm$/, "");
  const distDir = `${pkgDir}/dist`;
  const workspaceDir = pkgDir.replace(/[/\\]ajan$/, "");

  const args = runtime.process.args as string[];

  if (args.includes("--clean")) {
    console.log("Removing staged platform binaries...");
    await clean(workspaceDir);
    console.log("Done.");
    return;
  }

  // Each target copies into its own member directory, so the targets stage
  // concurrently; Promise.all keeps the results in target order for the report.
  const results: StageResult[] = await Promise.all([
    ...targets.NATIVE_TARGETS.map((target) =>
      stageNative(target, distDir, workspaceDir)
    ),
    stageWasm(distDir, workspaceDir),
  ]);

  for (const r of results) {
    console.log(
      r.status === "ok"
        ? `  ✓ ${r.member}`
        : `  - ${r.member} (skipped: ${r.reason})`,
    );
  }

  const staged = results.filter((r) => r.status === "ok").length;
  console.log(
    `\nStaged ${staged}/${results.length} platform packages into ${workspaceDir}`,
  );

  if (staged === 0) {
    throw new Error(
      "No platform package was staged — run scripts/build.ts first.",
    );
  }
};

if (import.meta.main) {
  // A script entry point: the process has nothing else to do until main ends.
  // deno-lint-ignore no-top-level-await
  await main();
}
