// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The esbuild externals list is duplicated across three npm builds that never
 * import each other.
 *
 * `cli`, `noskills` and `laroux-server` each bundle a different entry point out
 * of the same workspace, so each one can reach `@eserstack/ajan` — and through
 * it `ffi/backend-bun.ts`, which imports `bun:ffi`, a Bun-only builtin that
 * exists in no registry and cannot be resolved by esbuild.
 *
 * When only `cli` carried the full list, the other two bundled fine in review
 * and failed in the release pipeline: `noskills` broke the v4.3.0 run at the
 * npm smoke test, after the tag had already been pushed.
 *
 * @module
 */

import { assertEquals } from "@std/assert";

const repoRoot = new URL("../../../../", import.meta.url);

const BUILDS = [
  "pkg/@eserstack/cli/scripts/npm-build.ts",
  "pkg/@eserstack/noskills/scripts/npm-build.ts",
  "pkg/@eserstack/laroux-server/scripts/npm-build.ts",
] as const;

/**
 * Reads the EXTERNAL_PACKAGES array literal.
 *
 * Parsed from the array body rather than searched for across the file: every
 * one of these names also appears in prose in the surrounding comments, so a
 * substring check passes even when the entry has been dropped from the list
 * that actually reaches esbuild.
 */
const readExternals = async (relative: string): Promise<string[]> => {
  const source = await Deno.readTextFile(new URL(relative, repoRoot));
  const match = source.match(/const EXTERNAL_PACKAGES\s*=\s*\[([\s\S]*?)\];/);

  if (match?.[1] === undefined) {
    throw new Error(`${relative}: no EXTERNAL_PACKAGES array found`);
  }

  // Strip comments first — they quote these same package names.
  const body = match[1].replaceAll(/\/\/[^\n]*/g, "");

  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!).sort();
};

Deno.test("every npm build marks the FFI packages external", async () => {
  const lists = await Promise.all(BUILDS.map(readExternals));

  // bun:ffi is the one that actually breaks the build; @eserstack/ajan is what
  // leads esbuild to it, since the ajan-* glob does not match the bare name.
  for (const [i, list] of lists.entries()) {
    assertEquals(
      list.includes("bun:ffi"),
      true,
      `${BUILDS[i]} must mark "bun:ffi" external`,
    );
    assertEquals(
      list.includes("@eserstack/ajan"),
      true,
      `${BUILDS[i]} must mark "@eserstack/ajan" external`,
    );
  }
});

Deno.test("all three npm builds share one externals list", async () => {
  const [cli, ...rest] = await Promise.all(BUILDS.map(readExternals));

  for (const [i, list] of rest.entries()) {
    assertEquals(
      list,
      cli,
      `${BUILDS[i + 1]} drifted from ${BUILDS[0]}`,
    );
  }
});
