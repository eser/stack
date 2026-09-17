// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { resolveWorkspaceSpecifiers } from "./npm-workspace-specifiers.ts";

Deno.test("resolveWorkspaceSpecifiers: mirrors what pnpm publish emits", () => {
  const resolved = resolveWorkspaceSpecifiers(
    {
      "@eserstack/ajan-darwin-arm64": "workspace:*",
      "@eserstack/ajan-wasm": "workspace:^",
      "@eserstack/standards": "workspace:~",
      "@eserstack/kit": "workspace:>=4.0.0",
      "koffi": "^3.3.0",
    },
    "4.5.2",
  );

  assertEquals(resolved, {
    "@eserstack/ajan-darwin-arm64": "4.5.2",
    "@eserstack/ajan-wasm": "^4.5.2",
    "@eserstack/standards": "~4.5.2",
    "@eserstack/kit": ">=4.0.0",
    "koffi": "^3.3.0",
  });
});

Deno.test("resolveWorkspaceSpecifiers: absent input stays absent", () => {
  assertEquals(resolveWorkspaceSpecifiers(undefined, "4.5.2"), undefined);
});

Deno.test("resolveWorkspaceSpecifiers: does not mutate its input", () => {
  const input = { "@eserstack/ajan-darwin-arm64": "workspace:*" };
  resolveWorkspaceSpecifiers(input, "4.5.2");
  assertEquals(input["@eserstack/ajan-darwin-arm64"], "workspace:*");
});
