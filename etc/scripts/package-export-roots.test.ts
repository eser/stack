// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// etc/scripts belongs to no workspace package, so no import map resolves a
// bare "@std/assert"; the jsr: specifier carries the version range instead.
// The ignore goes once the root package.json lists @std/assert.
// deno-lint-ignore no-external-import
import * as assert from "jsr:@std/assert@^1.0.16";
import * as exportRoots from "./package-export-roots.ts";

Deno.test("exportTargets: reads the string form", () => {
  assert.assertEquals(exportRoots.exportTargets("./mod.ts"), ["./mod.ts"]);
});

Deno.test("exportTargets: reads sub-path and condition maps", () => {
  const targets = exportRoots.exportTargets({
    ".": "./main.ts",
    "./mod": "./mod.ts",
    "./node": { import: "./node.mjs", types: "./node.d.ts" },
  });

  assert.assertEquals(targets, [
    "./main.ts",
    "./mod.ts",
    "./node.mjs",
    "./node.d.ts",
  ]);
});

Deno.test("exportTargets: ignores missing and malformed fields", () => {
  assert.assertEquals(exportRoots.exportTargets(undefined), []);
  assert.assertEquals(exportRoots.exportTargets(null), []);
  assert.assertEquals(exportRoots.exportTargets(["./mod.ts"]), []);
});
