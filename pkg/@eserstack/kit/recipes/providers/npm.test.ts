// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "@std/testing/bdd";
import * as npm from "./npm.ts";

bdd.describe("npm provider — parse", () => {
  bdd.it("accepts bare package name", () => {
    const parsed = npm.provider.parse("npm:create-vite");
    assert.assertEquals(parsed.providerName, "npm");
    assert.assertEquals(parsed.specifier, "npm:create-vite");
  });

  bdd.it("accepts scoped package", () => {
    const parsed = npm.provider.parse("npm:@scope/pkg");
    assert.assertEquals(parsed.providerName, "npm");
  });

  bdd.it("accepts versioned package", () => {
    const parsed = npm.provider.parse("npm:create-vite@5.0.0");
    assert.assertEquals(parsed.providerName, "npm");
  });

  bdd.it("throws on empty npm: specifier", () => {
    assert.assertThrows(() => npm.provider.parse("npm:"), Error);
  });
});

bdd.describe("npm provider — fetch", () => {
  bdd.it("throws not-yet-implemented error with tracking URL", () => {
    const parsed = npm.provider.parse("npm:create-vite");
    assert.assertThrows(
      () => npm.provider.fetch(parsed),
      Error,
      "not yet implemented",
    );
  });
});
