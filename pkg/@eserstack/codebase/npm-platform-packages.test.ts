// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { pinPlatformPackages } from "./npm-platform-packages.ts";

Deno.test("pinPlatformPackages: every ajan platform package gets the exact version", () => {
  const pinned = pinPlatformPackages(
    {
      "@eserstack/ajan-darwin-arm64": "^4.1.57 || ^5.0.0",
      "@eserstack/ajan-linux-x64": "^4.1.0 || ^5.0.0",
      "@eserstack/ajan-wasm": "^4.1.57 || ^5.0.0",
      "fsevents": "^2.3.0",
    },
    "4.5.2",
  );

  assertEquals(pinned, {
    "@eserstack/ajan-darwin-arm64": "4.5.2",
    "@eserstack/ajan-linux-x64": "4.5.2",
    "@eserstack/ajan-wasm": "4.5.2",
    "fsevents": "^2.3.0",
  });
});

Deno.test("pinPlatformPackages: absent optionalDependencies stay absent", () => {
  assertEquals(pinPlatformPackages(undefined, "4.5.2"), undefined);
});

Deno.test("pinPlatformPackages: does not mutate its input", () => {
  const input = { "@eserstack/ajan-darwin-arm64": "^4.1.57" };
  pinPlatformPackages(input, "4.5.2");
  assertEquals(input["@eserstack/ajan-darwin-arm64"], "^4.1.57");
});
