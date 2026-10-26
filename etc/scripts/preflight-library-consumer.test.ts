// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// etc/scripts belongs to no workspace package; the root package.json lists
// @eserstack/test-kit, so it resolves from the root node_modules.
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as consumer from "./preflight-library-consumer.ts";

nodeTest.test("parseOptions: defaults, both forms, and errors", () => {
  assert.assertEquals(consumer.parseOptions([]), {
    packageName: "@eserstack/primitives",
    packsDir: "etc/temp/npm-packs",
  });
  assert.assertEquals(
    consumer.parseOptions(["--package", "@eserstack/fp", "--packs=out/packs"]),
    { packageName: "@eserstack/fp", packsDir: "out/packs" },
  );
  assert.assertThrows(() => consumer.parseOptions(["--package"]));
  assert.assertThrows(() => consumer.parseOptions(["--verbose"]));
});

nodeTest.test("tarballName: the name pnpm pack writes", () => {
  assert.assertEquals(
    consumer.tarballName("@eserstack/primitives", "5.0.0"),
    "eserstack-primitives-5.0.0.tgz",
  );
});

nodeTest.test("exportSpecifiers: one specifier per sub-path", () => {
  assert.assertEquals(
    consumer.exportSpecifiers("@eserstack/x", {
      ".": "./mod.ts",
      "./results": "./results.ts",
    }),
    ["@eserstack/x", "@eserstack/x/results"],
  );
  assert.assertEquals(
    consumer.exportSpecifiers("@eserstack/cli", "./main.ts"),
    ["@eserstack/cli"],
  );
});

nodeTest.test("typeCheckSource: imports every specifier as a type", () => {
  assert.assertEquals(
    consumer.typeCheckSource(["@eserstack/x", "@eserstack/x/y"]),
    [
      'import type * as module0 from "@eserstack/x";',
      'import type * as module1 from "@eserstack/x/y";',
      "",
      "export type Modules = [typeof module0, typeof module1];",
      "",
    ].join("\n"),
  );
});
