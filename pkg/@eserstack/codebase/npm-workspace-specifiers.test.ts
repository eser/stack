// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as npmWorkspaceSpecifiers from "./npm-workspace-specifiers.ts";

nodeTest.test(
  "resolveWorkspaceSpecifiers: mirrors what pnpm publish emits",
  () => {
    const resolved = npmWorkspaceSpecifiers.resolveWorkspaceSpecifiers(
      {
        "@eserstack/ajan-darwin-arm64": "workspace:*",
        "@eserstack/ajan-wasm": "workspace:^",
        "@eserstack/standards": "workspace:~",
        "@eserstack/kit": "workspace:>=4.0.0",
        koffi: "^3.3.0",
      },
      "4.5.2",
    );

    assert.assertEquals(resolved, {
      "@eserstack/ajan-darwin-arm64": "4.5.2",
      "@eserstack/ajan-wasm": "^4.5.2",
      "@eserstack/standards": "~4.5.2",
      "@eserstack/kit": ">=4.0.0",
      koffi: "^3.3.0",
    });
  },
);

nodeTest.test("resolveWorkspaceSpecifiers: absent input stays absent", () => {
  assert.assertEquals(
    npmWorkspaceSpecifiers.resolveWorkspaceSpecifiers(undefined, "4.5.2"),
    undefined,
  );
});

nodeTest.test("resolveWorkspaceSpecifiers: does not mutate its input", () => {
  const input = { "@eserstack/ajan-darwin-arm64": "workspace:*" };
  npmWorkspaceSpecifiers.resolveWorkspaceSpecifiers(input, "4.5.2");
  assert.assertEquals(input["@eserstack/ajan-darwin-arm64"], "workspace:*");
});
