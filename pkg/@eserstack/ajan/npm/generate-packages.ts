// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

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

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await runtime.fs.stat(path);
    return true;
  } catch {
    return false;
  }
};

const removeIfExists = async (path: string): Promise<void> => {
  try {
    await runtime.fs.remove(path);
  } catch {
    // not there
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
  if (!await fileExists(`${dir}/package.json`)) {
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

  if (!await fileExists(libPath)) {
    return { member, status: "skip", reason: `No build output: ${libPath}` };
  }

  const outDir = memberDir(workspaceDir, target.npmSuffix);
  await requireMember(outDir);
  await runtime.fs.copyFile(libPath, `${outDir}/${target.libFile}`);

  const headerPath = `${buildDir}/${HEADER_FILE}`;
  if (await fileExists(headerPath)) {
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

  let copied = 0;
  for (const wt of targets.WASM_TARGETS) {
    const srcPath = `${distDir}/${wt.id}/${wt.outputFile}`;
    if (await fileExists(srcPath)) {
      await runtime.fs.copyFile(srcPath, `${outDir}/${wt.outputFile}`);
      copied++;
    }
  }

  if (copied === 0) {
    return {
      member,
      status: "skip",
      reason: "No WASM build output found in dist/wasi/ or dist/wasi-reactor/",
    };
  }

  return { member, status: "ok" };
};

const clean = async (workspaceDir: string): Promise<void> => {
  for (const t of targets.NATIVE_TARGETS) {
    const dir = memberDir(workspaceDir, t.npmSuffix);
    await removeIfExists(`${dir}/${t.libFile}`);
    await removeIfExists(`${dir}/${HEADER_FILE}`);
  }

  const wasmDir = memberDir(workspaceDir, targets.NPM_WASM_SUFFIX);
  for (const wt of targets.WASM_TARGETS) {
    await removeIfExists(`${wasmDir}/${wt.outputFile}`);
  }
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
    // deno-lint-ignore no-console
    console.log("Removing staged platform binaries...");
    await clean(workspaceDir);
    // deno-lint-ignore no-console
    console.log("Done.");
    return;
  }

  const results: StageResult[] = [];
  for (const target of targets.NATIVE_TARGETS) {
    results.push(await stageNative(target, distDir, workspaceDir));
  }
  results.push(await stageWasm(distDir, workspaceDir));

  for (const r of results) {
    // deno-lint-ignore no-console
    console.log(
      r.status === "ok"
        ? `  ✓ ${r.member}`
        : `  - ${r.member} (skipped: ${r.reason})`,
    );
  }

  const staged = results.filter((r) => r.status === "ok").length;
  // deno-lint-ignore no-console
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
  await main();
}
