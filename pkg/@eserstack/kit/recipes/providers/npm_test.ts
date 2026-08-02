// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { provider } from "./npm.ts";

describe("npm provider — parse", () => {
  it("accepts bare package name", () => {
    const parsed = provider.parse("npm:create-vite");
    assert.assertEquals(parsed.providerName, "npm");
    assert.assertEquals(parsed.specifier, "npm:create-vite");
  });

  it("accepts scoped package", () => {
    const parsed = provider.parse("npm:@scope/pkg");
    assert.assertEquals(parsed.providerName, "npm");
  });

  it("accepts versioned package", () => {
    const parsed = provider.parse("npm:create-vite@5.0.0");
    assert.assertEquals(parsed.providerName, "npm");
  });

  it("throws on empty npm: specifier", () => {
    assert.assertThrows(
      () => provider.parse("npm:"),
      Error,
    );
  });
});

describe("npm provider — fetch", () => {
  it("throws not-yet-implemented error with tracking URL", () => {
    const parsed = provider.parse("npm:create-vite");
    assert.assertThrows(
      () => provider.fetch(parsed),
      Error,
      "not yet implemented",
    );
  });
});
