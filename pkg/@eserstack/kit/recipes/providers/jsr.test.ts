// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "node:test";
import * as jsr from "./jsr.ts";

bdd.describe("jsr provider — parse", () => {
  bdd.it("accepts scoped package", () => {
    const parsed = jsr.provider.parse("jsr:@eser/kit");
    assert.assertEquals(parsed.providerName, "jsr");
    assert.assertEquals(parsed.specifier, "jsr:@eser/kit");
  });

  bdd.it("accepts versioned scoped package", () => {
    const parsed = jsr.provider.parse("jsr:@eser/kit@4.0.0");
    assert.assertEquals(parsed.providerName, "jsr");
  });

  bdd.it("throws when missing scope (@)", () => {
    assert.assertThrows(
      () => jsr.provider.parse("jsr:nokscope"),
      Error,
      "jsr:",
    );
  });

  bdd.it("throws on empty jsr: specifier", () => {
    assert.assertThrows(() => jsr.provider.parse("jsr:"), Error);
  });
});

bdd.describe("jsr provider — fetch", () => {
  bdd.it("throws not-yet-implemented error with tracking URL", () => {
    const parsed = jsr.provider.parse("jsr:@eser/kit");
    assert.assertThrows(
      () => jsr.provider.fetch(parsed),
      Error,
      "not yet implemented",
    );
  });
});
