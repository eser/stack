// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// etc/scripts belongs to no workspace package; the root package.json lists
// @eserstack/test-kit, so it resolves from the root node_modules.
import * as assert from "@eserstack/test-kit/assert";
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
