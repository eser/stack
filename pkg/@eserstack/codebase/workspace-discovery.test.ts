// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as workspaceDiscovery from "./workspace-discovery.ts";

Deno.test("getPackageFiles leaves out tests, benches, private files and testdata", async () => {
  const root = await runtime.fs.makeTempDir({ prefix: "package-files-" });
  try {
    const files = [
      "mod.ts",
      "lib/util.ts",
      "lib/view.tsx",
      "mod.test.ts",
      "lib/view.test.tsx",
      "lib/util.bench.ts",
      "legacy_test.ts",
      "legacy_bench.ts",
      "_private.ts",
      "testdata/fixture.ts",
    ];
    await runtime.fs.mkdir(runtime.path.join(root, "lib"), { recursive: true });
    await runtime.fs.mkdir(runtime.path.join(root, "testdata"), {
      recursive: true,
    });
    await Promise.all(
      files.map((file) =>
        runtime.fs.writeTextFile(runtime.path.join(root, file), "export {};\n")
      ),
    );

    const found = await workspaceDiscovery.getPackageFiles(root);

    assert.assertEquals(
      found.map((file) => file.replaceAll("\\", "/")),
      ["./lib/util.ts", "./lib/view.tsx", "./mod.ts"],
    );
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});
