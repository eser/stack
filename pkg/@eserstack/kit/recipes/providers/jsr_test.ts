// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { provider } from "./jsr.ts";

describe("jsr provider — parse", () => {
  it("accepts scoped package", () => {
    const parsed = provider.parse("jsr:@eser/kit");
    assert.assertEquals(parsed.providerName, "jsr");
    assert.assertEquals(parsed.specifier, "jsr:@eser/kit");
  });

  it("accepts versioned scoped package", () => {
    const parsed = provider.parse("jsr:@eser/kit@4.0.0");
    assert.assertEquals(parsed.providerName, "jsr");
  });

  it("throws when missing scope (@)", () => {
    assert.assertThrows(
      () => provider.parse("jsr:nokscope"),
      Error,
      "jsr:",
    );
  });

  it("throws on empty jsr: specifier", () => {
    assert.assertThrows(
      () => provider.parse("jsr:"),
      Error,
    );
  });
});

describe("jsr provider — fetch", () => {
  it("throws not-yet-implemented error with tracking URL", () => {
    const parsed = provider.parse("jsr:@eser/kit");
    assert.assertThrows(
      () => provider.fetch(parsed),
      Error,
      "not yet implemented",
    );
  });
});
