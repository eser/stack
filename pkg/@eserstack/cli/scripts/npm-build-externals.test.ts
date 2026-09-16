// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The esbuild externals list is shared by three npm builds that never import
 * each other.
 *
 * `cli`, `noskills` and `laroux-server` each bundle a different entry point out
 * of the same workspace, so each one can reach `@eserstack/ajan` — and through
 * it `ffi/backend-bun.ts`, which imports `bun:ffi`, a Bun-only builtin that
 * exists in no registry and cannot be resolved by esbuild.
 *
 * The list used to be copied into each builder and the copies drifted:
 * `noskills` broke the v4.3.0 run at the npm smoke test. It now lives in
 * `@eserstack/codebase/npm-externals`; these tests pin that every builder
 * really reads it (a local array literal is drift waiting to happen) and that
 * the shared list keeps the entries the bundles cannot live without.
 *
 * @module
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { NPM_EXTERNAL_PACKAGES } from "@eserstack/codebase/npm-externals";

const repoRoot = new URL("../../../../", import.meta.url);

const BUILDS = [
  "pkg/@eserstack/cli/scripts/npm-build.ts",
  "pkg/@eserstack/noskills/scripts/npm-build.ts",
  "pkg/@eserstack/laroux-server/scripts/npm-build.ts",
] as const;

const SHARED_IMPORT =
  'import { NPM_EXTERNAL_PACKAGES } from "@eserstack/codebase/npm-externals";';

/** Comments quote package names in prose, so strip them before any search. */
const stripComments = (source: string): string =>
  source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/[^\n]*/g, "");

Deno.test("every npm build reads the shared externals list", async () => {
  for (const relative of BUILDS) {
    const source = await Deno.readTextFile(new URL(relative, repoRoot));

    assertStringIncludes(
      source,
      SHARED_IMPORT,
      `${relative} must import NPM_EXTERNAL_PACKAGES from @eserstack/codebase/npm-externals`,
    );

    const code = stripComments(source);
    assertEquals(
      /const EXTERNAL_PACKAGES\s*=\s*\[/.test(code),
      false,
      `${relative} carries a local externals array — that is the drift the shared module exists to prevent`,
    );
    assertEquals(
      /external:\s*\[\.\.\.EXTERNAL_PACKAGES/.test(code),
      true,
      `${relative} must pass EXTERNAL_PACKAGES to esbuild`,
    );
  }
});

Deno.test("the shared externals list keeps the FFI builtins external and bundles @eserstack/ajan", () => {
  const list = [...NPM_EXTERNAL_PACKAGES];

  // bun:ffi is the one that actually breaks the build: it is a Bun-only builtin
  // that esbuild cannot resolve. @eserstack/ajan is the opposite case -- it is
  // published to JSR only, so leaving it external makes the npm package
  // uninstallable (404 on the dependency) and, because every ffi-client.ts now
  // imports the shared loader statically, unloadable even from a link install.
  for (const required of ["bun:ffi", "koffi", "@eserstack/ajan-*"]) {
    assertEquals(
      list.includes(required),
      true,
      `"${required}" must stay external`,
    );
  }

  assertEquals(
    list.includes("@eserstack/ajan"),
    false,
    '"@eserstack/ajan" must be bundled -- it is not on npm',
  );
});
