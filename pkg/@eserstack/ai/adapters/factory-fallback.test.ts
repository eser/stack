// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import { defaultFactories, tsFactoryFor } from "./mod.ts";

// The pure-TypeScript adapters are what a machine with no usable native binary
// gets. Without a direct test they are invisible: on any machine where the
// bridge loads it answers first, so a provider missing from the lazy loader
// table passes every other assertion.
//
// tsFactoryFor is used rather than disabling FFI through the environment —
// Deno.env.set mutates the whole process, so a test that did that would silently
// break every other FFI test file alongside it.

Deno.test("every provider has a pure-TypeScript fallback", async () => {
  const providers = (await defaultFactories()).map((factory) =>
    factory.provider
  );

  assert(providers.length > 0, "defaultFactories returned nothing");

  for (const provider of providers) {
    const factory = await tsFactoryFor(provider);

    assert(
      factory !== undefined,
      `${provider} has no pure-TypeScript fallback`,
    );
    assertEquals(factory.provider, provider);
  }
});

Deno.test("tsFactoryFor is undefined for an unknown provider", async () => {
  assertEquals(await tsFactoryFor("nonesuch"), undefined);
});
