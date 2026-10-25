// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as adapters from "./mod.ts";

// The pure-TypeScript adapters are what a machine with no usable native binary
// gets. Without a direct test they are invisible: on any machine where the
// bridge loads it answers first, so a provider missing from the lazy loader
// table passes every other assertion.
//
// tsFactoryFor is used rather than disabling FFI through the environment —
// Deno.env.set mutates the whole process, so a test that did that would silently
// break every other FFI test file alongside it.

Deno.test("every provider has a pure-TypeScript fallback", async () => {
  const providers = (await adapters.defaultFactories()).map((factory) =>
    factory.provider
  );

  assert.assert(providers.length > 0, "defaultFactories returned nothing");

  const factories = await Promise.all(
    providers.map((provider) => adapters.tsFactoryFor(provider)),
  );

  for (const [index, provider] of providers.entries()) {
    const factory = factories[index];

    assert.assert(
      factory !== undefined,
      `${provider} has no pure-TypeScript fallback`,
    );
    assert.assertEquals(factory.provider, provider);
  }
});

Deno.test("tsFactoryFor is undefined for an unknown provider", async () => {
  assert.assertEquals(await adapters.tsFactoryFor("nonesuch"), undefined);
});

// A provider name comes from the command line. Looked up on a plain object,
// "constructor" returned `{}` as a factory and "__proto__" threw a TypeError.
for (const provider of ["constructor", "toString", "__proto__"]) {
  Deno.test(`tsFactoryFor is undefined for "${provider}"`, async () => {
    assert.assertEquals(await adapters.tsFactoryFor(provider), undefined);
  });
}
