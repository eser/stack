// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "node:test";
import * as providers from "./mod.ts";

bdd.describe("resolveProvider", () => {
  bdd.it("resolves gh:, github: and bare owner/repo to github", () => {
    assert.assertEquals(
      providers.resolveProvider("gh:eser/stack").name,
      "github",
    );
    assert.assertEquals(
      providers.resolveProvider("github:eser/stack").name,
      "github",
    );
    assert.assertEquals(providers.resolveProvider("eser/stack").name, "github");
  });

  bdd.it("resolves npm: to npm", () => {
    assert.assertEquals(
      providers.resolveProvider("npm:create-vite").name,
      "npm",
    );
  });

  bdd.it("rejects jsr: as an unknown scheme", () => {
    assert.assertThrows(
      () => providers.resolveProvider("jsr:@eserstack/kit"),
      Error,
      "Unknown specifier scheme: jsr:@eserstack/kit",
    );
  });
});
