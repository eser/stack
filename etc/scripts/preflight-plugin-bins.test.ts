// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// etc/scripts belongs to no workspace package; the root package.json lists
// @eserstack/test-kit, so it resolves from the root node_modules.
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as pluginBins from "./preflight-plugin-bins.ts";

nodeTest.test("parseMode: check by default, save-bundles on request", () => {
  assert.assertEquals(pluginBins.parseMode([]), "check");
  assert.assertEquals(pluginBins.parseMode(["--save-bundles"]), "save-bundles");
  assert.assertThrows(() => pluginBins.parseMode(["--verbose"]));
});

nodeTest.test(
  "workspaceClosure: the package and its @eserstack dependencies",
  () => {
    const manifests = new Map<string, pluginBins.WorkspaceManifest>([
      [
        "@eserstack/posts",
        {
          dependencies: {
            "@eserstack/shell": "workspace:*",
            "@eserstack/primitives": "workspace:*",
            yaml: "^2.9.1",
          },
          devDependencies: { "@eserstack/test-kit": "workspace:*" },
          optionalDependencies: { "@eserstack/ajan-wasm": "workspace:*" },
        },
      ],
      [
        "@eserstack/shell",
        { dependencies: { "@eserstack/primitives": "workspace:*" } },
      ],
      ["@eserstack/primitives", {}],
    ]);

    assert.assertEquals(
      pluginBins.workspaceClosure("@eserstack/posts", manifests),
      ["@eserstack/posts", "@eserstack/primitives", "@eserstack/shell"],
    );
  },
);

nodeTest.test("workspaceClosure: fails on an unknown workspace name", () => {
  const manifests = new Map<string, pluginBins.WorkspaceManifest>([
    [
      "@eserstack/posts",
      { dependencies: { "@eserstack/missing": "workspace:*" } },
    ],
  ]);

  assert.assertThrows(
    () => pluginBins.workspaceClosure("@eserstack/posts", manifests),
    Error,
    "@eserstack/missing",
  );
});

nodeTest.test("hostPlatformPackage: the name npm selects for a host", () => {
  assert.assertEquals(
    pluginBins.hostPlatformPackage("noskills", "darwin", "arm64"),
    "@eserstack/noskills-darwin-arm64",
  );
  assert.assertEquals(
    pluginBins.hostPlatformPackage("noskills", "windows", "amd64"),
    "@eserstack/noskills-win32-x64",
  );
  assert.assertEquals(
    pluginBins.hostPlatformPackage("noskills", "linux", "amd64"),
    "@eserstack/noskills-linux-x64",
  );
});
