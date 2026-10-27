// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// etc/scripts belongs to no workspace package; the root package.json lists
// @eserstack/test-kit, so it resolves from the root node_modules.
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as publish from "./publish-libraries.ts";

nodeTest.test("parseOptions: --dry-run, nothing else", () => {
  assert.assertEquals(publish.parseOptions([]), { dryRun: false });
  assert.assertEquals(publish.parseOptions(["--dry-run"]), { dryRun: true });
  assert.assertThrows(() => publish.parseOptions(["--force"]));
});

nodeTest.test(
  "selectLibraries: non-private packages with exports, by name",
  () => {
    assert.assertEquals(
      publish.selectLibraries([
        { name: "@eserstack/standards", version: "5.0.0", exports: "./mod.ts" },
        {
          name: "@eserstack/test-kit",
          version: "5.0.0",
          private: true,
          exports: "./mod.ts",
        },
        { name: "@eserstack/ajan-wasm", version: "5.0.0" },
        {
          name: "@eserstack/fp",
          version: "5.0.0",
          exports: { ".": "./mod.ts" },
        },
      ]),
      [
        { name: "@eserstack/fp", version: "5.0.0" },
        { name: "@eserstack/standards", version: "5.0.0" },
      ],
    );
  },
);

nodeTest.test("isPublished: npm view exits 0 and prints the version", () => {
  const library = { name: "@eserstack/fp", version: "5.0.0" };

  assert.assertEquals(
    publish.isPublished(library, { success: true, stdout: "5.0.0\n" }),
    true,
  );
  assert.assertEquals(
    publish.isPublished(library, { success: false, stdout: "" }),
    false,
  );
  assert.assertEquals(
    publish.isPublished(library, { success: true, stdout: "" }),
    false,
  );
});

const LIBRARIES = [
  { name: "@eserstack/fp", version: "5.0.0" },
  { name: "@eserstack/laroux", version: "5.0.0" },
];

nodeTest.test("publishArgs: one filtered recursive publish", () => {
  assert.assertEquals(publish.publishArgs(LIBRARIES, false), [
    "-r",
    "--filter",
    "@eserstack/fp",
    "--filter",
    "@eserstack/laroux",
    "publish",
    "--provenance",
    "--access",
    "public",
    "--no-git-checks",
  ]);
});

nodeTest.test(
  "publishArgs: a dry run asks no registry for @eserstack names",
  () => {
    const args = publish.publishArgs(LIBRARIES, true);

    assert.assertEquals(args.slice(-3), [
      "--dry-run",
      "--force",
      "--config.@eserstack:registry=http://127.0.0.1:9/",
    ]);
  },
);

nodeTest.test("missingFromOutput: the libraries pnpm never named", () => {
  assert.assertEquals(
    publish.missingFromOutput(
      LIBRARIES,
      "📦 @eserstack/fp@5.0.0 → http://127.0.0.1:9/\n" +
        "📦 @eserstack/laroux-react@5.0.0 → http://127.0.0.1:9/\n",
    ),
    [{ name: "@eserstack/laroux", version: "5.0.0" }],
  );
});
